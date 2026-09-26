"""SECTION 2.1 — Spark ingestion + Data Quality Assessment + cleaning.

Reads the raw Parquet written by data_pipeline/ingest_sql_data.py (which still contains
every injected anomaly), runs the Data Quality Assessment the SRS's Step 4 asks for
(counting, not silently ignoring, each problem class), applies the documented cleaning
rule for each one (Step 5), joins every table together with Spark SQL, and writes a
CLEAN, analysis-ready Parquet layer that every later script (feature engineering,
MLlib, the Python pipeline, the FastAPI dashboard) reads from.

Cleaning rules (each one is a deliberate, documented decision — not "drop everything"):
  - Missing CustomerId          -> kept, tagged CustomerId = -1 ("walk-in/unknown"),
                                    since a missing customer doesn't invalidate the sale.
  - Missing MenuItemId          -> the order line is unusable (no product to attribute
                                    revenue to) -> quarantined, not merged into the clean set.
  - Negative Quantity           -> sign error -> corrected by taking the absolute value
                                    (a negative quantity of a real purchase is a data-entry
                                    sign flip far more often than a genuine return in this
                                    dataset, which has no separate returns table).
  - Invalid Price (<= 0)        -> replaced with that item's catalog price at ingestion time.
  - Duplicate orders/lines      -> exact business-key duplicates -> the extra copies are
                                    dropped, keeping the first occurrence.
  - Invalid / out-of-range date -> quarantined (can't be safely corrected).
  - Discount > TotalAmount      -> capped at TotalAmount (can't discount more than the bill).
  - Impossible wastage quantity -> capped at that row's PreparedQuantity.

Every quarantined or corrected row is counted and written to a JSON Data Quality Report
under reports/, per the SRS's explicit requirement for one.

Usage:
    .venv-bigdata\\Scripts\\python -m spark_jobs.ingest_and_clean
"""
from __future__ import annotations

import json
import logging
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import settings  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s  %(message)s")
log = logging.getLogger("ingest_and_clean")

CLEAN_DIR = settings.PROCESSED_DATA_DIR / "clean_parquet"


def build_spark_session() -> SparkSession:
    return (
        SparkSession.builder.appName("DineIQ-Cleaning")
        .master("local[*]")
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.sql.shuffle.partitions", "8")
        .config("spark.driver.memory", "3g")
        .getOrCreate()
    )


def read_raw(spark: SparkSession, name: str) -> DataFrame:
    path = settings.PARQUET_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"{path} not found — run data_pipeline/ingest_sql_data.py first.")
    return spark.read.parquet(str(path))


@dataclass
class DataQualityReport:
    table: str
    total_rows_in: int
    missing_customer_id_tagged: int = 0
    missing_menu_item_id_quarantined: int = 0
    negative_quantity_corrected: int = 0
    invalid_price_corrected: int = 0
    duplicate_rows_dropped: int = 0
    invalid_date_quarantined: int = 0
    discount_over_total_capped: int = 0
    impossible_wastage_capped: int = 0
    total_rows_out_clean: int = 0
    total_rows_quarantined: int = 0


def assess_and_clean_orders(orders: DataFrame, history_start_str: str, history_end_str: str) -> tuple[DataFrame, DataFrame, DataQualityReport]:
    total_in = orders.count()
    report = DataQualityReport(table="orders", total_rows_in=total_in)

    tagged = orders.withColumn("_missing_customer", F.col("CustomerId").isNull())
    report.missing_customer_id_tagged = tagged.where("_missing_customer").count()
    tagged = tagged.withColumn("CustomerId", F.when(F.col("_missing_customer"), F.lit(-1)).otherwise(F.col("CustomerId")))

    invalid_date = ~F.col("OrderDate").between(F.lit(history_start_str), F.expr(f"date_add(to_date('{history_end_str}'), 1)"))
    tagged = tagged.withColumn("_invalid_date", invalid_date)
    report.invalid_date_quarantined = tagged.where("_invalid_date").count()

    bad_discount = F.col("Discount") > F.col("TotalAmount")
    report.discount_over_total_capped = tagged.where(bad_discount).count()
    tagged = tagged.withColumn("Discount", F.when(bad_discount, F.col("TotalAmount")).otherwise(F.col("Discount")))
    tagged = tagged.withColumn("NetAmount", F.round(F.col("TotalAmount") - F.col("Discount"), 2))

    business_key = ["CustomerId", "LocationId", "ChannelId", "OrderDate", "TotalAmount"]
    w_dupe = F.row_number().over(__import__("pyspark.sql.window", fromlist=["Window"]).Window.partitionBy(*business_key).orderBy("OrderId"))
    tagged = tagged.withColumn("_dupe_rank", w_dupe)
    report.duplicate_rows_dropped = tagged.where("_dupe_rank > 1").count()

    clean = tagged.where("_dupe_rank = 1 AND NOT _invalid_date").drop("_missing_customer", "_invalid_date", "_dupe_rank")
    quarantined = tagged.where("_dupe_rank = 1 AND _invalid_date").drop("_missing_customer", "_invalid_date", "_dupe_rank")

    report.total_rows_out_clean = clean.count()
    report.total_rows_quarantined = quarantined.count() + report.duplicate_rows_dropped
    return clean, quarantined, report


