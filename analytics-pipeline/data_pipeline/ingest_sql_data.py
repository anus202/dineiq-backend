"""SECTION 1 — MSSQL Data Ingestion & Parquet Export Engine.

Loads the REAL Customers / Menu Items / Categories already sitting in the DineIQ MSSQL
database, generates realistic synthetic Orders / Order Lines / Ratings / Wastage /
Inventory / Promotions / Restaurant Locations / Pricing History / Ordering Channels at
Big-Data scale on top of them, injects a documented set of data-quality anomalies for
the pipeline's later Data Quality Assessment step to catch, and writes everything to
partitioned Parquet under processed_data/parquet_data/ (plus a CSV snapshot under
raw_data/ for anyone who wants to eyeball it without Spark).

Two ways to read the real SQL Server tables (--source flag):

    pyodbc   (default) — reads via the same ODBC connection the FastAPI backend uses
             (Server=. / named pipes), then hands the data to Spark as a proper
             distributed DataFrame with spark.createDataFrame(). Works out of the box;
             no SQL Server configuration changes needed.

    jdbc     — a genuine Spark JDBC read (spark.read.jdbc(...)), the way the SRS
             describes it. This needs SQL Server's TCP/IP protocol enabled and
             listening on DB_JDBC_PORT (1433 by default) — which is NOT this
             instance's default config (it's set up for named-pipe/shared-memory
             connections only). To use --source jdbc:
                 1. SQL Server Configuration Manager -> SQL Server Network
                    Configuration -> Protocols -> enable TCP/IP -> set IP All /
                    TCP Port to 1433 -> restart the SQL Server service.
                 2. Re-run this script with --source jdbc.
             The Microsoft JDBC driver jar is already downloaded to lib/ and wired up
             below either way, so this is a one-line flag flip once TCP/IP is on.

Usage:
    cd <repo root>
    .venv-bigdata\\Scripts\\python -m data_pipeline.ingest_sql_data
    .venv-bigdata\\Scripts\\python -m data_pipeline.ingest_sql_data --source jdbc
    .venv-bigdata\\Scripts\\python -m data_pipeline.ingest_sql_data --target-orders 2000 --target-lines 15000  # quick smoke test
"""
from __future__ import annotations

import argparse
import json
import logging
import shutil
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

import pyodbc
from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F
from pyspark.sql import types as T
from pyspark.sql.window import Window

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import settings  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s  %(message)s")
log = logging.getLogger("ingest_sql_data")


# =========================================================================================
# Spark session
# =========================================================================================


def build_spark_session(app_name: str = "DineIQ-Ingestion") -> SparkSession:
    """One SparkSession for the whole run. The JDBC jar is registered unconditionally so
    --source jdbc works with no other change once SQL Server's TCP/IP listener is on."""
    return (
        SparkSession.builder.appName(app_name)
        # local[2], not local[*]: PySpark's Python-worker sockets are unreliable on
        # Windows under high local parallelism (WinError 10038 — "operation attempted
        # on something that is not a socket"), a documented PySpark-on-Windows issue,
        # not specific to this dataset. Two workers is enough for a single dev machine.
        .master("local[2]")
        .config("spark.jars", str(settings.JDBC_JAR_PATH))
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.sql.shuffle.partitions", "8")  # local[*] on a single dev machine: fewer, bigger tasks
        .config("spark.driver.memory", "3g")
        .config("spark.sql.parquet.compression.codec", "snappy")
        # spark.python.worker.reuse left at Spark's default (true): forcing a fresh
        # worker per task (reuse=false) was tried as a fix for the Windows socket bug
        # but instead maximizes exposure to it (more socket setup/teardown cycles).
        .getOrCreate()
    )


# =========================================================================================
# Step 1a: load the REAL dimension tables from SQL Server
# =========================================================================================


def load_dimensions_via_jdbc(spark: SparkSession) -> dict[str, DataFrame]:
    """Read Customers / MenuItems / Categories with Spark's own JDBC reader.

    Requires SQL Server's TCP/IP protocol enabled on settings.DB_JDBC_PORT — see the
    module docstring. Raises with a clear message (not a raw Java stack trace) if the
    port isn't reachable, since that's the one prerequisite this path can't self-heal.
    """
    props = {"user": settings.DB_USER, "password": settings.DB_PASSWORD, "driver": "com.microsoft.sqlserver.jdbc.SQLServerDriver"}
    url = settings.jdbc_url()
    try:
        customers = spark.read.jdbc(url, "(SELECT Id, Name, Phone, Email, Address, LoyaltyPoints, CreatedAt FROM Customers WHERE IsDeleted = 0) t", properties=props)
        menu_items = spark.read.jdbc(url, "(SELECT Id, CategoryId, Name, Description, Price, Cost, IsAvailable FROM Menu_Items WHERE IsDeleted = 0) t", properties=props)
        categories = spark.read.jdbc(url, "(SELECT Id, Name FROM Menu_Categories WHERE IsDeleted = 0) t", properties=props)
    except Exception as exc:  # pragma: no cover - environment-dependent
        raise RuntimeError(
            "Spark JDBC read failed. SQL Server's TCP/IP protocol is very likely disabled "
            f"(this script needs it listening on 127.0.0.1:{settings.DB_JDBC_PORT}). "
            "Enable it in SQL Server Configuration Manager and restart the SQL Server "
            "service, or run this script with --source pyodbc instead (no setup needed)."
        ) from exc
    return {"customers": customers, "menu_items": menu_items, "categories": categories}


