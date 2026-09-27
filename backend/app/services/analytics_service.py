"""Sales analytics. Every figure is aggregated inside SQL Server; Python only formats results.

Only Completed orders count as sales. Order dates are stored in UTC and grouped in the
business time zone (BUSINESS_UTC_OFFSET_MINUTES). The analytics index on
tbl_Orders (Status, OrderDate) INCLUDE (...) covers the order-level queries.
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import Integer, Numeric, case, cast, desc, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import TTLCache
from app.core.config import BUSINESS_UTC_OFFSET_MINUTES
from app.models import Category, Customer, MenuItem, Order, OrderDetail
from app.models.base import utc_now
from app.schemas.analytics_schema import (
    CustomerRFMResponse,
    DateRange,
    HeatmapCell,
    HourlyBucket,
    HourlyHeatmapResponse,
    OverviewResponse,
    PeakHoursResponse,
    RFMMatrixCell,
    RFMMatrixResponse,
    RFMSegmentationResponse,
    SegmentSummary,
    TopItem,
    TopItemsResponse,
)
from app.schemas.common import TWO_PLACES
from app.schemas.order_schema import OrderStatusEnum

ZERO = Decimal("0")
COMPLETED = OrderStatusEnum.COMPLETED.value
LUNCH_HOURS = range(11, 16)
DINNER_HOURS = range(18, 24)

# Evaluated top to bottom; the first match wins. Scores: 5 = best (most recent / most
# frequent / highest spend), relative to all customers with a completed order.
SEGMENT_RULES = {
    "VIP High Spenders": "M = 5 and R >= 3: top 20% by spend and still active",
    "Loyal Regulars": "F >= 4 and R >= 3: repeat customers who are still active",
    "At Risk": "R <= 2 and (F >= 4 or M >= 4): valuable customers who haven't returned",
    "New Customers": "R >= 4 and F <= 3: recent first-time buyers",
    "Hibernating": "R <= 2: low value and not seen for a long time",
    "Needs Attention": "everyone else: average recency, frequency and spend",
}


# TTL caches for the heaviest dashboard aggregations. Keyed on the actual filter
# values (never the db session -- see app/core/cache.py). 5 minutes balances
# freshness against the cost of re-scanning 1M+ order-line rows on every request.
_OVERVIEW_TTL_SECONDS = 300
_RFM_TTL_SECONDS = 600  # RFM segments/matrix change slowly; cache a bit longer.
_overview_cache = TTLCache()
_rfm_segmentation_cache = TTLCache()
_rfm_matrix_cache = TTLCache()


def _money(value) -> Decimal:
    return Decimal(value or 0).quantize(TWO_PLACES)


def _pct(part, whole) -> Decimal:
    return (Decimal(part) * 100 / Decimal(whole)).quantize(TWO_PLACES) if whole else ZERO.quantize(TWO_PLACES)


def _period(start: Optional[date], end: Optional[date]) -> DateRange:
    return DateRange(StartDate=start, EndDate=end, TimeZoneOffsetMinutes=BUSINESS_UTC_OFFSET_MINUTES)


def _order_filters(
    start: Optional[date], end: Optional[date], status: Optional[str] = COMPLETED, branch_id: Optional[int] = None
) -> list:
    """Order filters for a local-date range (inclusive), converted to UTC bounds."""
    offset = timedelta(minutes=BUSINESS_UTC_OFFSET_MINUTES)
    filters = [Order.IsDeleted == False]  # noqa: E712
    if status is not None:
        filters.append(Order.Status == status)
    if start is not None:
        filters.append(Order.OrderDate >= datetime.combine(start, time.min) - offset)
    if end is not None:
        filters.append(Order.OrderDate < datetime.combine(end + timedelta(days=1), time.min) - offset)
    if branch_id is not None:
        filters.append(Order.BranchId == branch_id)
    return filters


# --- Overview --------------------------------------------------------------------------


async def _get_overview_uncached(
    db: AsyncSession, start: Optional[date], end: Optional[date], branch_id: Optional[int] = None
) -> OverviewResponse:
    totals = (
        await db.execute(
            select(
                func.count(),
                func.sum(Order.TotalAmount),
                func.sum(Order.Discount),
                func.sum(Order.NetAmount),
                func.sum(Order.GuestCount),
            ).where(*_order_filters(start, end, branch_id=branch_id))
        )
    ).one()
    orders, gross, discount, revenue, guests = totals[0], _money(totals[1]), _money(totals[2]), _money(totals[3]), totals[4] or 0

    by_status = dict(
        (
            await db.execute(
                select(Order.Status, func.count())
                .where(*_order_filters(start, end, status=None, branch_id=branch_id))
                .group_by(Order.Status)
            )
        ).all()
    )

    unit_cost = func.coalesce(OrderDetail.UnitCost, MenuItem.Cost)
    cogs = _money(
        await db.scalar(
            select(func.sum(OrderDetail.Quantity * unit_cost))
            .select_from(OrderDetail)
            .join(Order, Order.Id == OrderDetail.OrderId)
            .join(MenuItem, MenuItem.Id == OrderDetail.MenuItemId)
            .where(*_order_filters(start, end, branch_id=branch_id), OrderDetail.IsDeleted == False)  # noqa: E712
        )
    )
    profit = revenue - cogs

    return OverviewResponse(
        Period=_period(start, end),
        TotalOrders=orders,
        CancelledOrders=by_status.get(OrderStatusEnum.CANCELLED.value, 0),
        PendingOrders=by_status.get(OrderStatusEnum.PENDING.value, 0),
        GrossSales=gross,
        TotalDiscount=discount,
        TotalRevenue=revenue,
        CostOfGoodsSold=cogs,
        NetProfit=profit,
        ProfitMarginPercentage=_pct(profit, revenue),
        AverageOrderValue=_money(revenue / orders) if orders else _money(0),
        TotalGuests=guests,
        AverageSpendPerGuest=_money(gross / guests) if guests else _money(0),
    )


async def get_overview(
    db: AsyncSession, start: Optional[date], end: Optional[date], branch_id: Optional[int] = None
) -> OverviewResponse:
    return await _overview_cache.get_or_set(
        (start, end, branch_id), _OVERVIEW_TTL_SECONDS, lambda: _get_overview_uncached(db, start, end, branch_id)
    )


# --- Peak hours ------------------------------------------------------------------------


def _bucket(hour: int, orders: int, revenue: Decimal, guests: int, total_orders: int) -> HourlyBucket:
    return HourlyBucket(
        Hour=hour,
        Label=f"{hour:02d}:00",
        OrderCount=orders,
        Revenue=_money(revenue),
        Guests=guests,
        AverageOrderValue=_money(revenue / orders) if orders else _money(0),
        ShareOfOrdersPercentage=_pct(orders, total_orders),
    )


async def get_peak_hours(db: AsyncSession, start: Optional[date], end: Optional[date]) -> PeakHoursResponse:
    # The offset is a trusted int from config, inlined so SELECT and GROUP BY render the
    # identical expression (SQL Server rejects GROUP BY on two separate parameters).
    local_time = func.dateadd(
        literal_column("minute"), literal_column(str(int(BUSINESS_UTC_OFFSET_MINUTES))), Order.OrderDate
    )
    hour = func.datepart(literal_column("hour"), local_time)
    rows = (
        await db.execute(
            select(hour.label("Hour"), func.count(), func.sum(Order.NetAmount), func.sum(Order.GuestCount))
            .where(*_order_filters(start, end))
            .group_by(hour)
        )
    ).all()
    by_hour = {r[0]: (r[1], _money(r[2]), r[3] or 0) for r in rows}
    total_orders = sum(v[0] for v in by_hour.values())
    hours = [_bucket(h, *by_hour.get(h, (0, ZERO, 0)), total_orders) for h in range(24)]

    def busiest(window) -> Optional[HourlyBucket]:
        candidates = [b for b in hours if b.Hour in window and b.OrderCount > 0]
        return max(candidates, key=lambda b: (b.OrderCount, b.Revenue), default=None)

    return PeakHoursResponse(
        Period=_period(start, end),
        Hours=hours,
        BusiestHour=busiest(range(24)),
        LunchPeak=busiest(LUNCH_HOURS),
        DinnerPeak=busiest(DINNER_HOURS),
    )


# --- Top items -------------------------------------------------------------------------


async def get_top_items(
    db: AsyncSession, start: Optional[date], end: Optional[date], limit: int, branch_id: Optional[int] = None
) -> TopItemsResponse:
    quantity = func.sum(OrderDetail.Quantity).label("QuantitySold")
    revenue = func.sum(OrderDetail.TotalPrice).label("Revenue")
    # Each order has at most one line per dish (create_order merges repeats), so counting lines
    # counts orders. COUNT(DISTINCT) gave the same number but needed an extra sort-memory
    # grant, which on a memory-constrained SQL Server queued for tens of seconds.
    orders = func.count().label("OrdersContaining")
    completed_lines = [*_order_filters(start, end, branch_id=branch_id), OrderDetail.IsDeleted == False]  # noqa: E712

    base = (
        select(OrderDetail.MenuItemId, MenuItem.Name, Category.Name, quantity, revenue, orders)
        .select_from(OrderDetail)
        .join(Order, Order.Id == OrderDetail.OrderId)
        .join(MenuItem, MenuItem.Id == OrderDetail.MenuItemId)
        .join(Category, Category.Id == MenuItem.CategoryId)
        .where(*completed_lines)
        .group_by(OrderDetail.MenuItemId, MenuItem.Name, Category.Name)
    )
    total_revenue = _money(
        await db.scalar(
            select(func.sum(OrderDetail.TotalPrice))
            .select_from(OrderDetail)
            .join(Order, Order.Id == OrderDetail.OrderId)
            .where(*completed_lines)
        )
    )

    async def ranked(*order_by) -> list[TopItem]:
        rows = (await db.execute(base.order_by(*order_by, OrderDetail.MenuItemId).limit(limit))).all()
        return [
            TopItem(
                Rank=rank,
                MenuItemId=r[0],
                MenuItemName=r[1],
                CategoryName=r[2],
                QuantitySold=r[3],
                Revenue=_money(r[4]),
                OrdersContaining=r[5],
                RevenueSharePercentage=_pct(r[4], total_revenue),
            )
            for rank, r in enumerate(rows, start=1)
        ]

    return TopItemsResponse(
        Period=_period(start, end),
        TopByQuantity=await ranked(desc(quantity), desc(revenue)),
        TopByRevenue=await ranked(desc(revenue), desc(quantity)),
    )


# --- RFM -------------------------------------------------------------------------------


def _score(column, descending: bool = False):
    """1-5 score from PERCENT_RANK: ties share a score, and the lowest group always gets 1."""
    order = column.desc() if descending else column.asc()
    rank = func.percent_rank().over(order_by=order)
    return cast(func.least(5, 1 + func.floor(rank * 5)), Integer)


def _scored_customers(as_of: datetime):
    """Subquery: one row per customer with completed orders, with R/F/M values, scores and segment."""
    per_customer = (
        select(
            Order.CustomerId.label("CustomerId"),
            func.max(Order.OrderDate).label("LastOrderDate"),
            func.count().label("Frequency"),
            func.sum(Order.NetAmount).label("Monetary"),
        )
        .where(*_order_filters(None, None), Order.CustomerId.is_not(None))
        .group_by(Order.CustomerId)
        .subquery("per_customer")
    )
    days = func.datediff(literal_column("day"), per_customer.c.LastOrderDate, as_of)
    recency = case((days < 0, 0), else_=days)  # imported future-dated orders count as today
    scores = select(
        per_customer.c.CustomerId,
        per_customer.c.LastOrderDate,
        recency.label("RecencyDays"),
        per_customer.c.Frequency,
        per_customer.c.Monetary,
        _score(recency, descending=True).label("R"),  # oldest first, so most recent scores 5
        _score(per_customer.c.Frequency).label("F"),
        _score(per_customer.c.Monetary).label("M"),
    ).subquery("scores")
    r, f, m = scores.c.R, scores.c.F, scores.c.M
    segment = case(
        ((m == 5) & (r >= 3), "VIP High Spenders"),
        ((f >= 4) & (r >= 3), "Loyal Regulars"),
        ((r <= 2) & ((f >= 4) | (m >= 4)), "At Risk"),
        ((r >= 4) & (f <= 3), "New Customers"),
        (r <= 2, "Hibernating"),
        else_="Needs Attention",
    )
    return select(scores, segment.label("Segment")).subquery("scored")


async def _get_rfm_segmentation_uncached(db: AsyncSession, as_of: Optional[datetime]) -> RFMSegmentationResponse:
    as_of = as_of or utc_now()
    scored = _scored_customers(as_of)

    segment_rows = (
        await db.execute(
            select(
                scored.c.Segment,
                func.count(),
                func.sum(scored.c.Monetary),
                func.avg(cast(scored.c.RecencyDays, Numeric(12, 2))),
                func.avg(cast(scored.c.Frequency, Numeric(12, 2))),
                func.avg(scored.c.Monetary),
                func.sum(case((scored.c.Frequency > 1, 1), else_=0)),
            ).group_by(scored.c.Segment)
        )
    ).all()
    purchasing = sum(row[1] for row in segment_rows)
    repeat = sum(row[6] or 0 for row in segment_rows)
    by_name = {row[0]: row for row in segment_rows}
    segments = [
        SegmentSummary(
            Segment=name,
            Customers=row[1],
            Revenue=_money(row[2]),
            AverageRecencyDays=_money(row[3]),
            AverageFrequency=_money(row[4]),
            AverageMonetary=_money(row[5]),
            ShareOfCustomersPercentage=_pct(row[1], purchasing),
        )
        for name in SEGMENT_RULES
        if (row := by_name.get(name)) is not None
    ]

    split = (
        await db.execute(
            select(
                func.sum(case((Order.CustomerId.is_not(None), 1), else_=0)),
                func.sum(case((Order.CustomerId.is_not(None), Order.NetAmount), else_=0)),
                func.sum(case((Order.CustomerId.is_(None), 1), else_=0)),
                func.sum(case((Order.CustomerId.is_(None), Order.NetAmount), else_=0)),
            ).where(*_order_filters(None, None))
        )
    ).one()
    registered_orders, walk_in_orders = split[0] or 0, split[2] or 0
    registered_customers = await db.scalar(
        select(func.count()).select_from(Customer).where(Customer.IsDeleted == False)  # noqa: E712
    )

    return RFMSegmentationResponse(
        AsOf=as_of,
        SegmentRules=SEGMENT_RULES,
        Segments=segments,
        RegisteredCustomers=registered_customers or 0,
        PurchasingCustomers=purchasing,
        RepeatCustomers=repeat,
        OneTimeCustomers=purchasing - repeat,
        RepeatPurchaseRatePercentage=_pct(repeat, purchasing),
        RegisteredOrders=registered_orders,
        RegisteredRevenue=_money(split[1]),
        WalkInOrders=walk_in_orders,
        WalkInRevenue=_money(split[3]),
        WalkInShareOfOrdersPercentage=_pct(walk_in_orders, registered_orders + walk_in_orders),
    )


async def get_rfm_segmentation(db: AsyncSession, as_of: Optional[datetime]) -> RFMSegmentationResponse:
    return await _rfm_segmentation_cache.get_or_set(
        as_of or "latest", _RFM_TTL_SECONDS, lambda: _get_rfm_segmentation_uncached(db, as_of)
    )


async def get_customer_rfm(
    db: AsyncSession, customer: Customer, as_of: Optional[datetime]
) -> CustomerRFMResponse:
    as_of = as_of or utc_now()
    scored = _scored_customers(as_of)
    row = (await db.execute(select(scored).where(scored.c.CustomerId == customer.Id))).mappings().first()

    common = dict(CustomerId=customer.Id, CustomerName=customer.Name, AsOf=as_of, LoyaltyPoints=customer.LoyaltyPoints)
    if row is None:
        return CustomerRFMResponse(**common, Frequency=0, MonetaryValue=_money(0), Segment="No Purchases")
    return CustomerRFMResponse(
        **common,
        LastOrderDate=row["LastOrderDate"],
        RecencyDays=row["RecencyDays"],
        Frequency=row["Frequency"],
        MonetaryValue=_money(row["Monetary"]),
        RScore=row["R"],
        FScore=row["F"],
        MScore=row["M"],
        RFMScore=f"{row['R']}{row['F']}{row['M']}",
        Segment=row["Segment"],
    )


# --- Heatmap and RFM matrix (admin dashboard) ------------------------------------------

DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


async def get_hourly_heatmap(db: AsyncSession, start: Optional[date], end: Optional[date]) -> HourlyHeatmapResponse:
    local_time = func.dateadd(
        literal_column("minute"), literal_column(str(int(BUSINESS_UTC_OFFSET_MINUTES))), Order.OrderDate
    )
    # Days since Monday 1900-01-01, mod 7: independent of the server's DATEFIRST setting.
    # literal_column("7"), not a bound param: SQL Server validates GROUP BY by matching
    # expression text before parameters are bound, so "% 7" and "% :param" wouldn't be
    # recognized as the same expression between the SELECT list and the GROUP BY clause.
    weekday = func.datediff(literal_column("day"), literal_column("'19000101'"), local_time) % literal_column("7")
    hour = func.datepart(literal_column("hour"), local_time)
    rows = (
        await db.execute(
            select(weekday, hour, func.count(), func.sum(Order.NetAmount))
            .where(*_order_filters(start, end))
            .group_by(weekday, hour)
        )
    ).all()
    found = {(r[0], r[1]): (r[2], _money(r[3])) for r in rows}
    cells = [
        HeatmapCell(DayOfWeek=d, DayName=DAY_NAMES[d], Hour=h, Orders=found.get((d, h), (0, ZERO))[0], Revenue=found.get((d, h), (0, ZERO))[1])
        for d in range(7)
        for h in range(24)
    ]
    busiest = max(cells, key=lambda c: (c.Orders, c.Revenue)) if any(c.Orders for c in cells) else None
    return HourlyHeatmapResponse(Period=_period(start, end), Cells=cells, MaxOrders=busiest.Orders if busiest else 0, BusiestSlot=busiest)


async def _get_rfm_matrix_uncached(db: AsyncSession, as_of: Optional[datetime]) -> RFMMatrixResponse:
    """Single pass over the scored-customers subquery (grouped by R, F, and M together),
    not two separate passes. The old version re-ran the whole triple-PERCENT_RANK window
    computation over every customer a second time just to get the monetary matrix instead
    of the frequency matrix -- doubling the cost of the single most expensive query in the
    app for no reason, since both matrices can be built from one (R, F, M) grouping.
    """
    as_of = as_of or utc_now()
    scored = _scored_customers(as_of)

    rows = (
        await db.execute(
            select(scored.c.R, scored.c.F, scored.c.M, func.count(), func.sum(scored.c.Monetary)).group_by(
                scored.c.R, scored.c.F, scored.c.M
            )
        )
    ).all()

    def build(score_index: int) -> list[RFMMatrixCell]:
        agg: dict[tuple[int, int], list] = {}
        for r, f, m, cnt, total_monetary in rows:
            key = (r, f if score_index == 1 else m)
            entry = agg.setdefault(key, [0, ZERO])
            entry[0] += cnt
            entry[1] += Decimal(total_monetary or 0)
        return [
            RFMMatrixCell(
                RScore=r,
                Score=s,
                Customers=agg.get((r, s), [0, ZERO])[0],
                AverageMonetary=_money(agg[(r, s)][1] / agg[(r, s)][0]) if agg.get((r, s)) and agg[(r, s)][0] else ZERO,
            )
            for r in range(1, 6)
            for s in range(1, 6)
        ]

    frequency = build(1)
    monetary = build(2)
    return RFMMatrixResponse(
        AsOf=as_of,
        PurchasingCustomers=sum(c.Customers for c in frequency),
        FrequencyMatrix=frequency,
        MonetaryMatrix=monetary,
    )


async def get_rfm_matrix(db: AsyncSession, as_of: Optional[datetime]) -> RFMMatrixResponse:
    return await _rfm_matrix_cache.get_or_set(as_of or "latest", _RFM_TTL_SECONDS, lambda: _get_rfm_matrix_uncached(db, as_of))