def assess_and_clean_order_lines(order_lines: DataFrame, menu_items: DataFrame) -> tuple[DataFrame, DataFrame, DataQualityReport]:
    total_in = order_lines.count()
    report = DataQualityReport(table="order_lines", total_rows_in=total_in)

    missing_item = order_lines.withColumn("_missing_item", F.col("MenuItemId").isNull())
    report.missing_menu_item_id_quarantined = missing_item.where("_missing_item").count()

    catalog_price = menu_items.select(F.col("Id").alias("MenuItemId"), F.col("Price").alias("CatalogPrice"))
    fixed = missing_item.join(F.broadcast(catalog_price), "MenuItemId", "left")

    neg_qty = F.col("Quantity") < 0
    report.negative_quantity_corrected = fixed.where(neg_qty).count()
    fixed = fixed.withColumn("Quantity", F.when(neg_qty, F.abs(F.col("Quantity"))).otherwise(F.col("Quantity")))

    bad_price = F.col("UnitPrice") <= 0
    report.invalid_price_corrected = fixed.where(bad_price).count()
    fixed = fixed.withColumn("UnitPrice", F.when(bad_price, F.col("CatalogPrice")).otherwise(F.col("UnitPrice")))
    fixed = fixed.withColumn("LineTotal", F.round(F.col("Quantity") * F.col("UnitPrice"), 2))

    w = __import__("pyspark.sql.window", fromlist=["Window"]).Window.partitionBy("OrderId", "MenuItemId", "Quantity", "UnitPrice").orderBy("OrderLineId")
    fixed = fixed.withColumn("_dupe_rank", F.row_number().over(w))
    report.duplicate_rows_dropped = fixed.where("_dupe_rank > 1").count()

    clean = fixed.where("_dupe_rank = 1 AND NOT _missing_item").drop("_missing_item", "_dupe_rank", "CatalogPrice")
    quarantined = fixed.where("_missing_item").drop("_missing_item", "_dupe_rank", "CatalogPrice")

    report.total_rows_out_clean = clean.count()
    report.total_rows_quarantined = quarantined.count() + report.duplicate_rows_dropped
    return clean, quarantined, report


def assess_and_clean_wastage(wastage: DataFrame, inventory: DataFrame) -> tuple[DataFrame, DataQualityReport]:
    total_in = wastage.count()
    report = DataQualityReport(table="wastage", total_rows_in=total_in)
    with_prepared = wastage.join(
        inventory.select(F.col("LocationId"), F.col("MenuItemId"), F.col("SaleDate").alias("WastageDate"), F.col("PreparedQuantity")),
        ["LocationId", "MenuItemId", "WastageDate"],
        "left",
    )
    impossible = F.col("QuantityWasted") > F.col("PreparedQuantity")
    report.impossible_wastage_capped = with_prepared.where(impossible).count()
    clean = with_prepared.withColumn(
        "QuantityWasted", F.when(impossible, F.col("PreparedQuantity")).otherwise(F.col("QuantityWasted"))
    ).drop("PreparedQuantity")
    report.total_rows_out_clean = clean.count()
    return clean, report


def write_clean(df: DataFrame, name: str, partition_cols: list[str] | None = None) -> None:
    out = CLEAN_DIR / name
    import shutil

    if out.exists():
        shutil.rmtree(out)
    writer = df.write.mode("overwrite")
    if partition_cols:
        writer = writer.partitionBy(*partition_cols)
    writer.parquet(str(out))
    log.info("Wrote clean Parquet: %s", out)


