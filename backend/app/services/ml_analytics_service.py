from __future__ import annotations

import json
import pickle
import sys
import time
from datetime import date, timedelta
from pathlib import Path
from statistics import median
from typing import Optional

from sqlalchemy import Date, case, cast, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import TTLCache
from app.models import Customer, MenuItem, Order, OrderDetail, Rating

ANALYTICS_PIPELINE_DIR = Path(__file__).resolve().parents[3] / "analytics-pipeline"
if str(ANALYTICS_PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(ANALYTICS_PIPELINE_DIR))

_PIPELINE_IMPORT_ERROR: Optional[str] = None
try:
    from config import settings as pipeline_settings
    from src.analytics.advanced_analytics import (
        analyze_price_sensitivity,
        basket_rules_to_dicts,
        detect_promotion_traps,
        price_sensitivity_to_dicts,
        promotion_traps_to_dicts,
        run_market_basket_analysis,
    )
    from src.analytics.recommendation_engine import generate_recommendations, recommendations_to_dicts
except Exception as exc:
    _PIPELINE_IMPORT_ERROR = str(exc)

CHURN_MODEL_PATH = ANALYTICS_PIPELINE_DIR / "models" / "python_models" / "churn_risk_classifier.pkl"
WASTAGE_MODEL_PATH = ANALYTICS_PIPELINE_DIR / "models" / "python_models" / "wastage_predictor.pkl"
DEFAULT_ELASTICITY_WHEN_UNKNOWN = -0.3
MAX_ASSUMED_ELASTICITY = 2.0

_churn_bundle_cache: Optional[dict] = None

_ML_CACHE_TTL_SECONDS = 300
_market_basket_cache = TTLCache()
_dual_pipeline_cache = TTLCache()
_price_sensitivity_cache = TTLCache()
_promotion_traps_cache = TTLCache()
_ml_recommendations_cache = TTLCache()
_wastage_risk_cache = TTLCache()
_demand_forecast_ml_cache = TTLCache()
_rating_anomalies_cache = TTLCache()
_slow_moving_dishes_cache = TTLCache()

_wastage_bundle_cache: Optional[dict] = None

_CHURN_CACHE_TTL_SECONDS = 300
_churn_scored_cache: Optional[tuple[float, "pd.DataFrame", int]] = None

def _require_pipeline() -> None:
    if _PIPELINE_IMPORT_ERROR:
        raise RuntimeError(
            "Analytics pipeline output is not available "
            f"({_PIPELINE_IMPORT_ERROR}). Run analytics-pipeline's ingestion and "
            "feature-engineering scripts first."
        )

def get_market_basket_rules() -> list[dict]:
    return _market_basket_cache.get_or_set_sync((), _ML_CACHE_TTL_SECONDS, _get_market_basket_rules_uncached)

def _get_market_basket_rules_uncached() -> list[dict]:
    _require_pipeline()
    return basket_rules_to_dicts(run_market_basket_analysis())

def get_price_sensitivity() -> list[dict]:
    return _price_sensitivity_cache.get_or_set_sync((), _ML_CACHE_TTL_SECONDS, _get_price_sensitivity_uncached)

def _get_price_sensitivity_uncached() -> list[dict]:
    _require_pipeline()
    return price_sensitivity_to_dicts(analyze_price_sensitivity())

def get_promotion_traps() -> list[dict]:
    return _promotion_traps_cache.get_or_set_sync((), _ML_CACHE_TTL_SECONDS, _get_promotion_traps_uncached)

def _get_promotion_traps_uncached() -> list[dict]:
    _require_pipeline()
    return promotion_traps_to_dicts(detect_promotion_traps())

def get_ml_recommendations() -> list[dict]:
    return _ml_recommendations_cache.get_or_set_sync((), _ML_CACHE_TTL_SECONDS, _get_ml_recommendations_uncached)

def _get_ml_recommendations_uncached() -> list[dict]:
    _require_pipeline()
    return recommendations_to_dicts(generate_recommendations())