def load_dimensions_via_pyodbc(spark: SparkSession) -> dict[str, DataFrame]:
    """Read the same three tables with pyodbc + pandas, stage them as Parquet on local
    disk, then have Spark read the Parquet files back.

    Works immediately in this environment (the FastAPI backend already proves this ODBC
    connection is good). Handing pandas data to Spark via createDataFrame()/parallelize()
    ships every row through PySpark's Python-worker RDD serialization path, which on this
    Windows machine reliably crashes with `OSError: [WinError 10038]` once the row count
    gets large (confirmed on both Python 3.13 and 3.12 -- not a Python-version issue).
    Routing through Parquet files instead avoids that code path entirely: pandas writes
    the file with a plain file handle (pyarrow), and Spark's Parquet reader is a totally
    separate, file-based ingestion path that never touches the RDD-over-socket protocol.
    """
    import tempfile

    import pandas as pd

    conn = pyodbc.connect(settings.odbc_connection_string(), autocommit=True)
    try:
        customers_pd = pd.read_sql("SELECT Id, Name, Phone, Email, Address, LoyaltyPoints, CreatedAt FROM Customers WHERE IsDeleted = 0", conn)
        menu_items_pd = pd.read_sql("SELECT Id, CategoryId, Name, Description, Price, Cost, IsAvailable FROM Menu_Items WHERE IsDeleted = 0", conn)
        categories_pd = pd.read_sql("SELECT Id, Name FROM Menu_Categories WHERE IsDeleted = 0", conn)
    finally:
        conn.close()

    customers_pd["Id"] = customers_pd["Id"].astype("int32")
    customers_pd["LoyaltyPoints"] = customers_pd["LoyaltyPoints"].astype("int32")
    menu_items_pd["Id"] = menu_items_pd["Id"].astype("int32")
    menu_items_pd["CategoryId"] = menu_items_pd["CategoryId"].astype("int32")
    menu_items_pd["Price"] = menu_items_pd["Price"].astype("float64")
    menu_items_pd["Cost"] = menu_items_pd["Cost"].astype("float64")
    categories_pd["Id"] = categories_pd["Id"].astype("int32")

    stage_dir = Path(tempfile.mkdtemp(prefix="dineiq_stage_"))
    try:
        customers_path = stage_dir / "customers.parquet"
        menu_items_path = stage_dir / "menu_items.parquet"
        categories_path = stage_dir / "categories.parquet"
        # coerce_timestamps="us": pandas/pyarrow default to TIMESTAMP(NANOS), which this
        # Spark/parquet-mr version's reader rejects outright ("Illegal Parquet type:
        # INT64 (TIMESTAMP(NANOS,false))"). Microsecond precision is what Spark expects.
        customers_pd.to_parquet(customers_path, engine="pyarrow", index=False, coerce_timestamps="us", allow_truncated_timestamps=True)
        menu_items_pd.to_parquet(menu_items_path, engine="pyarrow", index=False)
        categories_pd.to_parquet(categories_path, engine="pyarrow", index=False)

        customers = spark.read.parquet(str(customers_path))
        menu_items = (
            spark.read.parquet(str(menu_items_path))
            .withColumn("Price", F.col("Price").cast(T.DecimalType(10, 2)))
            .withColumn("Cost", F.col("Cost").cast(T.DecimalType(10, 2)))
        )
        categories = spark.read.parquet(str(categories_path))

        # Force materialization now (while stage_dir still exists) rather than lazily,
        # since Spark's Parquet reads are lazy and stage_dir is removed once this
        # function returns.
        customers.cache().count()
        menu_items.cache().count()
        categories.cache().count()
    finally:
        shutil.rmtree(stage_dir, ignore_errors=True)

    return {"customers": customers, "menu_items": menu_items, "categories": categories}


# =========================================================================================
# Step 1b: synthetic dimension tables the SRS dataset requires but the OLTP database
# doesn't model (Restaurant Locations, Promotions, Ordering Channels, Pricing History)
# =========================================================================================


