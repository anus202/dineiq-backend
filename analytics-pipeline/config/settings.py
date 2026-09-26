"""Shared configuration for the DineIQ Analytics Big Data pipeline.

Every script in data_pipeline/, spark_jobs/, python_pipeline/ and src/ imports its
settings from here, so there is exactly one place that knows about the database,
file paths and the synthetic-dataset parameters — no magic numbers duplicated across
scripts.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[1]  # analytics-pipeline/
GIT_ROOT = REPO_ROOT.parent  # the actual repo root, one level up from analytics-pipeline/
# The DB credentials already live in backend/.env (the operational FastAPI app's own
# config) — load from there instead of duplicating them into a second root-level .env.
load_dotenv(GIT_ROOT / "backend" / ".env")
load_dotenv(REPO_ROOT / ".env")  # optional override for big-data-pipeline-only settings

# --- SQL Server (source of the real Customers / Menu Items / Categories) ---------------

DB_SERVER = os.getenv("DB_SERVER", ".")
DB_NAME = os.getenv("DB_NAME", "DineIQ")
DB_USER = os.getenv("DB_USER", "sa")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_ODBC_DRIVER = os.getenv("DB_DRIVER", "ODBC Driver 17 for SQL Server")

# The JDBC port SQL Server's TCP/IP listener must be enabled on for Spark's JDBC reader
# to work (`spark_jobs` scripts that use JDBC directly need this; the pyodbc-based
# ingestion path in data_pipeline/ingest_sql_data.py does not).
DB_JDBC_PORT = int(os.getenv("DB_JDBC_PORT", "1433"))


def jdbc_url() -> str:
    return (
        f"jdbc:sqlserver://{ '127.0.0.1' if DB_SERVER in ('.', 'localhost') else DB_SERVER }:{DB_JDBC_PORT};"
        f"databaseName={DB_NAME};encrypt=true;trustServerCertificate=true;"
        f"loginTimeout=10"
    )


def odbc_connection_string() -> str:
    return (
        f"Driver={{{DB_ODBC_DRIVER}}};Server={DB_SERVER};Database={DB_NAME};"
        f"UID={DB_USER};PWD={DB_PASSWORD};TrustServerCertificate=yes;"
    )


# --- Filesystem layout -------------------------------------------------------------------

RAW_DATA_DIR = REPO_ROOT / "raw_data"
PROCESSED_DATA_DIR = REPO_ROOT / "processed_data"
PARQUET_DIR = PROCESSED_DATA_DIR / "parquet_data"
SPARK_MODELS_DIR = REPO_ROOT / "models" / "spark_models"
PYTHON_MODELS_DIR = REPO_ROOT / "models" / "python_models"
REPORTS_DIR = REPO_ROOT / "reports"
JDBC_JAR_PATH = REPO_ROOT / "lib" / "mssql-jdbc-12.8.1.jre11.jar"

for _dir in (RAW_DATA_DIR, PROCESSED_DATA_DIR, PARQUET_DIR, SPARK_MODELS_DIR, PYTHON_MODELS_DIR, REPORTS_DIR):
    _dir.mkdir(parents=True, exist_ok=True)

# --- Synthetic dataset parameters (SRS minimums: 1,000,000+ order lines, ---------------
# --- 100,000+ orders, 12+ months, 100,000+ ratings, 50,000+ wastage records) -----------

RANDOM_SEED = int(os.getenv("SYNTH_RANDOM_SEED", "42"))
TARGET_ORDER_COUNT = int(os.getenv("SYNTH_ORDER_COUNT", "110_000"))
TARGET_ORDER_LINE_COUNT = int(os.getenv("SYNTH_ORDER_LINE_COUNT", "1_050_000"))
HISTORY_MONTHS = int(os.getenv("SYNTH_HISTORY_MONTHS", "14"))
LOCATION_COUNT = int(os.getenv("SYNTH_LOCATION_COUNT", "22"))
PROMOTION_COUNT = int(os.getenv("SYNTH_PROMOTION_COUNT", "18"))
TARGET_RATING_COUNT = int(os.getenv("SYNTH_RATING_COUNT", "110_000"))
TARGET_WASTAGE_COUNT = int(os.getenv("SYNTH_WASTAGE_COUNT", "55_000"))

ORDER_CHANNELS = ["Dine-in", "Takeaway", "Website", "Mobile App", "Third-Party Delivery"]
ORDER_STATUSES_WEIGHTED = [("Completed", 0.90), ("Cancelled", 0.06), ("Refunded", 0.04)]

# Anomaly injection rates, applied to the CLEAN synthetic data to simulate the messy,
# real-world data the SRS's Data Quality Assessment step (Step 4) must catch. Kept low
# and deliberate (not random noise) so downstream data-quality checks have a known,
# reproducible target to find.
ANOMALY_RATES = {
    "missing_customer_id": 0.004,     # orders with a NULL CustomerId
    "missing_menu_item_id": 0.002,    # order lines with a NULL MenuItemId
    "negative_quantity": 0.003,       # order lines with Quantity < 0
    "invalid_price": 0.002,           # order lines with a price that doesn't match any known menu price
    "duplicate_order": 0.003,         # whole orders duplicated verbatim (same OrderId content, new surrogate key)
    "duplicate_order_line": 0.004,    # order lines duplicated within the same order
    "invalid_date": 0.001,            # OrderDate outside the dataset's valid date range
    "cancelled_with_discount_over_price": 0.001,  # Discount > TotalAmount (incorrect discount)
    "rating_drop": 0.05,              # menu items deliberately given a sudden rating-drop window (Step 30)
    "impossible_wastage_quantity": 0.01,  # wastage rows with a quantity exceeding that day's prepared quantity
}

# Menu items deliberately made "promotion traps" (Step 28): sales rise while margin
# collapses, because feature-engineering / promotion-effectiveness scripts are expected
# to catch this rather than treat "more sales" as automatically good. Chosen at
# ingestion time (a fixed, reproducible fraction of items with a promotion) so every
# pipeline run and dual-pipeline comparison sees the same trap items.
PROMOTION_TRAP_ITEM_FRACTION = 0.12