def _load_churn_bundle() -> dict:
    global _churn_bundle_cache
    if _churn_bundle_cache is None:
        if not CHURN_MODEL_PATH.exists():
            raise RuntimeError(f"{CHURN_MODEL_PATH} missing — run python_pipeline/train_python_models.py first.")
        with open(CHURN_MODEL_PATH, "rb") as f:
            _churn_bundle_cache = pickle.load(f)
    return _churn_bundle_cache

async def _scored_customers_df(db: AsyncSession):
    global _churn_scored_cache
    now = time.monotonic()
    if _churn_scored_cache is not None:
        cached_at, cached_df, cached_count = _churn_scored_cache
        if now - cached_at < _CHURN_CACHE_TTL_SECONDS:
            return cached_df, cached_count

    bundle = _load_churn_bundle()
    model = bundle["model"]
    features: list[str] = bundle["features"]

    per_customer = (
        select(
            Order.CustomerId.label("CustomerId"),
            func.min(Order.OrderDate).label("FirstOrderDate"),
            func.max(Order.OrderDate).label("LastOrderDate"),
            func.count().label("Frequency"),
            func.sum(Order.NetAmount).label("Monetary"),
            func.avg(Order.NetAmount).label("AvgOrderValue"),
        )
        .where(Order.CustomerId.is_not(None), Order.IsDeleted == False, Order.Status != "Cancelled")
        .group_by(Order.CustomerId)
        .subquery("per_customer")
    )
    max_date = select(func.max(per_customer.c.LastOrderDate)).scalar_subquery()
    recency = func.datediff(literal_column("day"), per_customer.c.LastOrderDate, max_date)
    tenure = func.datediff(literal_column("day"), per_customer.c.FirstOrderDate, max_date)

    stmt = select(
        per_customer.c.CustomerId,
        Customer.Name,
        recency.label("RecencyDays"),
        per_customer.c.Frequency,
        per_customer.c.Monetary,
        per_customer.c.AvgOrderValue,
        tenure.label("TenureDays"),
    ).join(Customer, Customer.Id == per_customer.c.CustomerId)

    rows = (await db.execute(stmt)).all()

    import pandas as pd

    if not rows:
        df = pd.DataFrame(columns=["CustomerId", "Name", "RecencyDays", "Frequency", "Monetary", "AvgOrderValue", "TenureDays", "ChurnProbability", "RiskLabel"])
        _churn_scored_cache = (now, df, 0)
        return df, 0

    df = pd.DataFrame(
        rows, columns=["CustomerId", "Name", "RecencyDays", "Frequency", "Monetary", "AvgOrderValue", "TenureDays"]
    )
    X = df[features].astype(float)
    df["ChurnProbability"] = model.predict_proba(X)[:, 1]
    df["RiskLabel"] = df["ChurnProbability"].apply(lambda p: "At Risk" if p >= 0.5 else "Retained")
    scored_count = len(df)
    df = df.sort_values("ChurnProbability", ascending=False)
    _churn_scored_cache = (now, df, scored_count)
    return df, scored_count

async def get_churn_risk(db: AsyncSession, limit: int = 50) -> dict:
    df, scored_count = await _scored_customers_df(db)
    top = df.head(limit)

    customers = [
        {
            "CustomerId": int(r.CustomerId),
            "Name": r.Name,
            "RecencyDays": int(r.RecencyDays),
            "Frequency": int(r.Frequency),
            "Monetary": round(float(r.Monetary), 2),
            "AvgOrderValue": round(float(r.AvgOrderValue), 2),
            "TenureDays": int(r.TenureDays),
            "ChurnProbability": round(float(r.ChurnProbability), 4),
            "RiskLabel": r.RiskLabel,
        }
        for r in top.itertuples(index=False)
    ]
    return {"ScoredCustomers": scored_count, "Customers": customers}

