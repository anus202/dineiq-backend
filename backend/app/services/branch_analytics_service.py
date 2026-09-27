"""Branch-scoped business intelligence: channel mix, menu-quadrant classification, wastage
analytics, simple demand forecasting, multi-branch comparison, sales-anomaly detection and
rule-based recommendations — all computed with real SQL aggregations against the actual
31-branch dataset (no Spark/XGBoost, no mock data). See AI_USAGE.md / conversation history
for why: a full ML pipeline needs a training dataset this operational app doesn't have yet.
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from statistics import median
from typing import Optional

from sqlalchemy import Date, case, cast, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import TTLCache
from app.core.config import BUSINESS_UTC_OFFSET_MINUTES
from app.models import Customer, InventoryItem, MenuItem, Order, OrderDetail, RestaurantBranch, StockMovementLog
from app.schemas.branch_analytics_schema import (
    AnomalyReportResponse,
    BranchComparisonResponse,
    BranchComparisonRow,
    BusinessRecommendation,
    ChannelMixEntry,
    ChannelMixResponse,
    DemandForecastHour,
    DemandForecastResponse,
    MenuQuadrantItem,
    MenuQuadrantResponse,
    SalesAnomaly,
    StockingRecommendation,
    WastageByItem,
    WastageByReason,
    WastageSummaryResponse,
)
from app.schemas.common import TWO_PLACES
from app.services.analytics_service import _money, _order_filters
from app.services.rating_service import branch_average_rating

ZERO = Decimal("0")

# TTL caches for branch-scoped dashboard aggregations, each keyed on its actual
# filter values (never the db session). 5 minutes: fresh enough for a dashboard,
# far cheaper than re-scanning 1M+ order-line rows on every page view.
_DASHBOARD_TTL_SECONDS = 300
_channel_mix_cache = TTLCache()
_menu_quadrants_cache = TTLCache()
_wastage_summary_cache = TTLCache()
_branch_demand_forecast_cache = TTLCache()
_branch_comparison_cache = TTLCache()
_sales_anomalies_cache = TTLCache()
WASTAGE_THRESHOLD_PERCENT = Decimal("15")


def _pct2(part, whole) -> Decimal:
    return (Decimal(part) * 100 / Decimal(whole)).quantize(Decimal("0.01")) if whole else Decimal("0.00")


# --- Channel mix -------------------------------------------------------------------------


async def get_channel_mix(db: AsyncSession, start: Optional[date], end: Optional[date], branch_id: Optional[int]) -> ChannelMixResponse:
    return await _channel_mix_cache.get_or_set(
        (start, end, branch_id), _DASHBOARD_TTL_SECONDS, lambda: _get_channel_mix_uncached(db, start, end, branch_id)
    )


async def _get_channel_mix_uncached(
    db: AsyncSession, start: Optional[date], end: Optional[date], branch_id: Optional[int]
) -> ChannelMixResponse:
    rows = (
        await db.execute(
            select(Order.OrderType, func.count(), func.sum(Order.NetAmount))
            .where(*_order_filters(start, end, branch_id=branch_id))
            .group_by(Order.OrderType)
        )
    ).all()
    total_orders = sum(r[1] for r in rows) or 0
    channels = [
        ChannelMixEntry(Channel=r[0], OrderCount=r[1], Revenue=_money(r[2]), SharePercentage=_pct2(r[1], total_orders))
        for r in rows
    ]
    return ChannelMixResponse(BranchId=branch_id, Channels=sorted(channels, key=lambda c: c.OrderCount, reverse=True))


# --- Menu performance quadrants ----------------------------------------------------------


async def get_menu_quadrants(db: AsyncSession, start: Optional[date], end: Optional[date], branch_id: Optional[int]) -> MenuQuadrantResponse:
    return await _menu_quadrants_cache.get_or_set(
        (start, end, branch_id), _DASHBOARD_TTL_SECONDS, lambda: _get_menu_quadrants_uncached(db, start, end, branch_id)
    )


async def _get_menu_quadrants_uncached(
    db: AsyncSession, start: Optional[date], end: Optional[date], branch_id: Optional[int]
) -> MenuQuadrantResponse:
    unit_cost = func.coalesce(OrderDetail.UnitCost, MenuItem.Cost)
    rows = (
        await db.execute(
            select(
                MenuItem.Id,
                MenuItem.Name,
                func.sum(OrderDetail.Quantity),
                func.sum(OrderDetail.TotalPrice),
                func.sum(OrderDetail.Quantity * unit_cost),
            )
            .select_from(OrderDetail)
            .join(Order, Order.Id == OrderDetail.OrderId)
            .join(MenuItem, MenuItem.Id == OrderDetail.MenuItemId)
            .where(*_order_filters(start, end, branch_id=branch_id), OrderDetail.IsDeleted == False)  # noqa: E712
            .group_by(MenuItem.Id, MenuItem.Name)
        )
    ).all()

    from app.models import Category  # local import: avoids a cycle at module load time

    categories: dict[int, str] = {}
    if rows:
        cat_rows = (
            await db.execute(
                select(MenuItem.Id, Category.Name)
                .join(Category, Category.Id == MenuItem.CategoryId)
                .where(MenuItem.Id.in_([r[0] for r in rows]))
            )
        ).all()
        categories = dict(cat_rows)

    computed = []
    for menu_item_id, name, qty, revenue, cost in rows:
        qty = qty or 0
        revenue = Decimal(revenue or 0)
        cost = Decimal(cost or 0)
        margin = revenue - cost
        margin_pct = (margin * 100 / revenue) if revenue else Decimal(0)
        computed.append((menu_item_id, name, qty, revenue, margin, margin_pct))

    if not computed:
        return MenuQuadrantResponse(BranchId=branch_id, MedianQuantity=Decimal(0), MedianMarginPercentage=Decimal(0), Items=[])

    median_qty = Decimal(median(c[2] for c in computed))
    median_margin_pct = Decimal(median(c[5] for c in computed)).quantize(Decimal("0.01"))

    items = []
    for menu_item_id, name, qty, revenue, margin, margin_pct in computed:
        high_qty = qty >= median_qty
        high_margin = margin_pct >= median_margin_pct
        if high_qty and high_margin:
            quadrant = "Profit Driver"
        elif high_qty and not high_margin:
            quadrant = "Volume Driver"
        elif not high_qty and high_margin:
            quadrant = "Hidden Opportunity"
        else:
            quadrant = "Low Performer"
        items.append(
            MenuQuadrantItem(
                MenuItemId=menu_item_id,
                MenuItemName=name,
                CategoryName=categories.get(menu_item_id, "Uncategorized"),
                QuantitySold=qty,
                Revenue=_money(revenue),
                Margin=_money(margin),
                MarginPercentage=margin_pct.quantize(Decimal("0.01")),
                Quadrant=quadrant,
            )
        )
    items.sort(key=lambda i: i.Revenue, reverse=True)
    return MenuQuadrantResponse(BranchId=branch_id, MedianQuantity=median_qty, MedianMarginPercentage=median_margin_pct, Items=items)


async def get_recommendations(
    db: AsyncSession, start: Optional[date], end: Optional[date], branch_id: Optional[int]
) -> list[BusinessRecommendation]:
    quadrants = await get_menu_quadrants(db, start, end, branch_id)
    recs: list[BusinessRecommendation] = []
    for item in [i for i in quadrants.Items if i.Quadrant == "Hidden Opportunity"][:5]:
        recs.append(
            BusinessRecommendation(
                Title=f"Promote {item.MenuItemName}",
                Priority="MEDIUM",
                Evidence=f"{item.MarginPercentage}% margin (above the {quadrants.MedianMarginPercentage}% median) but only {item.QuantitySold} units sold.",
                SuggestedAction="Feature it on the menu, POS upsell prompts, or a limited-time spotlight promotion.",
            )
        )
    for item in [i for i in quadrants.Items if i.Quadrant == "Low Performer"][:5]:
        recs.append(
            BusinessRecommendation(
                Title=f"Reassess {item.MenuItemName}",
                Priority="HIGH" if item.Margin < 0 else "LOW",
                Evidence=f"Low demand ({item.QuantitySold} units) and {item.MarginPercentage}% margin, both below median.",
                SuggestedAction="Re-cost the recipe, reprice, or retire it from the menu.",
            )
        )
    for item in [i for i in quadrants.Items if i.Quadrant == "Volume Driver"][:3]:
        recs.append(
            BusinessRecommendation(
                Title=f"Improve margin on {item.MenuItemName}",
                Priority="MEDIUM",
                Evidence=f"High volume ({item.QuantitySold} units) but only {item.MarginPercentage}% margin.",
                SuggestedAction="Trim portion cost or raise price slightly — demand is proven, so a small increase is low-risk.",
            )
        )
    return recs


# --- Wastage -------------------------------------------------------------------------------


async def get_wastage_summary(db: AsyncSession, start: Optional[date], end: Optional[date], branch_id: Optional[int]) -> WastageSummaryResponse:
    return await _wastage_summary_cache.get_or_set(
        (start, end, branch_id), _DASHBOARD_TTL_SECONDS, lambda: _get_wastage_summary_uncached(db, start, end, branch_id)
    )


async def _get_wastage_summary_uncached(
    db: AsyncSession, start: Optional[date], end: Optional[date], branch_id: Optional[int]
) -> WastageSummaryResponse:
    """MANUAL_DEDUCTION movements are the closest tracked concept to wastage/spoilage/
    overproduction. Reported at the ingredient level (what's actually recorded) — this
    schema has no dish-level wastage attribution, and recipes are many-to-many, so
    inferring "which dish wasted this ingredient" would be a guess dressed up as data.
    """
    offset = timedelta(minutes=BUSINESS_UTC_OFFSET_MINUTES)
    filters = [StockMovementLog.MovementType == "MANUAL_DEDUCTION", StockMovementLog.IsDeleted == False]  # noqa: E712
    if branch_id is not None:
        filters.append(StockMovementLog.BranchId == branch_id)
    if start is not None:
        filters.append(StockMovementLog.CreatedAt >= datetime.combine(start, time.min) - offset)
    if end is not None:
        filters.append(StockMovementLog.CreatedAt < datetime.combine(end + timedelta(days=1), time.min) - offset)

    wasted = (-StockMovementLog.QuantityChange)
    cost = wasted * InventoryItem.UnitCost

    by_item_rows = (
        await db.execute(
            select(InventoryItem.Id, InventoryItem.ItemName, InventoryItem.Unit, func.sum(wasted), func.sum(cost), func.count())
            .select_from(StockMovementLog)
            .join(InventoryItem, InventoryItem.Id == StockMovementLog.InventoryItemId)
            .where(*filters)
            .group_by(InventoryItem.Id, InventoryItem.ItemName, InventoryItem.Unit)
            .order_by(func.sum(cost).desc())
        )
    ).all()
    by_reason_rows = (
        await db.execute(
            select(StockMovementLog.Reason, func.sum(wasted), func.sum(cost), func.count())
            .select_from(StockMovementLog)
            .join(InventoryItem, InventoryItem.Id == StockMovementLog.InventoryItemId)
            .where(*filters)
            .group_by(StockMovementLog.Reason)
            .order_by(func.sum(cost).desc())
        )
    ).all()

    total_cost = sum((_money(r[4]) for r in by_item_rows), Decimal("0.00"))
    return WastageSummaryResponse(
        BranchId=branch_id,
        TotalWastageCost=total_cost,
        ByItem=[WastageByItem(InventoryItemId=r[0], ItemName=r[1], Unit=r[2], TotalWasted=r[3], WastageCost=_money(r[4]), IncidentCount=r[5]) for r in by_item_rows],
        ByReason=[WastageByReason(Reason=r[0] or "Unspecified", TotalWasted=r[1], WastageCost=_money(r[2]), IncidentCount=r[3]) for r in by_reason_rows],
    )


# --- Demand forecast (simple rolling pattern, no ML) ---------------------------------------


async def get_demand_forecast(db: AsyncSession, branch_id: Optional[int], days: int = 30) -> DemandForecastResponse:
    return await _branch_demand_forecast_cache.get_or_set(
        (branch_id, days), _DASHBOARD_TTL_SECONDS, lambda: _get_demand_forecast_uncached(db, branch_id, days)
    )


async def _get_demand_forecast_uncached(db: AsyncSession, branch_id: Optional[int], days: int = 30) -> DemandForecastResponse:
    since = datetime.utcnow() - timedelta(days=days)
    local_time = func.dateadd(literal_column("minute"), literal_column(str(int(BUSINESS_UTC_OFFSET_MINUTES))), Order.OrderDate)
    hour = func.datepart(literal_column("hour"), local_time)
    consumed = (-StockMovementLog.QuantityChange)

    filters = [StockMovementLog.MovementType == "ORDER_CONSUMPTION", StockMovementLog.CreatedAt >= since]
    if branch_id is not None:
        filters.append(StockMovementLog.BranchId == branch_id)

    hourly_rows = (
        await db.execute(
            select(hour, func.avg(consumed))
            .select_from(StockMovementLog)
            .join(Order, Order.Id == StockMovementLog.OrderId)
            .where(*filters)
            .group_by(hour)
        )
    ).all()
    by_hour = {int(h): float(avg) for h, avg in hourly_rows}
    hourly_pattern = [DemandForecastHour(Hour=h, AverageQuantityConsumed=round(by_hour.get(h, 0.0), 3)) for h in range(24)]
    peak_hour = max(by_hour, key=by_hour.get) if by_hour else None

    top_items = (
        await db.execute(
            select(InventoryItem.ItemName, InventoryItem.Unit, func.sum(consumed) / days)
            .select_from(StockMovementLog)
            .join(InventoryItem, InventoryItem.Id == StockMovementLog.InventoryItemId)
            .where(*filters)
            .group_by(InventoryItem.ItemName, InventoryItem.Unit)
            .order_by((func.sum(consumed) / days).desc())
            .limit(5)
        )
    ).all()
    recommendations = [
        StockingRecommendation(
            ItemName=name,
            PeakHour=peak_hour if peak_hour is not None else 12,
            RecommendedPrepQuantity=round(float(avg_daily) * Decimal("1.2"), 3) if avg_daily else 0,
            Unit=unit,
            Reasoning=f"Averages {round(float(avg_daily), 2)} {unit}/day over the last {days} days; a 20% buffer covers normal demand variation, concentrated around the {peak_hour:02d}:00 peak." if peak_hour is not None else f"Averages {round(float(avg_daily), 2)} {unit}/day over the last {days} days.",
        )
        for name, unit, avg_daily in top_items
    ]
    return DemandForecastResponse(BranchId=branch_id, HourlyPattern=hourly_pattern, PeakHour=peak_hour, Recommendations=recommendations)


# --- Multi-branch comparison (Admin) --------------------------------------------------------


async def get_branch_comparison(db: AsyncSession, start: Optional[date], end: Optional[date]) -> BranchComparisonResponse:
    return await _branch_comparison_cache.get_or_set(
        (start, end), _DASHBOARD_TTL_SECONDS, lambda: _get_branch_comparison_uncached(db, start, end)
    )


async def _get_branch_comparison_uncached(db: AsyncSession, start: Optional[date], end: Optional[date]) -> BranchComparisonResponse:
    branches = list(await db.scalars(select(RestaurantBranch).where(RestaurantBranch.IsDeleted == False)))  # noqa: E712
    unit_cost = func.coalesce(OrderDetail.UnitCost, MenuItem.Cost)

    revenue_rows = dict(
        (r[0], (r[1] or 0, _money(r[2])))
        for r in (
            await db.execute(
                select(Order.BranchId, func.count(), func.sum(Order.NetAmount)).where(*_order_filters(start, end)).group_by(Order.BranchId)
            )
        ).all()
    )
    cost_rows = dict(
        (r[0], _money(r[1]))
        for r in (
            await db.execute(
                select(Order.BranchId, func.sum(OrderDetail.Quantity * unit_cost))
                .select_from(OrderDetail)
                .join(Order, Order.Id == OrderDetail.OrderId)
                .join(MenuItem, MenuItem.Id == OrderDetail.MenuItemId)
                .where(*_order_filters(start, end), OrderDetail.IsDeleted == False)  # noqa: E712
                .group_by(Order.BranchId)
            )
        ).all()
    )
    wastage_by_branch = dict(
        (r[0], _money(r[1]))
        for r in (
            await db.execute(
                select(StockMovementLog.BranchId, func.sum((-StockMovementLog.QuantityChange) * InventoryItem.UnitCost))
                .select_from(StockMovementLog)
                .join(InventoryItem, InventoryItem.Id == StockMovementLog.InventoryItemId)
                .where(StockMovementLog.MovementType == "MANUAL_DEDUCTION", StockMovementLog.IsDeleted == False)  # noqa: E712
                .group_by(StockMovementLog.BranchId)
            )
        ).all()
    )
    customer_rows = dict(
        (r[0], r[1])
        for r in (
            await db.execute(
                select(Order.BranchId, func.count(func.distinct(Order.CustomerId)))
                .where(*_order_filters(start, end), Order.CustomerId.isnot(None))
                .group_by(Order.BranchId)
            )
        ).all()
    )
    ratings_by_branch = await branch_average_rating(db)

    rows = []
    for b in branches:
        order_count, revenue = revenue_rows.get(b.Id, (0, Decimal("0.00")))
        cost = cost_rows.get(b.Id, Decimal("0.00"))
        profit = revenue - cost
        rows.append(
            BranchComparisonRow(
                BranchId=b.Id,
                BranchName=b.BranchName,
                City=b.City,
                IsActive=b.IsActive,
                OrderCount=order_count,
                Revenue=revenue,
                Profit=profit,
                ProfitMarginPercentage=_pct2(profit, revenue),
                WastageCost=wastage_by_branch.get(b.Id, Decimal("0.00")),
                AverageRating=ratings_by_branch.get(b.Id),
                CustomerCount=customer_rows.get(b.Id, 0),
            )
        )
    rows.sort(key=lambda r: r.Revenue, reverse=True)
    return BranchComparisonResponse(Period={"StartDate": start, "EndDate": end}, Branches=rows)


# --- Sales anomaly detection (Admin) ---------------------------------------------------------


async def detect_sales_anomalies(db: AsyncSession, lookback_days: int = 30, trailing_window: int = 7) -> AnomalyReportResponse:
    return await _sales_anomalies_cache.get_or_set(
        (lookback_days, trailing_window), _DASHBOARD_TTL_SECONDS, lambda: _detect_sales_anomalies_uncached(db, lookback_days, trailing_window)
    )


async def _detect_sales_anomalies_uncached(db: AsyncSession, lookback_days: int = 30, trailing_window: int = 7) -> AnomalyReportResponse:
    """Flags a branch-day whose revenue deviates >50% from its own trailing 7-day average.
    Simple, explainable statistics — not an ML model — run against real daily branch revenue.
    """
    since = date.today() - timedelta(days=lookback_days + trailing_window)
    offset = timedelta(minutes=BUSINESS_UTC_OFFSET_MINUTES)
    local_date = cast(func.dateadd(literal_column("minute"), literal_column(str(int(BUSINESS_UTC_OFFSET_MINUTES))), Order.OrderDate), Date)

    rows = (
        await db.execute(
            select(Order.BranchId, local_date.label("d"), func.sum(Order.NetAmount))
            .where(*_order_filters(since, None), Order.BranchId.isnot(None))
            .group_by(Order.BranchId, local_date)
            .order_by(Order.BranchId, local_date)
        )
    ).all()

    by_branch: dict[int, list[tuple[date, Decimal]]] = {}
    for branch_id, d, revenue in rows:
        by_branch.setdefault(branch_id, []).append((d, Decimal(revenue or 0)))

    branch_names = dict(
        (b.Id, b.BranchName) for b in await db.scalars(select(RestaurantBranch).where(RestaurantBranch.IsDeleted == False))  # noqa: E712
    )

    anomalies: list[SalesAnomaly] = []
    for branch_id, series in by_branch.items():
        for i in range(trailing_window, len(series)):
            d, revenue = series[i]
            trailing = [series[j][1] for j in range(i - trailing_window, i)]
            avg = sum(trailing) / len(trailing) if trailing else Decimal(0)
            if avg <= 0:
                continue
            deviation = ((revenue - avg) / avg * 100).quantize(Decimal("0.01"))
            if abs(deviation) < 50:
                continue
            severity = "CRITICAL" if abs(deviation) >= 100 else "HIGH" if abs(deviation) >= 75 else "MEDIUM"
            anomalies.append(
                SalesAnomaly(
                    BranchId=branch_id,
                    BranchName=branch_names.get(branch_id, f"Branch {branch_id}"),
                    Date=d,
                    Revenue=_money(revenue),
                    TrailingAverageRevenue=_money(avg),
                    DeviationPercentage=deviation,
                    Type="SPIKE" if deviation > 0 else "DROP",
                    Severity=severity,
                )
            )
    anomalies.sort(key=lambda a: abs(a.DeviationPercentage), reverse=True)
    return AnomalyReportResponse(SalesAnomalies=anomalies[:50])