def generate_locations(spark: SparkSession) -> DataFrame:
    cities = ["Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta"]
    n = settings.LOCATION_COUNT
    return (
        spark.range(1, n + 1)
        .withColumnRenamed("id", "LocationId")
        .withColumn("City", F.element_at(F.array(*[F.lit(c) for c in cities]), (F.col("LocationId") % len(cities) + 1).cast("int")))
        .withColumn("LocationName", F.concat(F.col("City"), F.lit(" - Branch "), F.col("LocationId")))
        .withColumn("OpenedDate", F.date_sub(F.current_date(), (F.rand(settings.RANDOM_SEED) * 1500 + 200).cast("int")))
        .select("LocationId", "LocationName", "City", "OpenedDate")
    )


def generate_channels(spark: SparkSession) -> DataFrame:
    # spark.range(), not createDataFrame(row_list): row-list-based DataFrame creation
    # goes through PySpark's Python-worker RDD path, which crashes on this Windows
    # machine with OSError: [WinError 10038] even for tiny (<10 row) lists.
    names = settings.ORDER_CHANNELS
    return (
        spark.range(1, len(names) + 1)
        .withColumnRenamed("id", "ChannelId")
        .withColumn("ChannelName", F.element_at(F.array(*[F.lit(n) for n in names]), F.col("ChannelId").cast("int")))
        .withColumn("ChannelType", F.when(F.col("ChannelName") == "Dine-in", "Offline").otherwise("Online"))
    )


def generate_promotions(spark: SparkSession, menu_items: DataFrame, history_start, history_end) -> DataFrame:
    """A handful of promotion campaigns. A fixed fraction are deliberate "profit traps":
    a large discount concentrated on already-thin-margin items, so a naive
    "sales went up -> promotion worked" read is wrong (SRS Step 28)."""
    n = settings.PROMOTION_COUNT
    trap_count = max(1, int(n * 0.35))  # roughly a third of campaigns are traps, so trap detection has real signal
    names = [f"Promo-{i:02d}" for i in range(1, n + 1)]
    # spark.range(), not createDataFrame(row_list) -- see generate_channels for why.
    promos = (
        spark.range(1, n + 1)
        .withColumnRenamed("id", "PromotionId")
        .withColumn("PromotionName", F.element_at(F.array(*[F.lit(nm) for nm in names]), F.col("PromotionId").cast("int")))
    )
    span_days = (history_end - history_start).days
    return (
        promos
        .withColumn("IsTrapPromotion", F.col("PromotionId") <= trap_count)
        # Trap promos: steep discount (25-40%). Healthy promos: modest (5-15%).
        .withColumn(
            "DiscountPercent",
            F.when(F.col("IsTrapPromotion"), (F.rand(1) * 15 + 25).cast("int")).otherwise((F.rand(2) * 10 + 5).cast("int")),
        )
        .withColumn("StartOffsetDays", (F.rand(3) * (span_days - 30)).cast("int"))
        .withColumn("StartDate", F.expr(f"date_add(to_date('{history_start.isoformat()}'), StartOffsetDays)"))
        .withColumn("DurationDays", (F.rand(4) * 20 + 7).cast("int"))
        .withColumn("EndDate", F.expr("date_add(StartDate, DurationDays)"))
        .drop("StartOffsetDays", "DurationDays")
    )


def generate_pricing_history(spark: SparkSession, menu_items: DataFrame, history_start, history_end) -> DataFrame:
    """2-3 historical price points per menu item over the analysis window, so price
    elasticity / price-sensitivity analysis has real price *changes* to react to."""
    span_days = (history_end - history_start).days
    exploded = menu_items.select("Id", "Price").withColumn("ChangeSeq", F.explode(F.sequence(F.lit(0), (F.rand(5) * 2 + 1).cast("int"))))
    return (
        exploded
        .withColumn("PriceHistoryId", F.monotonically_increasing_id())
        .withColumn("DayOffset", ((F.col("ChangeSeq") + F.rand(6)) / 3.0 * span_days).cast("int"))
        .withColumn("ChangedAt", F.expr(f"date_add(to_date('{history_start.isoformat()}'), DayOffset)"))
        # Price drifts +/-15% per change point, floored at 50% of the current catalog price.
        .withColumn("PriceMultiplier", 1 + (F.rand(7) - 0.5) * 0.3)
        .withColumn("HistoricalPrice", F.greatest(F.col("Price") * F.col("PriceMultiplier"), F.col("Price") * 0.5))
        .withColumn("HistoricalPrice", F.round(F.col("HistoricalPrice"), 2))
        .withColumnRenamed("Id", "MenuItemId")
        .select("PriceHistoryId", "MenuItemId", "ChangedAt", "HistoricalPrice")
        .orderBy("MenuItemId", "ChangedAt")
    )