def _load_wastage_bundle() -> dict:
    global _wastage_bundle_cache
    if _wastage_bundle_cache is None:
        if not WASTAGE_MODEL_PATH.exists():
            raise RuntimeError(f"{WASTAGE_MODEL_PATH} missing — run python_pipeline/train_python_models.py first.")
        with open(WASTAGE_MODEL_PATH, "rb") as f:
            _wastage_bundle_cache = pickle.load(f)
    return _wastage_bundle_cache

async def get_wastage_risk(db: AsyncSession, limit: int = 50) -> list[dict]:
    return await _wastage_risk_cache.get_or_set(limit, _ML_CACHE_TTL_SECONDS, lambda: _get_wastage_risk_uncached(db, limit))

async def _get_wastage_risk_uncached(db: AsyncSession, limit: int = 50) -> list[dict]:
    bundle = _load_wastage_bundle()
    model = bundle["model"]
    features: list[str] = bundle["features"]

    unit_cost = func.coalesce(OrderDetail.UnitCost, MenuItem.Cost)
    rows = (
        await db.execute(
            select(
                MenuItem.Id,
                MenuItem.Name,
                func.coalesce(func.sum(OrderDetail.Quantity), 0),
                func.coalesce(func.sum(OrderDetail.TotalPrice), 0),
                func.coalesce(func.sum(OrderDetail.Quantity * unit_cost), 0),
                func.avg(OrderDetail.UnitPrice),
            )
            .select_from(MenuItem)
            .join(OrderDetail, OrderDetail.MenuItemId == MenuItem.Id)
            .join(Order, Order.Id == OrderDetail.OrderId)
            .where(OrderDetail.IsDeleted == False, Order.Status != "Cancelled", Order.IsDeleted == False)
            .group_by(MenuItem.Id, MenuItem.Name)
        )
    ).all()
    if not rows:
        return []

    rating_rows = (
        await db.execute(
            select(Rating.MenuItemId, func.avg(Rating.Score), func.count())
            .where(Rating.IsDeleted == False)
            .group_by(Rating.MenuItemId)
        )
    ).all()
    ratings_by_item = {r[0]: (float(r[1]), int(r[2])) for r in rating_rows}

    promoted_by_item: dict[int, int] = {}

    import pandas as pd

    records = []
    for menu_item_id, name, qty, revenue, cost, avg_price in rows:
        revenue = float(revenue or 0)
        cost = float(cost or 0)
        margin_pct = ((revenue - cost) / revenue * 100) if revenue else 0.0
        avg_rating, rating_count = ratings_by_item.get(menu_item_id, (0.0, 0))
        records.append(
            {
                "MenuItemId": menu_item_id,
                "MenuItemName": name,
                "TotalQuantitySold": float(qty or 0),
                "TotalRevenue": revenue,
                "MarginPercent": margin_pct,
                "AvgSellingPrice": float(avg_price or 0),
                "AvgRating": avg_rating,
                "RatingCount": rating_count,
                "PromotedOrderCount": promoted_by_item.get(menu_item_id, 0),
            }
        )
    df = pd.DataFrame.from_records(records)
    X = df[features].astype(float)
    df["PredictedWastagePercent"] = model.predict(X)
    df["RiskLabel"] = df["PredictedWastagePercent"].apply(
        lambda p: "Critical" if p >= 30 else "High" if p >= 15 else "Moderate" if p >= 5 else "Low"
    )
    df = df.sort_values("PredictedWastagePercent", ascending=False).head(limit)

    return [
        {
            "MenuItemId": int(r.MenuItemId),
            "MenuItemName": r.MenuItemName,
            "PredictedWastagePercent": round(float(r.PredictedWastagePercent), 2),
            "RiskLabel": r.RiskLabel,
            "TotalQuantitySold": round(float(r.TotalQuantitySold), 1),
            "AvgRating": round(float(r.AvgRating), 2),
        }
        for r in df.itertuples(index=False)
    ]

