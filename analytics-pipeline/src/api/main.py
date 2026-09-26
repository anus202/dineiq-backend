"""SECTION 5 — DineIQ Analytics FastAPI application.

Serves the outputs of Sections 1-4 (ingestion, Spark MLlib models, the Python/XGBoost
pipeline, and the analytics engines) over HTTP for the React frontend (Section 6).

Run with:
    .venv-bigdata\\Scripts\\python -m uvicorn src.api.main:app --port 8010 --reload
"""
from __future__ import annotations

import json
import logging
import subprocess
import sys
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from config import settings  # noqa: E402
from src.analytics.advanced_analytics import (  # noqa: E402
    basket_rules_to_dicts,
    price_sensitivity_to_dicts,
    promotion_traps_to_dicts,
    analyze_price_sensitivity,
    detect_promotion_traps,
    run_market_basket_analysis,
)
from src.analytics.dual_pipeline_verifier import (  # noqa: E402
    report_to_dict,
    run_dual_pipeline_verification,
)
from src.analytics.recommendation_engine import (  # noqa: E402
    generate_recommendations,
    recommendations_to_dicts,
)
from src.analytics.what_if_simulator import (  # noqa: E402
    WhatIfSimulator,
    what_if_result_to_dict,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s  %(message)s")
log = logging.getLogger("dineiq_analytics_api")

app = FastAPI(
    title="DineIQ Analytics API",
    description="Data Science Intelligence Arena — dual-pipeline ML, market-basket analysis, "
    "promotion trap detection, price elasticity, recommendations, and what-if simulation.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://localhost:5173", "http://127.0.0.1:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_simulator: Optional[WhatIfSimulator] = None


def get_simulator() -> WhatIfSimulator:
    global _simulator
    if _simulator is None:
        _simulator = WhatIfSimulator()
    return _simulator


class IngestRequest(BaseModel):
    source: Literal["pyodbc", "jdbc"] = "pyodbc"
    target_orders: int = Field(default=settings.TARGET_ORDER_COUNT, ge=1000)
    target_lines: int = Field(default=settings.TARGET_ORDER_LINE_COUNT, ge=1000)
    history_months: int = Field(default=settings.HISTORY_MONTHS, ge=1, le=60)


class WhatIfRequest(BaseModel):
    menu_item_id: int
    price_change_percent: float = Field(default=0.0, ge=-90, le=200)
    discount_percent: float = Field(default=0.0, ge=0, le=100)


@app.get("/api/v1/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/v1/ingest/sql")
def trigger_ingestion(payload: IngestRequest) -> dict:
    """Kicks off data_pipeline/ingest_sql_data.py as a subprocess. Runs synchronously and
    returns once the ingestion completes (or fails) — the Data Engineer UI shows this as
    a blocking action with a status log, matching the SRS's ingestion-trigger workflow.
    """
    script = settings.REPO_ROOT / "data_pipeline" / "ingest_sql_data.py"
    if not script.exists():
        raise HTTPException(status_code=500, detail=f"{script} not found on server.")

    cmd = [
        sys.executable,
        str(script),
        "--source", payload.source,
        "--target-orders", str(payload.target_orders),
        "--target-lines", str(payload.target_lines),
        "--history-months", str(payload.history_months),
    ]
    log.info("Triggering ingestion: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(settings.REPO_ROOT))
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail={"error": "Ingestion failed", "stderr": result.stderr[-4000:]})

    summary_path = settings.PROCESSED_DATA_DIR / "ingestion_summary.json"
    summary = json.loads(summary_path.read_text()) if summary_path.exists() else {}
    return {"status": "completed", "source": payload.source, "summary": summary, "log_tail": result.stdout[-4000:]}


@app.get("/api/v1/dashboard/executive")
def executive_dashboard() -> dict:
    """Aggregated numbers for the Executive role's landing dashboard."""
    import pandas as pd

    fact_sales_path = settings.PROCESSED_DATA_DIR / "clean_parquet" / "fact_sales"
    features_path = settings.PROCESSED_DATA_DIR / "clean_parquet" / "menu_item_features"
    if not fact_sales_path.exists() or not features_path.exists():
        raise HTTPException(status_code=404, detail="Clean data not found — run the ingestion and Spark cleaning jobs first.")

    fact_sales = pd.read_parquet(fact_sales_path)
    menu_features = pd.read_parquet(features_path)

    total_revenue = float(fact_sales["LineTotal"].sum())
    total_margin = float(fact_sales["LineMargin"].sum())
    total_orders = int(fact_sales["OrderId"].nunique())
    class_counts = menu_features["MenuPerformanceClass"].value_counts().to_dict()

    top_items = (
        menu_features.sort_values("TotalRevenue", ascending=False)
        .head(10)[["MenuItemId", "MenuItemName", "TotalRevenue", "MarginPercent", "MenuPerformanceClass"]]
        .to_dict(orient="records")
    )
    revenue_by_category = (
        fact_sales.groupby("CategoryName")["LineTotal"].sum().sort_values(ascending=False).round(2).to_dict()
    )

    return {
        "total_revenue": round(total_revenue, 2),
        "total_margin": round(total_margin, 2),
        "overall_margin_percent": round(total_margin / total_revenue * 100, 2) if total_revenue else 0.0,
        "total_orders": total_orders,
        "average_order_value": round(total_revenue / total_orders, 2) if total_orders else 0.0,
        "menu_performance_distribution": class_counts,
        "top_menu_items_by_revenue": top_items,
        "revenue_by_category": revenue_by_category,
    }


@app.get("/api/v1/menu/intelligence")
def menu_intelligence() -> dict:
    """Full menu-engineering matrix plus price-sensitivity, for the Menu Matrix screen."""
    import pandas as pd

    features_path = settings.PROCESSED_DATA_DIR / "clean_parquet" / "menu_item_features"
    if not features_path.exists():
        raise HTTPException(status_code=404, detail="menu_item_features not found — run spark_jobs/feature_engineering.py first.")
    df = pd.read_parquet(features_path)

    items = df[[
        "MenuItemId", "MenuItemName", "CategoryName", "TotalQuantitySold", "TotalRevenue",
        "MarginPercent", "WastagePercent", "AvgRating", "MenuPerformanceClass",
    ]].fillna(0).to_dict(orient="records")

    sensitivity = price_sensitivity_to_dicts(analyze_price_sensitivity())
    return {"menu_items": items, "price_sensitivity": sensitivity}


@app.get("/api/v1/analytics/market-basket")
def market_basket() -> dict:
    return {"rules": basket_rules_to_dicts(run_market_basket_analysis())}


@app.get("/api/v1/analytics/promotion-traps")
def promotion_traps() -> dict:
    return {"traps": promotion_traps_to_dicts(detect_promotion_traps())}


@app.get("/api/v1/dual-pipeline/compare")
def dual_pipeline_compare(sample_size: int = 100) -> dict:
    try:
        report = run_dual_pipeline_verification(sample_size=sample_size)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return report_to_dict(report)


@app.post("/api/v1/simulate/what-if")
def simulate_what_if(payload: WhatIfRequest) -> dict:
    try:
        simulator = get_simulator()
        result = simulator.simulate(
            menu_item_id=payload.menu_item_id,
            price_change_percent=payload.price_change_percent,
            discount_percent=payload.discount_percent,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return what_if_result_to_dict(result)


@app.get("/api/v1/recommendations")
def recommendations() -> dict:
    try:
        recs = generate_recommendations()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"recommendations": recommendations_to_dicts(recs)}


@app.get("/api/v1/models/metrics")
def model_metrics() -> dict:
    """Raw Spark + Python model metrics, for a Data Engineer / Analyst diagnostics view."""
    spark_path = settings.REPORTS_DIR / "spark_model_metrics.json"
    python_path = settings.REPORTS_DIR / "python_model_metrics.json"
    dq_path = settings.REPORTS_DIR / "data_quality_report.json"
    return {
        "spark_mllib": json.loads(spark_path.read_text()) if spark_path.exists() else None,
        "python_xgboost": json.loads(python_path.read_text()) if python_path.exists() else None,
        "data_quality": json.loads(dq_path.read_text()) if dq_path.exists() else None,
    }