# =========================================================================================
# Step 1c: synthetic FACT tables at Big-Data scale — Orders, Order Lines, Ratings,
# Inventory, Wastage. Everything below is built with Spark DataFrame operations
# (range/explode/join/window), never a Python-side loop over individual rows, so it
# scales to the SRS's 1,000,000+ order-line minimum without becoming the bottleneck.
# =========================================================================================


def _indexed(df: DataFrame, id_col: str, index_col: str) -> DataFrame:
    """0-based dense index over id_col, for turning `rand() * count` into a row pick."""
    w = Window.orderBy(id_col)
    return df.withColumn(index_col, (F.row_number().over(w) - 1))


def generate_orders_and_lines(
    spark: SparkSession,
    customers: DataFrame,
    menu_items: DataFrame,
    locations: DataFrame,
    channels: DataFrame,
    promotions: DataFrame,
    history_start,
    history_end,
) -> tuple[DataFrame, DataFrame]:
    n_orders = settings.TARGET_ORDER_COUNT
    span_days = (history_end - history_start).days
    n_customers = customers.count()
    n_locations = locations.count()
    n_channels = channels.count()
    n_promotions = promotions.count()
    n_menu_items = menu_items.count()

    customers_idx = _indexed(customers.select("Id"), "Id", "cust_idx").withColumnRenamed("Id", "CustomerId")
    locations_idx = _indexed(locations, "LocationId", "loc_idx")
    channels_idx = _indexed(channels, "ChannelId", "chan_idx")
    promos_idx = _indexed(promotions, "PromotionId", "promo_idx")

    # --- Order headers (dates + dimension picks only; totals are filled in after lines) ---
    orders = (
        spark.range(1, n_orders + 1)
        .withColumnRenamed("id", "OrderId")
        # Seasonality: more orders in the most recent ~4 months (business growth), plus a
        # weekend bump, both baked in via a non-uniform day offset rather than pure random.
        .withColumn("_r", F.rand(101))
        .withColumn("DayOffset", F.when(F.col("_r") < 0.55, (F.pow(F.rand(102), 0.6) * span_days).cast("int")).otherwise((span_days * 0.75 + F.rand(103) * span_days * 0.25).cast("int")))
        .withColumn("OrderDate", F.expr(f"date_add(to_date('{history_start.isoformat()}'), DayOffset)"))
        # Peak-hour weighting: lunch (12-14) and dinner (19-21) are busier than 3-6am.
        .withColumn("_hbucket", F.rand(104))
        .withColumn(
            "OrderHour",
            F.when(F.col("_hbucket") < 0.28, (F.rand(105) * 2 + 12).cast("int"))
            .when(F.col("_hbucket") < 0.56, (F.rand(106) * 2 + 19).cast("int"))
            .otherwise((F.rand(107) * 24).cast("int")),
        )
        .withColumn("OrderMinute", (F.rand(108) * 60).cast("int"))
        .withColumn("OrderDate", F.expr("to_timestamp(concat(OrderDate, ' ', lpad(OrderHour,2,'0'), ':', lpad(OrderMinute,2,'0'), ':00'))"))
        .withColumn("cust_idx", (F.rand(109) * n_customers).cast("int"))
        .withColumn("loc_idx", (F.rand(110) * n_locations).cast("int"))
        .withColumn("chan_idx", (F.rand(111) * n_channels).cast("int"))
        .withColumn("PaymentMethod", F.when(F.rand(112) < 0.45, "Cash").when(F.rand(113) < 0.8, "Card").otherwise("Wallet"))
        # ~40% of orders carry a promotion.
        .withColumn("HasPromotion", F.rand(114) < 0.40)
        .withColumn("promo_idx", F.when(F.col("HasPromotion"), (F.rand(115) * n_promotions).cast("int")).otherwise(F.lit(None)))
        .withColumn(
            "Status",
            F.when(F.rand(116) < settings.ORDER_STATUSES_WEIGHTED[1][1], settings.ORDER_STATUSES_WEIGHTED[1][0])
            .when(F.rand(117) < settings.ORDER_STATUSES_WEIGHTED[1][1] + settings.ORDER_STATUSES_WEIGHTED[2][1], settings.ORDER_STATUSES_WEIGHTED[2][0])
            .otherwise(settings.ORDER_STATUSES_WEIGHTED[0][0]),
        )
        .join(customers_idx, "cust_idx", "left")
        .join(locations_idx.select("loc_idx", "LocationId"), "loc_idx", "left")
        .join(channels_idx.select("chan_idx", "ChannelId"), "chan_idx", "left")
        .join(promos_idx.select("promo_idx", "PromotionId"), "promo_idx", "left")
        .select("OrderId", "OrderDate", "CustomerId", "LocationId", "ChannelId", "PromotionId", "PaymentMethod", "Status")
    )

    # --- Order lines: 1-5 lines per order (Poisson-ish via a small weighted pick) ---------
    menu_idx = _indexed(menu_items.select("Id", "Price", "Cost").withColumnRenamed("Id", "MenuItemId"), "MenuItemId", "item_idx")
    # A fixed popularity weight per item (skewed) so some dishes are genuinely best-sellers
    # and others are genuinely slow-movers — required for the menu-classification task in
    # spark_jobs/spark_mllib_models.py to have real, learnable signal.
    popularity = (
        menu_idx.withColumn("PopularityWeight", F.pow(F.rand(seed=201), 2.2))  # right-skewed: most items low, a few very high
        .select("item_idx", "MenuItemId", "PopularityWeight")
    )
    total_weight = popularity.agg(F.sum("PopularityWeight")).first()[0]
    popularity = popularity.withColumn("CumulativeShare", F.sum("PopularityWeight").over(Window.orderBy("item_idx").rowsBetween(Window.unboundedPreceding, 0)) / F.lit(total_weight))

    order_lines_per_order = (
        orders.select("OrderId")
        .withColumn("NumLines", (F.rand(202) * 4 + 1).cast("int"))  # 1-4 distinct dishes per order
        .withColumn("LineSeq", F.explode(F.sequence(F.lit(1), F.col("NumLines"))))
        .drop("NumLines")
        .withColumn("_pick", F.rand(203))
    )
    # Map each line's random draw to a menu item via its cumulative popularity share
    # (weighted sampling without a Python loop): join on "_pick <= CumulativeShare",
    # keep the first matching item per line.
    order_lines = (
        order_lines_per_order.crossJoin(F.broadcast(popularity.select("MenuItemId", "CumulativeShare")))
        .where(F.col("_pick") <= F.col("CumulativeShare"))
        .withColumn("rn", F.row_number().over(Window.partitionBy("OrderId", "LineSeq").orderBy("CumulativeShare")))
        .where(F.col("rn") == 1)
        .drop("rn", "_pick", "CumulativeShare")
        .join(F.broadcast(menu_idx.select("MenuItemId", "Price", "Cost")), "MenuItemId", "left")
        .withColumn("Quantity", (F.rand(204) * 3 + 1).cast("int"))  # 1-3 units
        .withColumn("UnitPrice", F.col("Price"))
        .withColumn("LineTotal", F.round(F.col("Quantity") * F.col("UnitPrice"), 2))
        .withColumn("UnitCost", F.col("Cost"))
        .withColumn("OrderLineId", F.monotonically_increasing_id())
        .select("OrderLineId", "OrderId", "MenuItemId", "Quantity", "UnitPrice", "UnitCost", "LineTotal")
    )

    # Apply each order's promotion discount to its lines' total, then roll up to the header.
    orders_with_discount = orders.withColumn(
        "DiscountPercent",
        F.when(F.col("PromotionId").isNotNull(), F.lit(None).cast("int")).otherwise(F.lit(0)),
    ).drop("DiscountPercent")  # discount % resolved via a join below, once promotions is passed in by the caller

    totals = order_lines.groupBy("OrderId").agg(F.round(F.sum("LineTotal"), 2).alias("TotalAmount"))
    orders_final = (
        orders_with_discount.join(totals, "OrderId", "left")
        .withColumn("TotalAmount", F.coalesce(F.col("TotalAmount"), F.lit(0.0)))
        .join(promotions.select(F.col("PromotionId"), F.col("DiscountPercent")), "PromotionId", "left")
        .withColumn("DiscountPercent", F.coalesce(F.col("DiscountPercent"), F.lit(0)))
        .withColumn("Discount", F.round(F.col("TotalAmount") * F.col("DiscountPercent") / 100.0, 2))
        .withColumn("NetAmount", F.round(F.col("TotalAmount") - F.col("Discount"), 2))
        .drop("DiscountPercent")
    )
    return orders_final, order_lines