async def get_demand_forecast_ml(db: AsyncSession, limit: int = 50, branch_id: Optional[int] = None) -> list[dict]:
    return await _demand_forecast_ml_cache.get_or_set(
        (limit, branch_id), _ML_CACHE_TTL_SECONDS, lambda: _get_demand_forecast_ml_uncached(db, limit, branch_id)
    )

_MIN_MENU_ITEMS_FOR_BRANCH_FORECAST = 3

async def _get_demand_forecast_ml_uncached(db: AsyncSession, limit: int = 50, branch_id: Optional[int] = None) -> list[dict]:
    bundle = _load_demand_bundle()
    model = bundle["model"]
    features: list[str] = bundle["features"]

    today = date.today()
    month_start = today.replace(day=1)

    unit_cost = func.coalesce(OrderDetail.UnitCost, MenuItem.Cost)
    filters = [
        OrderDetail.IsDeleted == False,
        Order.Status != "Cancelled",
        Order.IsDeleted == False,
        cast(Order.OrderDate, Date) >= month_start,
    ]
    if branch_id is not None:
        filters.append(Order.BranchId == branch_id)

    rows = (
        await db.execute(
            select(
                MenuItem.Id,
                MenuItem.Name,
                func.coalesce(func.sum(OrderDetail.Quantity), 0),
                func.coalesce(func.sum(OrderDetail.TotalPrice), 0),
                func.coalesce(func.sum(OrderDetail.Quantity * unit_cost), 0),
                func.avg(OrderDetail.UnitPrice),
                func.count(func.distinct(OrderDetail.OrderId)),
            )
            .select_from(MenuItem)
            .join(OrderDetail, OrderDetail.MenuItemId == MenuItem.Id)
            .join(Order, Order.Id == OrderDetail.OrderId)
            .where(*filters)
            .group_by(MenuItem.Id, MenuItem.Name)
        )
    ).all()
    if branch_id is not None and len(rows) < _MIN_MENU_ITEMS_FOR_BRANCH_FORECAST:
        return await _get_demand_forecast_ml_uncached(db, limit, branch_id=None)
    if not rows:
        return []

    rating_rows = (
        await db.execute(
            select(Rating.MenuItemId, func.avg(Rating.Score), func.count())
            .where(Rating.IsDeleted == False)
            .group_by(Rating.MenuItemId)
        )
    ).all()
    ratings_by_item = {r[0]: (float(r[1]), int(r[2])) for r in rating_rows}

    import pandas as pd

    records = []
    for menu_item_id, name, qty, revenue, cost, avg_price, order_count in rows:
        revenue = float(revenue or 0)
        cost = float(cost or 0)
        margin_pct = ((revenue - cost) / revenue * 100) if revenue else 0.0
        avg_rating, rating_count = ratings_by_item.get(menu_item_id, (0.0, 0))
        records.append(
            {
                "MenuItemId": menu_item_id,
                "MenuItemName": name,
                "QuantitySold": float(qty or 0),
                "Revenue": revenue,
                "MarginPercent": margin_pct,
                "AvgSellingPrice": float(avg_price or 0),
                "AvgRating": avg_rating,
                "RatingCount": rating_count,
                "PromotedOrderCount": 0,
            }
        )
    df = pd.DataFrame.from_records(records)
    X = df[features].astype(float)
    df["PredictedNextMonthQuantity"] = model.predict(X)
    df = df.sort_values("PredictedNextMonthQuantity", ascending=False).head(limit)

    return [
        {
            "MenuItemId": int(r.MenuItemId),
            "MenuItemName": r.MenuItemName,
            "CurrentMonthQuantity": round(float(r.QuantitySold), 1),
            "PredictedNextMonthQuantity": round(float(r.PredictedNextMonthQuantity), 1),
        }
        for r in df.itertuples(index=False)
    ]

DEMAND_MODEL_PATH = ANALYTICS_PIPELINE_DIR / "models" / "python_models" / "demand_forecast_regressor.pkl"
_demand_bundle_cache: Optional[dict] = None

