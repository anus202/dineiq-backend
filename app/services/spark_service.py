"""Shared SparkSession management and a small real Spark job for health checks."""

import os
import sys
import threading
import time

from pyspark.sql import SparkSession
from pyspark.sql import functions as F

from app.core.config import get_settings

_spark: SparkSession | None = None
_lock = threading.Lock()


def get_spark() -> SparkSession:
    """Return the shared SparkSession, creating it on first use."""
    global _spark
    with _lock:
        if _spark is None:
            # Make Spark's Python workers use the same interpreter as the API (the .venv),
            # unless the user has already set these explicitly.
            os.environ.setdefault("PYSPARK_PYTHON", sys.executable)
            os.environ.setdefault("PYSPARK_DRIVER_PYTHON", sys.executable)

            settings = get_settings()
            _spark = (
                SparkSession.builder.appName(settings.spark_app_name)
                .master(settings.spark_master)
                .config("spark.driver.memory", settings.spark_driver_memory)
                .config("spark.sql.shuffle.partitions", str(settings.spark_shuffle_partitions))
                .config("spark.ui.enabled", "false")
                .getOrCreate()
            )
            _spark.sparkContext.setLogLevel("WARN")
        return _spark


def stop_spark() -> None:
    """Stop the shared SparkSession if one was started."""
    global _spark
    with _lock:
        if _spark is not None:
            _spark.stop()
            _spark = None


def run_health_check(row_count: int = 1000) -> dict:
    """Run a small real Spark job: generate rows, group them into buckets, aggregate.

    The job sums 1..row_count, so the grand total must equal n*(n+1)/2; this
    proves Spark actually computed the result.
    """
    start = time.perf_counter()
    spark = get_spark()

    df = spark.range(1, row_count + 1).withColumn("bucket", F.col("id") % 3)
    rows = (
        df.groupBy("bucket")
        .agg(F.count("*").alias("count"), F.sum("id").alias("total"))
        .orderBy("bucket")
        .collect()
    )

    buckets = [{"bucket": r["bucket"], "count": r["count"], "total": r["total"]} for r in rows]
    computed_total = sum(b["total"] for b in buckets)
    expected_total = row_count * (row_count + 1) // 2

    return {
        "spark_version": spark.version,
        "master": spark.sparkContext.master,
        "app_name": spark.sparkContext.appName,
        "rows_processed": sum(b["count"] for b in buckets),
        "buckets": buckets,
        "computed_total": computed_total,
        "expected_total": expected_total,
        "result_correct": computed_total == expected_total,
        "duration_ms": round((time.perf_counter() - start) * 1000, 1),
    }