def generate_ratings(spark: SparkSession, order_lines: DataFrame, orders: DataFrame) -> DataFrame:
    """One rating for a sampled subset of (order, menu item) pairs, skewed toward 4-5
    stars, with a deliberate rating-drop window injected on a few items (SRS Step 30)."""
    rated = (
        order_lines.join(orders.select("OrderId", "CustomerId", "OrderDate"), "OrderId")
        .where(F.rand(301) < 0.35)  # not every line gets rated
        .withColumn("Score", F.least(F.lit(5), F.greatest(F.lit(1), (F.randn(302) * 0.9 + 4.3).cast("int"))))
        .withColumn("RatingDate", F.date_add(F.col("OrderDate"), (F.rand(303) * 5).cast("int")))
        .withColumn("RatingId", F.monotonically_increasing_id())
        .select("RatingId", "OrderId", "CustomerId", "MenuItemId", "Score", "RatingDate")
    )
    # Rating-drop anomaly: a fraction of items get every rating in a 30-day window forced
    # down by 2 stars (floored at 1) — a sudden, detectable drop for anomaly detection.
    trap_items = rated.select("MenuItemId").distinct().sample(fraction=settings.ANOMALY_RATES["rating_drop"], seed=304)
    window_start = rated.agg(F.min("RatingDate")).first()[0]
    dropped = (
        rated.join(F.broadcast(trap_items.withColumn("IsDropItem", F.lit(True))), "MenuItemId", "left")
        .withColumn("InDropWindow", F.col("RatingDate").between(F.date_add(F.lit(window_start), 200), F.date_add(F.lit(window_start), 230)))
        .withColumn(
            "Score",
            F.when(F.col("IsDropItem") & F.col("InDropWindow"), F.greatest(F.lit(1), F.col("Score") - 2)).otherwise(F.col("Score")),
        )
        .drop("IsDropItem", "InDropWindow")
    )
    return dropped