def _load_demand_bundle() -> dict:
    global _demand_bundle_cache
    if _demand_bundle_cache is None:
        if not DEMAND_MODEL_PATH.exists():
            raise RuntimeError(f"{DEMAND_MODEL_PATH} missing — run python_pipeline/train_python_models.py first.")
        with open(DEMAND_MODEL_PATH, "rb") as f:
            _demand_bundle_cache = pickle.load(f)
    return _demand_bundle_cache

_demand_accuracy_cache: Optional[dict] = None

def get_demand_model_accuracy() -> Optional[dict]:
    global _demand_accuracy_cache
    if _demand_accuracy_cache is None:
        metrics_path = ANALYTICS_PIPELINE_DIR / "reports" / "python_model_metrics.json"
        if not metrics_path.exists():
            return None
        with open(metrics_path, encoding="utf-8") as f:
            report = json.load(f)
        demand = report.get("demand_forecasting")
        if not demand:
            return None
        _demand_accuracy_cache = {
            "mae": demand.get("mae"),
            "rmse": demand.get("rmse"),
            "mape_percent": demand.get("mape_percent"),
            "improvement_over_baseline_percent": demand.get("improvement_over_baseline_percent"),
        }
    return _demand_accuracy_cache

async def get_rating_anomalies(db: AsyncSession, lookback_days: int = 180, trailing_window: int = 30) -> list[dict]:
    return await _rating_anomalies_cache.get_or_set(
        (lookback_days, trailing_window), _ML_CACHE_TTL_SECONDS, lambda: _get_rating_anomalies_uncached(db, lookback_days, trailing_window)
    )

async def _get_rating_anomalies_uncached(db: AsyncSession, lookback_days: int = 180, trailing_window: int = 30) -> list[dict]:
    since = date.today() - timedelta(days=lookback_days + trailing_window)
    local_date = cast(Rating.CreatedAt, Date)

    rows = (
        await db.execute(
            select(
                Rating.MenuItemId,
                local_date.label("d"),
                func.avg(Rating.Score),
                func.count(),
                func.stdev(Rating.Score),
            )
            .where(Rating.CreatedAt >= since, Rating.IsDeleted == False)
            .group_by(Rating.MenuItemId, local_date)
            .order_by(Rating.MenuItemId, local_date)
        )
    ).all()
    if not rows:
        return []

    menu_item_ids = {r[0] for r in rows}
    names = dict(
        (await db.execute(select(MenuItem.Id, MenuItem.Name).where(MenuItem.Id.in_(menu_item_ids)))).all()
    )

    by_item: dict[int, list[tuple]] = {}
    for menu_item_id, d, avg_score, cnt, stdev_score in rows:
        by_item.setdefault(menu_item_id, []).append((d, float(avg_score), int(cnt), float(stdev_score or 0)))

    anomalies: list[dict] = []
    for menu_item_id, series in by_item.items():
        scores = [s[1] for s in series]
        counts = [s[2] for s in series]
        for i in range(trailing_window, len(series)):
            d, avg_score, cnt, stdev_score = series[i]
            trailing_scores = scores[i - trailing_window : i]
            trailing_counts = counts[i - trailing_window : i]
            trailing_avg_score = sum(trailing_scores) / len(trailing_scores)
            trailing_avg_count = sum(trailing_counts) / len(trailing_counts) if trailing_counts else 0.0

            score_deviation = avg_score - trailing_avg_score
            item_name = names.get(menu_item_id, f"Item {menu_item_id}")

            if trailing_avg_score > 0 and abs(score_deviation) >= 1.0:
                anomalies.append(
                    {
                        "menu_item_id": menu_item_id,
                        "menu_item_name": item_name,
                        "date": d.isoformat(),
                        "anomaly_type": "RATING_SPIKE" if score_deviation > 0 else "RATING_DROP",
                        "rating_count": cnt,
                        "average_score": round(avg_score, 2),
                        "trailing_average_score": round(trailing_avg_score, 2),
                        "reason": f"Average rating {avg_score:.1f} vs trailing {trailing_window}-day average {trailing_avg_score:.1f}",
                    }
                )
            if trailing_avg_count > 0 and cnt >= max(5, trailing_avg_count * 3):
                anomalies.append(
                    {
                        "menu_item_id": menu_item_id,
                        "menu_item_name": item_name,
                        "date": d.isoformat(),
                        "anomaly_type": "VOLUME_SPIKE",
                        "rating_count": cnt,
                        "average_score": round(avg_score, 2),
                        "trailing_average_score": round(trailing_avg_score, 2),
                        "reason": f"{cnt} ratings vs trailing average {trailing_avg_count:.1f}/day",
                    }
                )
            if cnt >= 5 and stdev_score == 0:
                anomalies.append(
                    {
                        "menu_item_id": menu_item_id,
                        "menu_item_name": item_name,
                        "date": d.isoformat(),
                        "anomaly_type": "IDENTICAL_CLUSTER",
                        "rating_count": cnt,
                        "average_score": round(avg_score, 2),
                        "trailing_average_score": round(trailing_avg_score, 2),
                        "reason": f"All {cnt} ratings on this day are identical (score={avg_score:.0f})",
                    }
                )

    anomalies.sort(key=lambda a: a["date"], reverse=True)
    return anomalies[:200]