def main() -> None:
    spark = build_spark_session()
    spark.sparkContext.setLogLevel("WARN")
    try:
        summary_path = settings.PROCESSED_DATA_DIR / "ingestion_summary.json"
        if not summary_path.exists():
            raise FileNotFoundError(f"{summary_path} missing — run data_pipeline/ingest_sql_data.py first.")
        ingestion_summary = json.loads(summary_path.read_text())

        customers = read_raw(spark, "customers")
        menu_items = read_raw(spark, "menu_items")
        categories = read_raw(spark, "categories")
        locations = read_raw(spark, "restaurant_locations")
        channels = read_raw(spark, "ordering_channels")
        promotions = read_raw(spark, "promotions")
        pricing_history = read_raw(spark, "pricing_history")
        orders = read_raw(spark, "orders")
        order_lines = read_raw(spark, "order_lines")
        ratings = read_raw(spark, "ratings")
        inventory = read_raw(spark, "inventory")
        wastage = read_raw(spark, "wastage")

        clean_orders, quarantined_orders, orders_report = assess_and_clean_orders(orders, ingestion_summary["history_start"], ingestion_summary["history_end"])
        clean_lines, quarantined_lines, lines_report = assess_and_clean_order_lines(order_lines, menu_items)
        clean_wastage, wastage_report = assess_and_clean_wastage(wastage, inventory)

        # Only keep order lines whose order actually survived cleaning.
        clean_lines = clean_lines.join(clean_orders.select("OrderId"), "OrderId", "left_semi")

        # --- Spark SQL joins (SRS Step 6): the fully denormalized analytical view --------
        for df, alias in [(clean_orders, "orders"), (clean_lines, "order_lines"), (menu_items, "menu_items"), (categories, "categories"), (customers, "customers"), (locations, "locations"), (channels, "channels"), (promotions, "promotions")]:
            df.createOrReplaceTempView(alias)

        fact_sales = spark.sql(
            """
            SELECT
                ol.OrderLineId, ol.OrderId, o.OrderDate, o.CustomerId, o.Status,
                o.LocationId, loc.City, loc.LocationName,
                o.ChannelId, ch.ChannelName, ch.ChannelType,
                o.PromotionId, p.PromotionName, p.DiscountPercent AS PromotionDiscountPercent, p.IsTrapPromotion,
                ol.MenuItemId, mi.Name AS MenuItemName, mi.CategoryId, cat.Name AS CategoryName,
                ol.Quantity, ol.UnitPrice, ol.UnitCost, ol.LineTotal,
                ROUND(ol.Quantity * ol.UnitCost, 2) AS LineCost,
                ROUND(ol.LineTotal - (ol.Quantity * ol.UnitCost), 2) AS LineMargin
            FROM order_lines ol
            JOIN orders o ON o.OrderId = ol.OrderId
            JOIN menu_items mi ON mi.Id = ol.MenuItemId
            JOIN categories cat ON cat.Id = mi.CategoryId
            JOIN locations loc ON loc.LocationId = o.LocationId
            JOIN channels ch ON ch.ChannelId = o.ChannelId
            LEFT JOIN promotions p ON p.PromotionId = o.PromotionId
            WHERE o.Status = 'Completed'
            """
        )

        write_clean(customers, "customers")
        write_clean(menu_items, "menu_items")
        write_clean(categories, "categories")
        write_clean(locations, "restaurant_locations")
        write_clean(channels, "ordering_channels")
        write_clean(promotions, "promotions")
        write_clean(pricing_history, "pricing_history")
        write_clean(clean_orders.withColumn("OrderYear", F.year("OrderDate")).withColumn("OrderMonth", F.month("OrderDate")), "orders", ["OrderYear", "OrderMonth"])
        write_clean(clean_lines, "order_lines")
        write_clean(ratings, "ratings")
        write_clean(inventory, "inventory")
        write_clean(clean_wastage, "wastage")
        write_clean(fact_sales.withColumn("OrderYear", F.year("OrderDate")).withColumn("OrderMonth", F.month("OrderDate")), "fact_sales", ["OrderYear", "OrderMonth"])

        report = {
            "orders": asdict(orders_report),
            "order_lines": asdict(lines_report),
            "wastage": asdict(wastage_report),
            "fact_sales_row_count": fact_sales.count(),
        }
        report_path = settings.REPORTS_DIR / "data_quality_report.json"
        report_path.write_text(json.dumps(report, indent=2))
        log.info("Data Quality Report written to %s", report_path)
        log.info(json.dumps(report, indent=2))
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