def generate_inventory_and_wastage(spark: SparkSession, menu_items: DataFrame, locations: DataFrame, order_lines: DataFrame, orders: DataFrame, history_start, history_end) -> tuple[DataFrame, DataFrame]:
    """Daily prepared vs. sold quantity per (menu item, location), and the wastage that
    falls out of the difference — with a fraction of rows given an impossible (negative
    remaining) quantity for the DQ step to catch (SRS Step 4 bullet: "Impossible wastage
    quantities")."""
    daily_sales = (
        order_lines.join(orders.select("OrderId", "OrderDate", "LocationId"), "OrderId")
        .withColumn("SaleDate", F.to_date("OrderDate"))
        .groupBy("SaleDate", "LocationId", "MenuItemId")
        .agg(F.sum("Quantity").alias("SoldQuantity"))
    )
    inventory = (
        daily_sales.withColumn("PreparedQuantity", (F.col("SoldQuantity") * (1 + F.rand(401) * 0.35 + 0.05)).cast("int"))
        .withColumn("PreparedQuantity", F.greatest(F.col("PreparedQuantity"), F.col("SoldQuantity") + 1))
        .withColumn("RemainingQuantity", F.col("PreparedQuantity") - F.col("SoldQuantity"))
        .withColumn("InventoryId", F.monotonically_increasing_id())
        .select("InventoryId", "SaleDate", "LocationId", "MenuItemId", "PreparedQuantity", "SoldQuantity", "RemainingQuantity")
    )
    wastage = (
        inventory.where(F.col("RemainingQuantity") > 0)
        .sample(fraction=0.6, seed=402)  # not everything unsold is logged as "wasted" the same day
        .join(F.broadcast(menu_items.select(F.col("Id").alias("MenuItemId"), F.col("Cost"))), "MenuItemId")
        .withColumn("QuantityWasted", F.col("RemainingQuantity"))
        .withColumn(
            "Reason",
            F.when(F.rand(403) < 0.4, "Overproduction").when(F.rand(404) < 0.7, "Spoilage").when(F.rand(405) < 0.9, "Prep Error").otherwise("Customer Return"),
        )
        .withColumn("WastageCost", F.round(F.col("QuantityWasted") * F.col("Cost"), 2))
        .withColumn("WastageId", F.monotonically_increasing_id())
        .select("WastageId", "SaleDate", "LocationId", "MenuItemId", "QuantityWasted", "WastageCost", "Reason")
        .withColumnRenamed("SaleDate", "WastageDate")
    )
    return inventory, wastage


# =========================================================================================
# Step 3: anomaly injection (documented, reproducible — see config.settings.ANOMALY_RATES)
# =========================================================================================