async def get_slow_moving_dishes(db: AsyncSession, branch_id: Optional[int] = None, min_signals: int = 2) -> list[dict]:
    return await _slow_moving_dishes_cache.get_or_set(
        (branch_id, min_signals), _ML_CACHE_TTL_SECONDS, lambda: _get_slow_moving_dishes_uncached(db, branch_id, min_signals)
    )

async def _get_slow_moving_dishes_uncached(db: AsyncSession, branch_id: Optional[int] = None, min_signals: int = 2) -> list[dict]:
    unit_cost = func.coalesce(OrderDetail.UnitCost, MenuItem.Cost)
    base_filters = [OrderDetail.IsDeleted == False, Order.Status != "Cancelled", Order.IsDeleted == False]
    if branch_id is not None:
        base_filters.append(Order.BranchId == branch_id)

    today = date.today()
    recent_cutoff = today - timedelta(days=30)
    prior_cutoff = today - timedelta(days=60)

    rows = (
        await db.execute(
            select(
                MenuItem.Id,
                MenuItem.Name,
                func.sum(OrderDetail.Quantity),
                func.count(func.distinct(OrderDetail.OrderId)),
                func.max(Order.OrderDate),
                func.sum(OrderDetail.TotalPrice),
                func.sum(OrderDetail.Quantity * unit_cost),
                func.sum(case((cast(Order.OrderDate, Date) >= recent_cutoff, OrderDetail.Quantity), else_=0)),
                func.sum(
                    case(
                        (
                            (cast(Order.OrderDate, Date) >= prior_cutoff) & (cast(Order.OrderDate, Date) < recent_cutoff),
                            OrderDetail.Quantity,
                        ),
                        else_=0,
                    )
                ),
            )
            .select_from(OrderDetail)
            .join(Order, Order.Id == OrderDetail.OrderId)
            .join(MenuItem, MenuItem.Id == OrderDetail.MenuItemId)
            .where(*base_filters)
            .group_by(MenuItem.Id, MenuItem.Name)
        )
    ).all()
    if not rows:
        return []

    computed = []
    for menu_item_id, name, qty, order_count, last_sold, revenue, cost, recent_qty, prior_qty in rows:
        qty = int(qty or 0)
        order_count = int(order_count or 0)
        revenue = float(revenue or 0)
        cost = float(cost or 0)
        margin_pct = ((revenue - cost) / revenue * 100) if revenue else 0.0
        recency_days = (today - last_sold.date()).days if last_sold else 9999
        computed.append(
            {
                "menu_item_id": menu_item_id,
                "menu_item_name": name,
                "total_quantity_sold": qty,
                "order_count": order_count,
                "recency_days": recency_days,
                "margin_percent": round(margin_pct, 2),
                "recent_30d_quantity": int(recent_qty or 0),
                "prior_30d_quantity": int(prior_qty or 0),
            }
        )

    median_qty = median(c["total_quantity_sold"] for c in computed)
    median_orders = median(c["order_count"] for c in computed)
    median_margin = median(c["margin_percent"] for c in computed)

    results = []
    for c in computed:
        signals = []
        if c["total_quantity_sold"] < median_qty * 0.4:
            signals.append("Low sales volume")
        if c["order_count"] < median_orders * 0.4:
            signals.append("Low purchase frequency")
        if c["recency_days"] > 21:
            signals.append("Long gap since last purchase")
        if c["margin_percent"] < median_margin:
            signals.append("Weak profitability")
        if c["prior_30d_quantity"] > 0 and c["recent_30d_quantity"] < c["prior_30d_quantity"] * 0.7:
            signals.append("Declining trend")

        if len(signals) >= min_signals:
            results.append({**c, "signal_count": len(signals), "signals": signals})

    results.sort(key=lambda r: (-r["signal_count"], r["total_quantity_sold"]))
    return results

