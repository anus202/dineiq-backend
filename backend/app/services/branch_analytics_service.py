"""Branch-scoped business intelligence: channel mix, menu-quadrant classification, wastage
analytics, demand forecasting, multi-branch comparison, sales-anomaly detection and
rule-based recommendations — computed with real SQL aggregations against the actual
31-branch dataset. Demand forecasting additionally calls into ml_analytics_service's
trained XGBoost regressor (see _get_demand_forecast_uncached) and translates its per-menu-
item predictions into ingredient-level stocking needs via the recipe mapping; every other
function here is deliberately plain SQL, not ML.
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from statistics import median
from typing import Optional

from sqlalchemy import Date, case, cast, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.cache import TTLCache
from app.services import ml_analytics_service
from app.core.config import BUSINESS_UTC_OFFSET_MINUTES
from app.models import DiningTable, InventoryItem, MenuItem, Order, OrderDetail, Recipe, RestaurantBranch, StockMovementLog, Wastage
from app.schemas.branch_analytics_schema import (
    AnomalyReportResponse,
    BranchComparisonResponse,
    BranchComparisonRow,
    BranchSnapshotResponse,
    BusinessRecommendation,
    ChannelMixEntry,
    ChannelMixResponse,
    DemandForecastHour,
    DemandModelAccuracy,
    DemandForecastResponse,
    MenuQuadrantItem,
    MenuQuadrantResponse,
    SalesAnomaly,
    StockingRecommendation,
    WastageByItem,
    WastageByReason,
    WastageSummaryResponse,
)
from app.schemas.order_schema import OrderResponse, OrderStatusEnum
from app.services.analytics_service import _money, _order_filters
from app.services.dashboard_service import _local_today, _utc_start_of
from app.services.rating_service import branch_average_rating

ZERO = Decimal("0")

# TTL caches for branch-scoped dashboard aggregations, each keyed on its actual
# filter values (never the db session). 5 minutes: fresh enough for a dashboard,
# far cheaper than re-scanning 1M+ order-line rows on every page view.
_DASHBOARD_TTL_SECONDS = 300
# Wastage and menu-quadrant ('good vs. bad items') analysis is materially heavier than
# the other dashboard aggregations and doesn't need to reflect every new order within
# minutes -- a longer TTL plus an explicit refresh=true bypass (see the controller) keeps
# the /inventory-manager/wastage and /restaurant-manager/menu-quadrants pages instant on
# every visit instead of re-running a heavy scan each time.
_WASTAGE_MENU_TTL_SECONDS = 1200
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


async def get_menu_quadrants(
    db: AsyncSession, start: Optional[date], end: Optional[date], branch_id: Optional[int], refresh: bool = False
) -> MenuQuadrantResponse:
    key = (start, end, branch_id)
    if refresh:
        _menu_quadrants_cache.invalidate(key)
    return await _menu_quadrants_cache.get_or_set(
        key, _WASTAGE_MENU_TTL_SECONDS, lambda: _get_menu_quadrants_uncached(db, start, end, branch_id)
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


async def get_wastage_summary(
    db: AsyncSession, start: Optional[date], end: Optional[date], branch_id: Optional[int], refresh: bool = False
) -> WastageSummaryResponse:
    key = (start, end, branch_id)
    if refresh:
        _wastage_summary_cache.invalidate(key)
    return await _wastage_summary_cache.get_or_set(
        key, _WASTAGE_MENU_TTL_SECONDS, lambda: _get_wastage_summary_uncached(db, start, end, branch_id)
    )


async def _get_wastage_summary_uncached(
    db: AsyncSession, start: Optional[date], end: Optional[date], branch_id: Optional[int]
) -> WastageSummaryResponse:
    """Reported at the ingredient level (what's actually recorded) — this schema has no
    dish-level wastage attribution, and recipes are many-to-many, so inferring "which dish
    wasted this ingredient" would be a guess dressed up as data.
    """
    offset = timedelta(minutes=BUSINESS_UTC_OFFSET_MINUTES)
    filters = [Wastage.IsDeleted == False]  # noqa: E712
    if branch_id is not None:
        filters.append(Wastage.BranchId == branch_id)
    if start is not None:
        filters.append(Wastage.CreatedAt >= datetime.combine(start, time.min) - offset)
    if end is not None:
        filters.append(Wastage.CreatedAt < datetime.combine(end + timedelta(days=1), time.min) - offset)

    wasted = Wastage.Quantity
    cost = wasted * InventoryItem.UnitCost

    by_item_rows = (
        await db.execute(
            select(InventoryItem.Id, InventoryItem.ItemName, InventoryItem.Unit, func.sum(wasted), func.sum(cost), func.count())
            .select_from(Wastage)
            .join(InventoryItem, InventoryItem.Id == Wastage.InventoryItemId)
            .where(*filters)
            .group_by(InventoryItem.Id, InventoryItem.ItemName, InventoryItem.Unit)
            .order_by(func.sum(cost).desc())
        )
    ).all()
    by_reason_rows = (
        await db.execute(
            select(Wastage.Reason, func.sum(wasted), func.sum(cost), func.count())
            .select_from(Wastage)
            .join(InventoryItem, InventoryItem.Id == Wastage.InventoryItemId)
            .where(*filters)
            .group_by(Wastage.Reason)
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


_MIN_HOURS_WITH_DATA_FOR_BRANCH_PATTERN = 5


async def _hourly_consumption_pattern(db: AsyncSession, scope_branch_id: Optional[int], since: datetime) -> dict[int, float]:
    local_time = func.dateadd(literal_column("minute"), literal_column(str(int(BUSINESS_UTC_OFFSET_MINUTES))), Order.OrderDate)
    hour = func.datepart(literal_column("hour"), local_time)
    consumed = -StockMovementLog.QuantityChange
    filters = [StockMovementLog.MovementType == "ORDER_CONSUMPTION", StockMovementLog.CreatedAt >= since]
    if scope_branch_id is not None:
        filters.append(StockMovementLog.BranchId == scope_branch_id)
    rows = (
        await db.execute(
            select(hour, func.avg(consumed)).select_from(StockMovementLog).join(Order, Order.Id == StockMovementLog.OrderId).where(*filters).group_by(hour)
        )
    ).all()
    return {int(h): float(avg) for h, avg in rows}


async def _ml_stocking_recommendations(
    db: AsyncSession, branch_id: Optional[int], peak_hour: Optional[int]
) -> tuple[list[StockingRecommendation], Optional[DemandModelAccuracy]]:
    """Translates the trained XGBoost demand model's per-menu-item next-month predictions
    into ingredient-level stocking needs via the recipe mapping (predicted menu-item qty x
    recipe QuantityRequired, summed per ingredient) -- real ML output, not a rolling average.
    Returns ([], None) if the model/predictions aren't usable, so the caller can fall back.
    """
    predictions = await ml_analytics_service.get_demand_forecast_ml(db, limit=1000, branch_id=branch_id)
    predicted_by_menu_item = {p["MenuItemId"]: p["PredictedNextMonthQuantity"] for p in predictions}
    if not predicted_by_menu_item:
        return [], None

    recipe_rows = (
        await db.execute(
            select(Recipe.MenuItemId, InventoryItem.Id, InventoryItem.ItemName, InventoryItem.Unit, Recipe.QuantityRequired)
            .join(InventoryItem, InventoryItem.Id == Recipe.InventoryItemId)
            .where(Recipe.IsDeleted == False, InventoryItem.IsDeleted == False)  # noqa: E712
        )
    ).all()

    predicted_monthly_by_item: dict[int, float] = {}
    item_meta: dict[int, tuple[str, str]] = {}
    for menu_item_id, inv_item_id, item_name, unit, qty_required in recipe_rows:
        predicted_qty = predicted_by_menu_item.get(menu_item_id)
        if predicted_qty is None:
            continue
        predicted_monthly_by_item[inv_item_id] = predicted_monthly_by_item.get(inv_item_id, 0.0) + predicted_qty * float(qty_required)
        item_meta[inv_item_id] = (item_name, unit)
    if not predicted_monthly_by_item:
        return [], None

    accuracy_raw = ml_analytics_service.get_demand_model_accuracy()
    accuracy = DemandModelAccuracy(**accuracy_raw) if accuracy_raw else None
    accuracy_note = f" The trained model's mean absolute error is {accuracy.mae:.1f} units on unseen data." if accuracy and accuracy.mae is not None else ""

    top_predicted = sorted(predicted_monthly_by_item.items(), key=lambda kv: kv[1], reverse=True)[:5]
    recommendations = [
        StockingRecommendation(
            ItemName=item_meta[inv_item_id][0],
            PeakHour=peak_hour if peak_hour is not None else 12,
            RecommendedPrepQuantity=round((monthly_qty / 30) * 1.2, 3),
            Unit=item_meta[inv_item_id][1],
            Reasoning=(
                f"Trained XGBoost demand model projects {round(monthly_qty, 1)} {item_meta[inv_item_id][1]} needed next month across "
                f"all recipes using this ingredient (~{round(monthly_qty / 30, 2)} {item_meta[inv_item_id][1]}/day); a 20% buffer "
                f"covers normal variation.{accuracy_note}"
            ),
        )
        for inv_item_id, monthly_qty in top_predicted
    ]
    return recommendations, accuracy


async def _historical_average_recommendations(
    db: AsyncSession, branch_id: Optional[int], days: int, since: datetime, peak_hour: Optional[int]
) -> list[StockingRecommendation]:
    """Fallback used only if the trained model/report is unavailable (e.g. the analytics
    pipeline hasn't been run yet) -- a plain historical average, not fabricated ML output."""
    consumed = -StockMovementLog.QuantityChange
    filters = [StockMovementLog.MovementType == "ORDER_CONSUMPTION", StockMovementLog.CreatedAt >= since]
    if branch_id is not None:
        filters.append(StockMovementLog.BranchId == branch_id)
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
    return [
        StockingRecommendation(
            ItemName=name,
            PeakHour=peak_hour if peak_hour is not None else 12,
            RecommendedPrepQuantity=round(float(avg_daily) * 1.2, 3) if avg_daily else 0,
            Unit=unit,
            Reasoning=(
                f"Averages {round(float(avg_daily), 2)} {unit}/day over the last {days} days; a 20% buffer covers normal demand "
                f"variation, concentrated around the {peak_hour:02d}:00 peak."
                if peak_hour is not None
                else f"Averages {round(float(avg_daily), 2)} {unit}/day over the last {days} days."
            ),
        )
        for name, unit, avg_daily in top_items
    ]


async def _get_demand_forecast_uncached(db: AsyncSession, branch_id: Optional[int], days: int = 30) -> DemandForecastResponse:
    since = datetime.utcnow() - timedelta(days=days)

    by_hour = await _hourly_consumption_pattern(db, branch_id, since)
    used_system_wide_fallback = False
    if branch_id is not None and len(by_hour) < _MIN_HOURS_WITH_DATA_FOR_BRANCH_PATTERN:
        by_hour = await _hourly_consumption_pattern(db, None, since)
        used_system_wide_fallback = True

    hourly_pattern = [DemandForecastHour(Hour=h, AverageQuantityConsumed=round(by_hour.get(h, 0.0), 3)) for h in range(24)]
    peak_hour = max(by_hour, key=by_hour.get) if by_hour else None

    recommendations: list[StockingRecommendation] = []
    model_accuracy: Optional[DemandModelAccuracy] = None
    try:
        recommendations, model_accuracy = await _ml_stocking_recommendations(db, branch_id, peak_hour)
    except RuntimeError:
        # Trained model/report not available (e.g. pipeline not yet run) -- degrade to the
        # historical average below instead of failing the whole dashboard.
        pass

    is_ml_powered = bool(recommendations)
    if not recommendations:
        recommendations = await _historical_average_recommendations(db, branch_id, days, since, peak_hour)

    return DemandForecastResponse(
        BranchId=branch_id,
        HourlyPattern=hourly_pattern,
        PeakHour=peak_hour,
        Recommendations=recommendations,
        IsMLPowered=is_ml_powered,
        ModelAccuracy=model_accuracy,
        UsedSystemWideFallback=used_system_wide_fallback,
    )


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
                select(Wastage.BranchId, func.sum(Wastage.Quantity * InventoryItem.UnitCost))
                .select_from(Wastage)
                .join(InventoryItem, InventoryItem.Id == Wastage.InventoryItemId)
                .where(Wastage.IsDeleted == False)  # noqa: E712
                .group_by(Wastage.BranchId)
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


# --- Branch snapshot ("everything about my branch, right now") --------------------------


async def get_branch_snapshot(db: AsyncSession, branch_id: Optional[int]) -> BranchSnapshotResponse:
    """"Right now" detail for a branch manager's own branch: today's sales/orders and the
    branch's most recent order (cashier) activity are genuinely filtered by Order.BranchId,
    and wastage cost reuses get_wastage_summary's own branch filter. Table occupancy and
    inventory stock levels stay restaurant-wide -- DiningTable has no BranchId and every
    seeded InventoryItem is BranchId=NULL (shared) in this schema, so filtering those to
    "this branch" would just produce a number that looks branch-specific without being one.
    """
    today = _local_today()
    start, end = _utc_start_of(today), _utc_start_of(today + timedelta(days=1))
    not_deleted = Order.IsDeleted == False  # noqa: E712
    branch_filter = () if branch_id is None else (Order.BranchId == branch_id,)

    today_row = (
        await db.execute(
            select(
                func.sum(case((Order.Status == OrderStatusEnum.COMPLETED.value, Order.NetAmount), else_=0)),
                func.sum(case((Order.Status == OrderStatusEnum.COMPLETED.value, 1), else_=0)),
                func.sum(case((Order.Status != OrderStatusEnum.CANCELLED.value, 1), else_=0)),
            ).where(not_deleted, Order.OrderDate >= start, Order.OrderDate < end, *branch_filter)
        )
    ).one()
    sales, completed, placed = _money(today_row[0]), today_row[1] or 0, today_row[2] or 0
    pending = await db.scalar(
        select(func.count()).select_from(Order).where(not_deleted, Order.Status == OrderStatusEnum.PENDING.value, *branch_filter)
    )

    recent = (
        await db.scalars(
            select(Order)
            .options(
                selectinload(Order.Customer),
                selectinload(Order.Table),
                selectinload(Order.Payment),
                selectinload(Order.items).selectinload(OrderDetail.MenuItem),
            )
            .where(not_deleted, *branch_filter)
            .order_by(Order.OrderDate.desc(), Order.Id.desc())
            .limit(6)
        )
    ).all()

    tables = dict(
        (
            await db.execute(
                select(DiningTable.Status, func.count()).where(DiningTable.IsDeleted == False).group_by(DiningTable.Status)  # noqa: E712
            )
        ).all()
    )
    stock = (
        await db.execute(
            select(
                func.sum(case((InventoryItem.CurrentStock <= InventoryItem.ReorderLevel, 1), else_=0)),
                func.sum(case((InventoryItem.CurrentStock <= 0, 1), else_=0)),
            ).where(InventoryItem.IsDeleted == False)  # noqa: E712
        )
    ).one()

    wastage = await get_wastage_summary(db, today - timedelta(days=29), today, branch_id)

    return BranchSnapshotResponse(
        BranchId=branch_id,
        BusinessDate=today,
        SalesToday=sales,
        OrdersToday=placed,
        CompletedOrdersToday=completed,
        PendingOrders=pending or 0,
        RecentOrders=[OrderResponse.from_model(o) for o in recent],
        ActiveTables=tables.get("OCCUPIED", 0),
        ReservedTables=tables.get("RESERVED", 0),
        TotalTables=sum(tables.values()),
        LowStockItems=stock[0] or 0,
        OutOfStockItems=stock[1] or 0,
        WastageCost30Days=wastage.TotalWastageCost,
    )
