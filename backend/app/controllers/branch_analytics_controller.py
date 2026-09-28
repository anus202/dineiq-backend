from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import branch_scope, require_roles
from app.core.roles import ADMIN_ONLY, BRANCH_MANAGERS, STOCK_MANAGERS
from app.db.session import get_db
from app.schemas.branch_analytics_schema import (
    AnomalyReportResponse,
    BranchComparisonResponse,
    BranchSnapshotResponse,
    BusinessRecommendation,
    ChannelMixResponse,
    DemandForecastResponse,
    MenuQuadrantResponse,
    WastageSummaryResponse,
)
from app.services import analytics_service, branch_analytics_service

router = APIRouter(prefix="/api/v1/dashboard", tags=["Branch Analytics"], responses={401: {"description": "Missing, invalid or expired token"}})

@router.get(
    "/restaurant-manager/overview",
    dependencies=[Depends(require_roles(BRANCH_MANAGERS, extra_permission="CanAccessBranchAnalytics"))],
    summary="Sales & profitability overview for a branch (Restaurant Manager)",
)
async def restaurant_manager_overview(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    branch_id: Optional[int] = Depends(branch_scope()),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_overview(db, start_date, end_date, branch_id)

@router.get(
    "/restaurant-manager/channel-mix",
    response_model=ChannelMixResponse,
    dependencies=[Depends(require_roles(BRANCH_MANAGERS, extra_permission="CanAccessBranchAnalytics"))],
    summary="Order channel mix (Dine-in / Takeaway / Delivery) for a branch",
)
async def restaurant_manager_channel_mix(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    branch_id: Optional[int] = Depends(branch_scope()),
    db: AsyncSession = Depends(get_db),
):
    return await branch_analytics_service.get_channel_mix(db, start_date, end_date, branch_id)

@router.get(
    "/restaurant-manager/menu-quadrants",
    response_model=MenuQuadrantResponse,
    dependencies=[Depends(require_roles(BRANCH_MANAGERS, extra_permission="CanAccessBranchAnalytics"))],
    summary="Menu performance quadrants: Profit Driver / Volume Driver / Hidden Opportunity / Low Performer",
)
async def restaurant_manager_menu_quadrants(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    refresh: bool = Query(False, description='Bypass the cache and recompute now'),
    branch_id: Optional[int] = Depends(branch_scope()),
    db: AsyncSession = Depends(get_db),
):
    return await branch_analytics_service.get_menu_quadrants(db, start_date, end_date, branch_id, refresh)

@router.get(
    "/restaurant-manager/recommendations",
    response_model=list[BusinessRecommendation],
    dependencies=[Depends(require_roles(BRANCH_MANAGERS, extra_permission="CanAccessBranchAnalytics"))],
    summary="Evidence-backed recommendations for a branch",
)
async def restaurant_manager_recommendations(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    branch_id: Optional[int] = Depends(branch_scope()),
    db: AsyncSession = Depends(get_db),
):
    return await branch_analytics_service.get_recommendations(db, start_date, end_date, branch_id)

@router.get(
    "/restaurant-manager/branch-snapshot",
    response_model=BranchSnapshotResponse,
    dependencies=[Depends(require_roles(BRANCH_MANAGERS, extra_permission="CanAccessBranchAnalytics"))],
    summary="Live snapshot for a branch: today's sales, recent orders, tables and stock alerts",
)
async def restaurant_manager_branch_snapshot(
    branch_id: Optional[int] = Depends(branch_scope()),
    db: AsyncSession = Depends(get_db),
):
    return await branch_analytics_service.get_branch_snapshot(db, branch_id)

@router.get(
    "/restaurant-manager/customer-rfm",
    dependencies=[Depends(require_roles(BRANCH_MANAGERS, extra_permission="CanAccessBranchAnalytics"))],
    summary="Branch customer recency/frequency/monetary segmentation",
)
async def restaurant_manager_customer_rfm(
    branch_id: Optional[int] = Depends(branch_scope()),
    db: AsyncSession = Depends(get_db),
):

    return await analytics_service.get_rfm_segmentation(db, None)

@router.get(
    "/inventory-manager/wastage",
    response_model=WastageSummaryResponse,
    dependencies=[Depends(require_roles(STOCK_MANAGERS, extra_permission="CanAccessInventory"))],
    summary="Wastage analytics by ingredient and reason for a branch",
)
async def inventory_manager_wastage(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    refresh: bool = Query(False, description='Bypass the cache and recompute now'),
    branch_id: Optional[int] = Depends(branch_scope()),
    db: AsyncSession = Depends(get_db),
):
    return await branch_analytics_service.get_wastage_summary(db, start_date, end_date, branch_id, refresh)

@router.get(
    "/inventory-manager/demand-forecast",
    response_model=DemandForecastResponse,
    dependencies=[Depends(require_roles(STOCK_MANAGERS, extra_permission="CanAccessInventory"))],
    summary="Simple hourly demand pattern and stocking recommendations for a branch",
)
async def inventory_manager_demand_forecast(
    days: int = Query(30, ge=7, le=180),
    branch_id: Optional[int] = Depends(branch_scope()),
    db: AsyncSession = Depends(get_db),
):
    return await branch_analytics_service.get_demand_forecast(db, branch_id, days)

@router.get(
    "/admin/branch-comparison",
    response_model=BranchComparisonResponse,
    dependencies=[Depends(require_roles(ADMIN_ONLY))],
    summary="Cross-branch performance matrix (revenue, profit, wastage, rating, customers)",
)
async def admin_branch_comparison(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    return await branch_analytics_service.get_branch_comparison(db, start_date, end_date)

@router.get(
    "/admin/anomalies",
    response_model=AnomalyReportResponse,
    dependencies=[Depends(require_roles(ADMIN_ONLY))],
    summary="Sales anomalies: branch-days deviating sharply from their own trailing average",
)
async def admin_anomalies(
    lookback_days: int = Query(30, ge=7, le=180),
    db: AsyncSession = Depends(get_db),
):
    return await branch_analytics_service.detect_sales_anomalies(db, lookback_days)
