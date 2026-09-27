"""Data-quality, schema-validation and boundary tests.

Two layers:
  1. The analytics pipeline's cleaned Parquet output must actually obey every documented
     cleaning rule in spark_jobs/ingest_and_clean.py (SRS Steps 4-5).
  2. The live SQL Server dataset must meet the SRS's minimum dataset sizes and value
     ranges (SRS dataset "Hint" section and Step 1).
"""
import json

import pandas as pd
import pytest

from conftest import CLEAN_DIR, REPORTS_DIR, require_path, scalar

# --- Pipeline cleaning rules ---------------------------------------------------------


@pytest.fixture(scope="module")
def quality_report():
    return json.loads(require_path(REPORTS_DIR / "data_quality_report.json").read_text())


def test_quality_report_covers_required_tables(quality_report):
    assert {"orders", "order_lines", "wastage", "fact_sales_row_count"} <= quality_report.keys()


def test_quality_report_detected_injected_anomalies(quality_report):
    """The generator deliberately injects bad rows; a report of all zeros would mean the
    assessment isn't actually looking."""
    orders, lines = quality_report["orders"], quality_report["order_lines"]
    assert orders["duplicate_rows_dropped"] > 0
    assert orders["missing_customer_id_tagged"] > 0
    assert lines["negative_quantity_corrected"] > 0
    assert lines["invalid_price_corrected"] > 0


def test_orders_are_fully_accounted_for(quality_report):
    orders = quality_report["orders"]
    assert orders["total_rows_out_clean"] + orders["total_rows_quarantined"] == orders["total_rows_in"]


def test_cleaning_never_increases_row_counts(quality_report):
    for table in ("orders", "order_lines", "wastage"):
        section = quality_report[table]
        assert 0 < section["total_rows_out_clean"] <= section["total_rows_in"]


@pytest.fixture(scope="module")
def fact_sales():
    path = require_path(CLEAN_DIR / "fact_sales")
    return pd.read_parquet(path, columns=["OrderId", "MenuItemId", "CustomerId", "Status", "Quantity", "UnitPrice", "LineTotal"])


def test_fact_sales_has_no_missing_menu_items(fact_sales):
    assert fact_sales["MenuItemId"].notna().all()


def test_fact_sales_quantities_are_positive(fact_sales):
    assert (fact_sales["Quantity"] > 0).all()


def test_fact_sales_prices_are_positive(fact_sales):
    assert (fact_sales["UnitPrice"] > 0).all()


def test_fact_sales_only_contains_completed_orders(fact_sales):
    assert set(fact_sales["Status"].unique()) == {"Completed"}


def test_fact_sales_line_totals_match_quantity_times_price(fact_sales):
    expected = (fact_sales["Quantity"] * fact_sales["UnitPrice"]).round(2)
    assert (expected - fact_sales["LineTotal"].astype(float)).abs().max() <= 0.01


def test_missing_customers_are_tagged_not_dropped(fact_sales):
    assert fact_sales["CustomerId"].notna().all()
    assert (fact_sales["CustomerId"] == -1).any()


def test_clean_orders_never_discount_more_than_the_bill():
    orders = pd.read_parquet(require_path(CLEAN_DIR / "orders"), columns=["Discount", "TotalAmount", "NetAmount"])
    assert (orders["Discount"] <= orders["TotalAmount"]).all()
    assert (orders["NetAmount"] >= 0).all()


def test_clean_ratings_are_within_one_to_five():
    ratings = pd.read_parquet(require_path(CLEAN_DIR / "ratings"), columns=["Score"])
    assert ratings["Score"].between(1, 5).all()


# --- Live SQL Server dataset: SRS minimums and value ranges --------------------------

SRS_MINIMUMS = [
    ("order-line records", "SELECT COUNT(*) FROM Order_Items", 1_000_000),
    ("unique orders", "SELECT COUNT(*) FROM Orders", 100_000),
    ("customers", "SELECT COUNT(*) FROM Customers", 50_000),
    ("menu items", "SELECT COUNT(*) FROM Menu_Items", 150),
    ("menu categories", "SELECT COUNT(*) FROM Menu_Categories", 10),
    ("restaurant locations", "SELECT COUNT(*) FROM Restaurants", 20),
    ("rating records", "SELECT COUNT(*) FROM Ratings", 100_000),
    ("wastage records", "SELECT COUNT(*) FROM Wastage", 50_000),
    ("historical pricing records", "SELECT COUNT(*) FROM Pricing_History", 2),
    ("promotion campaigns", "SELECT COUNT(*) FROM Promotions", 2),
]


@pytest.mark.parametrize("label,sql,minimum", SRS_MINIMUMS, ids=[m[0] for m in SRS_MINIMUMS])
def test_dataset_meets_srs_minimum(db, label, sql, minimum):
    count = scalar(db, sql)
    assert count >= minimum, f"{label}: {count:,} < SRS minimum {minimum:,}"


def test_dataset_spans_at_least_twelve_months(db):
    months = scalar(db, "SELECT DATEDIFF(month, MIN(OrderDate), MAX(OrderDate)) FROM Orders")
    assert months >= 12


def test_ratings_are_within_one_to_five(db):
    assert scalar(db, "SELECT COUNT(*) FROM Ratings WHERE Score < 1 OR Score > 5") == 0


def test_order_quantities_are_positive(db):
    assert scalar(db, "SELECT COUNT(*) FROM Order_Items WHERE Quantity <= 0") == 0


def test_order_lines_reference_existing_orders_and_items(db):
    orphans = scalar(
        db,
        "SELECT COUNT(*) FROM Order_Items d "
        "LEFT JOIN Orders o ON o.Id = d.OrderId LEFT JOIN Menu_Items m ON m.Id = d.MenuItemId "
        "WHERE o.Id IS NULL OR m.Id IS NULL",
    )
    assert orphans == 0


def test_pricing_history_chains_old_to_new_price(db):
    """Each item's history must end at its current catalog price."""
    mismatches = scalar(
        db,
        ";WITH latest AS ("
        "  SELECT MenuItemId, NewPrice, ROW_NUMBER() OVER (PARTITION BY MenuItemId ORDER BY ChangedAt DESC) AS rn"
        "  FROM Pricing_History)"
        " SELECT COUNT(*) FROM latest l JOIN Menu_Items m ON m.Id = l.MenuItemId"
        " WHERE l.rn = 1 AND l.NewPrice <> m.Price",
    )
    assert mismatches == 0


def test_promotion_discounts_and_dates_are_valid(db):
    invalid = scalar(
        db,
        "SELECT COUNT(*) FROM Promotions WHERE DiscountPercent <= 0 OR DiscountPercent > 100 OR EndDate < StartDate",
    )
    assert invalid == 0