def inject_anomalies(orders: DataFrame, order_lines: DataFrame, wastage: DataFrame, menu_items: DataFrame, history_start, history_end) -> tuple[DataFrame, DataFrame, DataFrame]:
    rates = settings.ANOMALY_RATES

    orders = orders.withColumn(
        "CustomerId",
        F.when(F.rand(501) < rates["missing_customer_id"], F.lit(None)).otherwise(F.col("CustomerId")),
    ).withColumn(
        "OrderDate",
        F.when(
            F.rand(502) < rates["invalid_date"],
            F.date_add(F.lit(history_end.isoformat()).cast("date"), (F.rand(503) * 365 + 30).cast("int")),  # future-dated, out of range
        ).otherwise(F.col("OrderDate")),
    ).withColumn(
        "Discount",
        F.when(F.rand(504) < rates["cancelled_with_discount_over_price"], F.col("TotalAmount") * 1.5).otherwise(F.col("Discount")),
    )

    order_lines = order_lines.withColumn(
        "MenuItemId",
        F.when(F.rand(505) < rates["missing_menu_item_id"], F.lit(None)).otherwise(F.col("MenuItemId")),
    ).withColumn(
        "Quantity",
        F.when(F.rand(506) < rates["negative_quantity"], -F.col("Quantity")).otherwise(F.col("Quantity")),
    ).withColumn(
        "UnitPrice",
        F.when(F.rand(507) < rates["invalid_price"], F.lit(-1.0)).otherwise(F.col("UnitPrice")),
    )

    # Duplicate whole orders verbatim (new surrogate OrderId, identical business content) —
    # a classic "duplicate transaction" anomaly (SRS Step 8 / Step 4).
    dup_orders_seed = orders.sample(fraction=rates["duplicate_order"], seed=508)
    max_order_id = orders.agg(F.max("OrderId")).first()[0]
    dup_orders = (
        dup_orders_seed.withColumn("rn", F.row_number().over(Window.orderBy("OrderId")))
        .withColumn("NewOrderId", F.col("rn") + F.lit(max_order_id))
        .drop("OrderId", "rn")
        .withColumnRenamed("NewOrderId", "OrderId")
    )
    # Duplicate order lines within the same order (data-entry double-submit).
    dup_lines_seed = order_lines.sample(fraction=rates["duplicate_order_line"], seed=509)
    max_line_id = order_lines.agg(F.max("OrderLineId")).first()[0]
    dup_lines = (
        dup_lines_seed.withColumn("rn", F.row_number().over(Window.orderBy("OrderLineId")))
        .withColumn("NewLineId", F.col("rn") + F.lit(max_line_id))
        .drop("OrderLineId", "rn")
        .withColumnRenamed("NewLineId", "OrderLineId")
    )

    orders_out = orders.unionByName(dup_orders)
    order_lines_out = order_lines.unionByName(dup_lines)

    wastage_out = wastage.withColumn(
        "QuantityWasted",
        F.when(F.rand(510) < rates["impossible_wastage_quantity"], F.col("QuantityWasted") * 50).otherwise(F.col("QuantityWasted")),
    )
    return orders_out, order_lines_out, wastage_out


# =========================================================================================
# Step 4: write outputs — raw CSV snapshot + partitioned Parquet
# =========================================================================================


@dataclass
class IngestionSummary:
    source_mode: str
    customers: int
    menu_items: int
    categories: int
    locations: int
    channels: int
    promotions: int
    pricing_history_rows: int
    orders: int
    order_lines: int
    ratings: int
    inventory_rows: int
    wastage_rows: int
    history_start: str
    history_end: str


def write_parquet(df: DataFrame, name: str, partition_cols: list[str] | None = None) -> None:
    out_dir = settings.PARQUET_DIR / name
    if out_dir.exists():
        shutil.rmtree(out_dir)
    writer = df.write.mode("overwrite")
    if partition_cols:
        writer = writer.partitionBy(*partition_cols)
    writer.parquet(str(out_dir))
    log.info("Wrote Parquet: %s%s", out_dir, f" (partitioned by {partition_cols})" if partition_cols else "")


