"""SECTION 2.2 — Spark SQL feature engineering.

Reads the clean `fact_sales` / dimension tables written by ingest_and_clean.py and builds
two feature tables used by both the Spark MLlib job (spark_mllib_models.py) AND the
independent Python/XGBoost pipeline (python_pipeline/train_python_models.py), so both
pipelines start from the SAME feature definitions and only diverge in the modeling
library — which is what makes the later dual-pipeline agreement comparison meaningful.

Feature tables written to processed_data/clean_parquet/:
  - menu_item_features  : one row per MenuItemId — RFM-style recency/frequency/monetary
                           on the item's sales, margin %, wastage %, price elasticity proxy,
                           rating trend, and the MenuPerformanceClass label (Star/Plow
                           Horse/Puzzle/Dog, the BCG-style menu-engineering quadrant used
                           as the classification target).
  - customer_features   : one row per CustomerId — classic RFM (Recency/Frequency/
                           Monetary), average order value, churn label (no order in the
                           last 60 days of the observed history), used by the churn model.
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F
from pyspark.sql.window import Window

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import settings  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s  %(message)s")
log = logging.getLogger("feature_engineering")

CLEAN_DIR = settings.PROCESSED_DATA_DIR / "clean_parquet"
CHURN_WINDOW_DAYS = 60


def build_spark_session() -> SparkSession:
    return (
        SparkSession.builder.appName("DineIQ-FeatureEngineering")
        .master("local[*]")
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.sql.shuffle.partitions", "8")
        .config("spark.driver.memory", "3g")
        .getOrCreate()
    )


def read_clean(spark: SparkSession, name: str) -> DataFrame:
    path = CLEAN_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"{path} not found — run spark_jobs/ingest_and_clean.py first.")
    return spark.read.parquet(str(path))


def build_menu_item_features(spark: SparkSession) -> DataFrame:
    fact_sales = read_clean(spark, "fact_sales")
    wastage = read_clean(spark, "wastage")
    ratings = read_clean(spark, "ratings")
    menu_items = read_clean(spark, "menu_items")

    max_date = fact_sales.agg(F.max("OrderDate")).first()[0]

    agg = fact_sales.groupBy("MenuItemId", "MenuItemName", "CategoryId", "CategoryName").agg(
        F.countDistinct("OrderId").alias("OrderCount"),
        F.sum("Quantity").alias("TotalQuantitySold"),
        F.sum("LineTotal").alias("TotalRevenue"),
        F.sum("LineCost").alias("TotalCost"),
        F.sum("LineMargin").alias("TotalMargin"),
        F.avg("UnitPrice").alias("AvgSellingPrice"),
        F.max("OrderDate").alias("LastSoldDate"),
        F.countDistinct(F.when(F.col("PromotionId").isNotNull(), F.col("OrderId"))).alias("PromotedOrderCount"),
        F.avg(F.when(F.col("IsTrapPromotion") == True, F.col("LineMargin"))).alias("AvgMarginOnTrapPromo"),  # noqa: E712
    )
    agg = agg.withColumn("MarginPercent", F.round(F.col("TotalMargin") / F.col("TotalRevenue") * 100, 2))
    agg = agg.withColumn("RecencyDays", F.datediff(F.lit(max_date), F.col("LastSoldDate")))

    prepared = wastage.groupBy("MenuItemId").agg(F.sum("QuantityWasted").alias("TotalWasted"))
    agg = agg.join(prepared, "MenuItemId", "left").fillna({"TotalWasted": 0})
    agg = agg.withColumn(
        "WastagePercent",
        F.round(F.col("TotalWasted") / (F.col("TotalQuantitySold") + F.col("TotalWasted") + F.lit(1e-6)) * 100, 2),
    )

    rating_agg = ratings.groupBy("MenuItemId").agg(
        F.avg("Score").alias("AvgRating"),
        F.count("RatingId").alias("RatingCount"),
    )
    early_cut = ratings.agg(F.expr("percentile_approx(RatingDate, 0.5)")).first()[0]
    rating_trend = ratings.groupBy("MenuItemId").agg(
        F.avg(F.when(F.col("RatingDate") < F.lit(early_cut), F.col("Score"))).alias("EarlyAvgRating"),
        F.avg(F.when(F.col("RatingDate") >= F.lit(early_cut), F.col("Score"))).alias("RecentAvgRating"),
    )
    agg = agg.join(rating_agg, "MenuItemId", "left").join(rating_trend, "MenuItemId", "left")
    agg = agg.withColumn("RatingTrendDelta", F.round(F.col("RecentAvgRating") - F.col("EarlyAvgRating"), 3))

    # Price-elasticity proxy: correlate each item's historical price changes (pricing_history)
    # against the resulting monthly quantity sold, giving a single elasticity coefficient.
    pricing_history = read_clean(spark, "pricing_history")
    monthly_qty = fact_sales.withColumn("YearMonth", F.date_format("OrderDate", "yyyy-MM")).groupBy(
        "MenuItemId", "YearMonth"
    ).agg(F.sum("Quantity").alias("MonthlyQty"), F.avg("UnitPrice").alias("MonthlyAvgPrice"))
    elasticity = monthly_qty.groupBy("MenuItemId").agg(
        F.corr("MonthlyAvgPrice", "MonthlyQty").alias("PriceQuantityCorrelation")
    )
    agg = agg.join(elasticity, "MenuItemId", "left")

    # Popularity vs. profitability quadrant -> classic BCG menu-engineering classes.
    pop_threshold = agg.approxQuantile("TotalQuantitySold", [0.5], 0.01)[0]
    margin_threshold = agg.approxQuantile("MarginPercent", [0.5], 0.01)[0]
    agg = agg.withColumn(
        "MenuPerformanceClass",
        F.when((F.col("TotalQuantitySold") >= pop_threshold) & (F.col("MarginPercent") >= margin_threshold), "Star")
        .when((F.col("TotalQuantitySold") >= pop_threshold) & (F.col("MarginPercent") < margin_threshold), "PlowHorse")
        .when((F.col("TotalQuantitySold") < pop_threshold) & (F.col("MarginPercent") >= margin_threshold), "Puzzle")
        .otherwise("Dog"),
    )
    agg = agg.join(menu_items.select(F.col("Id").alias("MenuItemId"), F.col("Price").alias("CatalogPrice")), "MenuItemId", "left")
    return agg.fillna(0.0, subset=["RatingTrendDelta", "PriceQuantityCorrelation", "AvgMarginOnTrapPromo"])


def build_customer_features(spark: SparkSession) -> DataFrame:
    fact_sales = read_clean(spark, "fact_sales")
    orders = read_clean(spark, "orders")
    max_date = orders.agg(F.max("OrderDate")).first()[0]

    order_level = fact_sales.groupBy("OrderId", "CustomerId", "OrderDate").agg(F.sum("LineTotal").alias("OrderValue"))
    rfm = order_level.where("CustomerId != -1").groupBy("CustomerId").agg(
        F.datediff(F.lit(max_date), F.max("OrderDate")).alias("RecencyDays"),
        F.countDistinct("OrderId").alias("Frequency"),
        F.sum("OrderValue").alias("Monetary"),
        F.avg("OrderValue").alias("AvgOrderValue"),
        F.min("OrderDate").alias("FirstOrderDate"),
        F.max("OrderDate").alias("LastOrderDate"),
    )
    rfm = rfm.withColumn("TenureDays", F.datediff(F.lit(max_date), F.col("FirstOrderDate")))
    rfm = rfm.withColumn("ChurnRisk", (F.col("RecencyDays") > CHURN_WINDOW_DAYS).cast("int"))

    fav_category = (
        fact_sales.where("CustomerId != -1")
        .groupBy("CustomerId", "CategoryName")
        .agg(F.sum("LineTotal").alias("CategorySpend"))
        .withColumn("_rn", F.row_number().over(Window.partitionBy("CustomerId").orderBy(F.desc("CategorySpend"))))
        .where("_rn = 1")
        .select("CustomerId", F.col("CategoryName").alias("FavoriteCategory"))
    )
    return rfm.join(fav_category, "CustomerId", "left")


def build_menu_item_monthly_demand(spark: SparkSession) -> DataFrame:
    """Per-item, per-month demand series with a next-month-quantity label, so the demand
    regressor can be trained with a genuine chronological split (SRS Step 21: training
    data must represent earlier periods, test data must represent later unseen periods --
    a random row split over menu_item_features cannot satisfy this, since that table has
    no time dimension at all: one row per item, aggregated over the whole history).

    Each row's features describe a given month; its label is that item's *following*
    month's quantity sold, so no row's label depends on information from its own or a
    later period than what a real forecaster would have available.
    """
    fact_sales = read_clean(spark, "fact_sales")
    ratings = read_clean(spark, "ratings")

    monthly = (
        fact_sales.withColumn("YearMonth", F.date_format("OrderDate", "yyyy-MM"))
        .groupBy("MenuItemId", "MenuItemName", "YearMonth")
        .agg(
            F.sum("Quantity").alias("QuantitySold"),
            F.sum("LineTotal").alias("Revenue"),
            F.sum("LineMargin").alias("Margin"),
            F.avg("UnitPrice").alias("AvgSellingPrice"),
            F.countDistinct(F.when(F.col("PromotionId").isNotNull(), F.col("OrderId"))).alias("PromotedOrderCount"),
        )
    )
    monthly = monthly.withColumn("MarginPercent", F.round(F.col("Margin") / F.col("Revenue") * 100, 2))

    monthly_ratings = (
        ratings.withColumn("YearMonth", F.date_format("RatingDate", "yyyy-MM"))
        .groupBy("MenuItemId", "YearMonth")
        .agg(F.avg("Score").alias("AvgRating"), F.count("RatingId").alias("RatingCount"))
    )
    monthly = monthly.join(monthly_ratings, ["MenuItemId", "YearMonth"], "left")
    monthly = monthly.fillna({"AvgRating": 0.0, "RatingCount": 0})

    # This month's features predict NEXT month's quantity (F.lead), never the reverse.
    w = Window.partitionBy("MenuItemId").orderBy("YearMonth")
    monthly = monthly.withColumn("NextMonthQuantitySold", F.lead("QuantitySold", 1).over(w))

    # The most recent month per item has no "next month" yet -- drop those unlabeled rows.
    return monthly.where(F.col("NextMonthQuantitySold").isNotNull())


def write_clean(df: DataFrame, name: str) -> None:
    out = CLEAN_DIR / name
    import shutil

    if out.exists():
        shutil.rmtree(out)
    df.write.mode("overwrite").parquet(str(out))
    log.info("Wrote feature table: %s (%d rows)", out, df.count())


def main() -> None:
    spark = build_spark_session()
    spark.sparkContext.setLogLevel("WARN")
    try:
        menu_features = build_menu_item_features(spark)
        write_clean(menu_features, "menu_item_features")

        customer_features = build_customer_features(spark)
        write_clean(customer_features, "customer_features")

        monthly_demand = build_menu_item_monthly_demand(spark)
        write_clean(monthly_demand, "menu_item_monthly_demand")

        log.info("Menu performance class distribution:")
        menu_features.groupBy("MenuPerformanceClass").count().show()
        log.info("Churn risk distribution:")
        customer_features.groupBy("ChurnRisk").count().show()
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
