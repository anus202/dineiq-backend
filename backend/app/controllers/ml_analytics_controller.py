from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_roles
from app.core.roles import BRANCH_MANAGERS
from app.db.session import get_db
from app.schemas.ml_analytics_schema import (
    ChurnRiskResponse,
    DemandForecastItem,
    MarketBasketRule,
    MLRecommendation,
    PriceSensitivityItem,
    PromotionTrapItem,
    RatingAnomalyItem,
    SlowMovingDish,
    WastageRiskItem,
    WhatIfRequest,
    WhatIfResponse,
)
from app.services import ml_analytics_service

router = APIRouter(
    prefix="/api/v1/ml-analytics",
    tags=["ML Analytics"],
    responses={401: {"description": "Missing, invalid or expired token"}},
)


@router.get(
    "/market-basket",
    response_model=list[MarketBasketRule],
    dependencies=[Depends(require_roles(BRANCH_MANAGERS))],
    summary="Market-basket association rules (Support / Confidence / Lift) from the analytics pipeline",
)
async def market_basket():
    try:
        return ml_analytics_service.get_market_basket_rules()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get(
    "/price-sensitivity",
    response_model=list[PriceSensitivityItem],
    dependencies=[Depends(require_roles(BRANCH_MANAGERS))],
    summary="Per-item price elasticity classification from the analytics pipeline",
)
async def price_sensitivity():
    try:
        return ml_analytics_service.get_price_sensitivity()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get(
    "/promotion-traps",
    response_model=list[PromotionTrapItem],
    dependencies=[Depends(require_roles(BRANCH_MANAGERS))],
    summary="Promotions that grew volume while destroying margin",
)
async def promotion_traps():
    try:
        return ml_analytics_service.get_promotion_traps()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get(
    "/recommendations",
    response_model=list[MLRecommendation],
    dependencies=[Depends(require_roles(BRANCH_MANAGERS))],
    summary="Evidence-backed recommendations combining menu, wastage, basket and pricing analysis",
)
async def ml_recommendations():
    try:
        return ml_analytics_service.get_ml_recommendations()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get(
    "/dual-pipeline-comparison",
    dependencies=[Depends(require_roles(BRANCH_MANAGERS))],
    summary="Spark MLlib vs Python/XGBoost: model-selection metrics for each pipeline and their agreement on unseen records",
)
async def dual_pipeline_comparison():
    try:
        return ml_analytics_service.get_dual_pipeline_comparison()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get(
    "/churn-risk",
    response_model=ChurnRiskResponse,
    dependencies=[Depends(require_roles(BRANCH_MANAGERS))],
    summary="Customers scored by the trained XGBoost churn-risk classifier, from live order data",
)
async def churn_risk(limit: int = Query(50, ge=1, le=1000), db: AsyncSession = Depends(get_db)):
    try:
        return await ml_analytics_service.get_churn_risk(db, limit)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post(
    "/what-if",
    response_model=WhatIfResponse,
    dependencies=[Depends(require_roles(BRANCH_MANAGERS))],
    summary="Project revenue/profit/volume impact of a price change and/or discount on a menu item",
)
async def what_if(payload: WhatIfRequest, db: AsyncSession = Depends(get_db)):
    try:
        return await ml_analytics_service.simulate_what_if(
            db,
            payload.menu_item_id,
            price_change_percent=payload.price_change_percent,
            discount_percent=payload.discount_percent,
            remove_item=payload.remove_item,
            prep_quantity_change_percent=payload.prep_quantity_change_percent,
            wastage_assumption_change_percent=payload.wastage_assumption_change_percent,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

@router.get(
    "/rating-anomalies",
    response_model=list[RatingAnomalyItem],
    dependencies=[Depends(require_roles(BRANCH_MANAGERS))],
    summary="Unusual rating patterns: sudden spikes/drops, volume spikes, identical-score clusters",
)
async def rating_anomalies(db: AsyncSession = Depends(get_db)):
    return await ml_analytics_service.get_rating_anomalies(db)


@router.get(
    "/slow-moving-dishes",
    response_model=list[SlowMovingDish],
    dependencies=[Depends(require_roles(BRANCH_MANAGERS))],
    summary="Dishes flagged by a combination of low volume, low frequency, recency gap, weak margin and declining trend",
)
async def slow_moving_dishes(db: AsyncSession = Depends(get_db)):
    return await ml_analytics_service.get_slow_moving_dishes(db)


@router.get(
    "/wastage-risk",
    response_model=list[WastageRiskItem],
    dependencies=[Depends(require_roles(BRANCH_MANAGERS))],
    summary="Menu items scored by the trained wastage-risk regressor, from live sales/rating data",
)
async def wastage_risk(limit: int = Query(50, ge=1, le=500), db: AsyncSession = Depends(get_db)):
    try:
        return await ml_analytics_service.get_wastage_risk(db, limit)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get(
    "/demand-forecast",
    response_model=list[DemandForecastItem],
    dependencies=[Depends(require_roles(BRANCH_MANAGERS))],
    summary="Next-month quantity-sold projection per menu item from the trained demand regressor",
)
async def demand_forecast(limit: int = Query(50, ge=1, le=500), db: AsyncSession = Depends(get_db)):
    try:
        return await ml_analytics_service.get_demand_forecast_ml(db, limit)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