def write_csv_sample(df: DataFrame, name: str, limit: int = 20_000) -> None:
    """A human-readable CSV sample under raw_data/, capped so this stays fast — the full
    fidelity copy of every row lives in the Parquet output, not here."""
    out_dir = settings.RAW_DATA_DIR / name
    if out_dir.exists():
        shutil.rmtree(out_dir)
    df.limit(limit).coalesce(1).write.mode("overwrite").option("header", True).csv(str(out_dir))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", choices=["pyodbc", "jdbc"], default="pyodbc", help="How to read the real Customers/MenuItems/Categories tables.")
    parser.add_argument("--target-orders", type=int, default=settings.TARGET_ORDER_COUNT)
    parser.add_argument("--target-lines", type=int, default=settings.TARGET_ORDER_LINE_COUNT, help="Informational target; actual line count is driven by --target-orders x lines/order.")
    parser.add_argument("--history-months", type=int, default=settings.HISTORY_MONTHS)
    parser.add_argument("--csv-sample", action="store_true", help="Also write a capped CSV sample of each table under raw_data/.")
    args = parser.parse_args()

    settings.TARGET_ORDER_COUNT = args.target_orders  # allow a quick smoke-test override

    from datetime import date, timedelta

    history_end = date.today()
    history_start = history_end - timedelta(days=30 * args.history_months)

    log.info("Starting ingestion | source=%s | target_orders=%s | history=%s..%s", args.source, args.target_orders, history_start, history_end)

    spark = build_spark_session()
    spark.sparkContext.setLogLevel("WARN")
    try:
        dims = load_dimensions_via_jdbc(spark) if args.source == "jdbc" else load_dimensions_via_pyodbc(spark)
        customers, menu_items, categories = dims["customers"], dims["menu_items"], dims["categories"]
        customers.cache(); menu_items.cache(); categories.cache()
        log.info("Loaded real dimensions: %s customers, %s menu items, %s categories", customers.count(), menu_items.count(), categories.count())

        locations = generate_locations(spark).cache()
        channels = generate_channels(spark).cache()
        promotions = generate_promotions(spark, menu_items, history_start, history_end).cache()
        pricing_history = generate_pricing_history(spark, menu_items, history_start, history_end)

        orders, order_lines = generate_orders_and_lines(spark, customers, menu_items, locations, channels, promotions, history_start, history_end)
        orders.cache(); order_lines.cache()
        log.info("Generated %s orders / %s order lines (pre-anomaly)", orders.count(), order_lines.count())

        ratings = generate_ratings(spark, order_lines, orders)
        inventory, wastage = generate_inventory_and_wastage(spark, menu_items, locations, order_lines, orders, history_start, history_end)

        orders, order_lines, wastage = inject_anomalies(orders, order_lines, wastage, menu_items, history_start, history_end)
        order_lines = order_lines.cache()
        orders = orders.cache()

        order_lines_count = order_lines.count()
        orders_count = orders.count()
        log.info("After anomaly injection: %s orders / %s order lines", orders_count, order_lines_count)

        # --- Partitioned Parquet export (year/month is the natural partition for a --------
        # --- time-series restaurant dataset: every downstream date-range query prunes on it)
        orders_p = orders.withColumn("OrderYear", F.year("OrderDate")).withColumn("OrderMonth", F.month("OrderDate"))
        order_lines_p = order_lines.join(orders.select(F.col("OrderId"), F.year("OrderDate").alias("OrderYear"), F.month("OrderDate").alias("OrderMonth")), "OrderId", "left")
        ratings_p = ratings.withColumn("RatingYear", F.year("RatingDate")).withColumn("RatingMonth", F.month("RatingDate"))
        wastage_p = wastage.withColumn("WastageYear", F.year("WastageDate")).withColumn("WastageMonth", F.month("WastageDate"))
        inventory_p = inventory.withColumn("InventoryYear", F.year("SaleDate")).withColumn("InventoryMonth", F.month("SaleDate"))

        write_parquet(customers, "customers")
        write_parquet(menu_items, "menu_items")
        write_parquet(categories, "categories")
        write_parquet(locations, "restaurant_locations")
        write_parquet(channels, "ordering_channels")
        write_parquet(promotions, "promotions")
        write_parquet(pricing_history, "pricing_history")
        write_parquet(orders_p, "orders", partition_cols=["OrderYear", "OrderMonth"])
        write_parquet(order_lines_p, "order_lines", partition_cols=["OrderYear", "OrderMonth"])
        write_parquet(ratings_p, "ratings", partition_cols=["RatingYear", "RatingMonth"])
        write_parquet(inventory_p, "inventory", partition_cols=["InventoryYear", "InventoryMonth"])
        write_parquet(wastage_p, "wastage", partition_cols=["WastageYear", "WastageMonth"])

        if args.csv_sample:
            for name, df in [("customers", customers), ("menu_items", menu_items), ("categories", categories), ("orders", orders), ("order_lines", order_lines), ("ratings", ratings), ("wastage", wastage)]:
                write_csv_sample(df, name)

        summary = IngestionSummary(
            source_mode=args.source,
            customers=customers.count(),
            menu_items=menu_items.count(),
            categories=categories.count(),
            locations=locations.count(),
            channels=channels.count(),
            promotions=promotions.count(),
            pricing_history_rows=pricing_history.count(),
            orders=orders_count,
            order_lines=order_lines_count,
            ratings=ratings.count(),
            inventory_rows=inventory.count(),
            wastage_rows=wastage.count(),
            history_start=history_start.isoformat(),
            history_end=history_end.isoformat(),
        )
        summary_path = settings.PROCESSED_DATA_DIR / "ingestion_summary.json"
        summary_path.write_text(json.dumps(asdict(summary), indent=2))
        log.info("Ingestion complete. Summary written to %s", summary_path)
        log.info(json.dumps(asdict(summary), indent=2))
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