def _pipeline_elasticity_for(menu_item_id: int) -> Optional[float]:
    if _PIPELINE_IMPORT_ERROR:
        return None
    try:
        import pandas as pd

        features_path = pipeline_settings.PROCESSED_DATA_DIR / "clean_parquet" / "menu_item_features"
        if not features_path.exists():
            return None
        df = pd.read_parquet(features_path)
        row = df[df["MenuItemId"] == menu_item_id]
        if row.empty:
            return None
        corr = row.iloc[0].get("PriceQuantityCorrelation")
        if corr is None or pd.isna(corr):
            return None
        return max(-MAX_ASSUMED_ELASTICITY, min(MAX_ASSUMED_ELASTICITY, float(corr) * MAX_ASSUMED_ELASTICITY))
    except Exception:
        return None

async def simulate_what_if(
    db: AsyncSession,
    menu_item_id: int,
    price_change_percent: float = 0.0,
    discount_percent: float = 0.0,
    remove_item: bool = False,
    prep_quantity_change_percent: float = 0.0,
    wastage_assumption_change_percent: float = 0.0,
) -> dict:
    menu_item = (await db.execute(select(MenuItem).where(MenuItem.Id == menu_item_id))).scalar_one_or_none()
    if menu_item is None:
        raise ValueError(f"MenuItem {menu_item_id} not found")

    agg = (
        await db.execute(
            select(func.coalesce(func.sum(OrderDetail.Quantity), 0), func.coalesce(func.sum(OrderDetail.TotalPrice), 0))
            .join(Order, Order.Id == OrderDetail.OrderId)
            .where(OrderDetail.MenuItemId == menu_item_id, Order.Status != "Cancelled", Order.IsDeleted == False)
        )
    ).one()
    current_quantity, current_revenue = float(agg[0]), float(agg[1])

    current_price = float(menu_item.Price)
    current_cost = float(menu_item.Cost)
    current_margin_pct = round((current_price - current_cost) / current_price * 100, 2) if current_price else 0.0
    current_profit = round((current_price - current_cost) * current_quantity, 2)

    def pct_delta(new: float, old: float) -> float:
        return round((new - old) / abs(old) * 100, 2) if old else 0.0

    if remove_item:

        result = {
            "menu_item_id": menu_item_id,
            "menu_item_name": menu_item.Name,
            "price_change_percent": price_change_percent,
            "discount_percent": discount_percent,
            "remove_item": True,
            "prep_quantity_change_percent": prep_quantity_change_percent,
            "wastage_assumption_change_percent": wastage_assumption_change_percent,
            "elasticity_coefficient": 0.0,
            "current_price": round(current_price, 2),
            "projected_price": 0.0,
            "current_quantity": round(current_quantity, 1),
            "projected_quantity": 0.0,
            "current_revenue": round(current_revenue, 2),
            "projected_revenue": 0.0,
            "current_profit": current_profit,
            "projected_profit": 0.0,
            "current_margin_percent": current_margin_pct,
            "projected_margin_percent": 0.0,
            "revenue_delta_percent": pct_delta(0.0, current_revenue),
            "profit_delta_percent": pct_delta(0.0, current_profit),
            "volume_delta_percent": pct_delta(0.0, current_quantity),
        }
        return result

    elasticity = _pipeline_elasticity_for(menu_item_id)
    if elasticity is None:
        elasticity = DEFAULT_ELASTICITY_WHEN_UNKNOWN

    net_price_change_percent = price_change_percent - discount_percent
    projected_price = round(current_price * (1 + net_price_change_percent / 100), 2)
    projected_quantity = max(0.0, current_quantity * (1 + elasticity * net_price_change_percent / 100))

    if prep_quantity_change_percent:
        supply_cap = max(0.0, current_quantity * (1 + prep_quantity_change_percent / 100))
        projected_quantity = min(projected_quantity, supply_cap)

    projected_revenue = round(projected_price * projected_quantity, 2)
    projected_unit_margin = projected_price - current_cost
    projected_profit = round(projected_unit_margin * projected_quantity, 2)

    if wastage_assumption_change_percent:
        wastage_cost_delta = round(current_cost * projected_quantity * (wastage_assumption_change_percent / 100), 2)
        projected_profit -= wastage_cost_delta

    projected_margin_pct = round((projected_unit_margin / projected_price * 100) if projected_price else 0.0, 2)

    return {
        "menu_item_id": menu_item_id,
        "menu_item_name": menu_item.Name,
        "price_change_percent": price_change_percent,
        "discount_percent": discount_percent,
        "remove_item": False,
        "prep_quantity_change_percent": prep_quantity_change_percent,
        "wastage_assumption_change_percent": wastage_assumption_change_percent,
        "elasticity_coefficient": round(elasticity, 3),
        "current_price": round(current_price, 2),
        "projected_price": projected_price,
        "current_quantity": round(current_quantity, 1),
        "projected_quantity": round(projected_quantity, 1),
        "current_revenue": round(current_revenue, 2),
        "projected_revenue": projected_revenue,
        "current_profit": current_profit,
        "projected_profit": projected_profit,
        "current_margin_percent": current_margin_pct,
        "projected_margin_percent": projected_margin_pct,
        "revenue_delta_percent": pct_delta(projected_revenue, current_revenue),
        "profit_delta_percent": pct_delta(projected_profit, current_profit),
        "volume_delta_percent": pct_delta(projected_quantity, current_quantity),
    }

