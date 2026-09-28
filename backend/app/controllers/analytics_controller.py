from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_roles
from app.core.roles import ADMIN_ONLY
from app.db.session import get_db
from app.schemas.analytics_schema import (
    OverviewResponse,
    HourlyHeatmapResponse,
    PeakHoursResponse,
    RFMMatrixResponse,
    RFMSegmentationResponse,
    TopItemsResponse,
)
from app.services import analytics_service

router = APIRouter(
    prefix="/api/v1/analytics",
    tags=["Sales Analytics"],
    dependencies=[Depends(require_roles(ADMIN_ONLY))],
    responses={401: {"description": "Missing, invalid or expired token"}, 403: {"description": "Your role can't use this endpoint"}},
)

class DateFilter:

    def __init__(
        self,
        start_date: Optional[date] = Query(None, description="From this local date (inclusive), e.g. 2026-09-01"),
        end_date: Optional[date] = Query(None, description="Up to this local date (inclusive), e.g. 2026-09-30"),
    ):
        if start_date and end_date and start_date > end_date:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="start_date must be on or before end_date")
        self.start = start_date
        self.end = end_date

@router.get(
    "/overview",
    response_model=OverviewResponse,
    summary="Key performance indicators",
    description="Revenue, profit, order count, AOV and ASPG over completed orders.",
)
async def get_overview(dates: DateFilter = Depends(), db: AsyncSession = Depends(get_db)):
    return await analytics_service.get_overview(db, dates.start, dates.end)

@router.get(
    "/peak-hours",
    response_model=PeakHoursResponse,
    summary="Orders by hour of day",
    description="24 hourly buckets in local time, with the busiest lunch and dinner hours.",
)
async def get_peak_hours(dates: DateFilter = Depends(), db: AsyncSession = Depends(get_db)):
    return await analytics_service.get_peak_hours(db, dates.start, dates.end)

@router.get(
    "/top-performing-items",
    response_model=TopItemsResponse,
    summary="Best-selling dishes",
    description="Top dishes by quantity sold and by revenue, over completed orders.",
)
async def get_top_items(
    dates: DateFilter = Depends(),
    limit: int = Query(10, ge=1, le=50, description="How many dishes per list"),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_top_items(db, dates.start, dates.end, limit)

@router.get(
    "/rfm-segmentation",
    response_model=RFMSegmentationResponse,
    summary="Customer segments (RFM)",
    description=(
        "Scores every customer with a completed order on Recency, Frequency and Monetary value (1-5, "
        "relative to each other) and groups them into segments. Also reports repeat vs one-time "
        "customers and walk-in (unregistered) orders."
    ),
)
async def get_rfm_segmentation(
    as_of: Optional[datetime] = Query(None, description="Measure recency from this UTC time (default: now)"),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_rfm_segmentation(db, as_of)

@router.get(
    "/hourly-heatmap",
    response_model=HourlyHeatmapResponse,
    summary="Demand heatmap: day of week x hour",
    description="Completed orders per local weekday and hour (168 cells), for the dashboard heatmap.",
)
async def get_hourly_heatmap(dates: DateFilter = Depends(), db: AsyncSession = Depends(get_db)):
    return await analytics_service.get_hourly_heatmap(db, dates.start, dates.end)

@router.get(
    "/rfm-matrix",
    response_model=RFMMatrixResponse,
    summary="Customer RFM matrix",
    description="Customer counts per Recency score x Frequency score and Recency score x Monetary score (1-5 each).",
)
async def get_rfm_matrix(
    as_of: Optional[datetime] = Query(None, description="Measure recency from this UTC time (default: now)"),
    db: AsyncSession = Depends(get_db),
):
    return await analytics_service.get_rfm_matrix(db, as_of)