def get_dual_pipeline_comparison() -> dict:
    return _dual_pipeline_cache.get_or_set_sync((), _ML_CACHE_TTL_SECONDS, _get_dual_pipeline_comparison_uncached)

def _get_dual_pipeline_comparison_uncached() -> dict:
    spark_path = ANALYTICS_PIPELINE_DIR / "reports" / "spark_model_metrics.json"
    python_path = ANALYTICS_PIPELINE_DIR / "reports" / "python_model_metrics.json"
    comparison_path = ANALYTICS_PIPELINE_DIR / "reports" / "dual_pipeline_report.json"
    missing = [p.name for p in (spark_path, python_path, comparison_path) if not p.exists()]
    if missing:
        names = ", ".join(missing)
        raise RuntimeError(
            f"Dual-pipeline reports not found: {names}. Run spark_jobs/spark_mllib_models.py, "
            "python_pipeline/train_python_models.py, then src/analytics/dual_pipeline_verifier.py first."
        )
    with open(spark_path, encoding="utf-8") as f:
        spark_metrics = json.load(f)
    with open(python_path, encoding="utf-8") as f:
        python_metrics = json.load(f)
    with open(comparison_path, encoding="utf-8") as f:
        comparison = json.load(f)
    return {
        "spark_pipeline": spark_metrics,
        "python_pipeline": python_metrics,
        "comparison": comparison,
    }
