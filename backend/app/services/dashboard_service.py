from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import Date, Integer, case, cast, desc, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.cache import TTLCache
from app.core.config import BUSINESS_UTC_OFFSET_MINUTES, LOYALTY_POINT_VALUE_PKR
from app.models import Category, Customer, DiningTable, InventoryItem, MenuItem, Order, OrderDetail
from app.models.base import utc_now
from app.schemas.dashboard_schema import (
    AdminSummaryResponse,
    AdminTopPerformingResponse,
    CustomerMeResponse,
    MyOrder,
    MyOrdersResponse,
    Recommendation,
    RecommendationsResponse,
    RevenueChartResponse,
    RevenuePoint,
    TierInfo,
    TierStatus,
)
from app.schemas.order_schema import OrderResponse, OrderStatusEnum
from app.services import analytics_service, customer_service
from app.services.loyalty_service import all_tiers, tier_for

COMPLETED = OrderStatusEnum.COMPLETED.value
PENDING = OrderStatusEnum.PENDING.value
CANCELLED = OrderStatusEnum.CANCELLED.value
OFFSET = timedelta(minutes=BUSINESS_UTC_OFFSET_MINUTES)

def _money(value) -> Decimal:
    return Decimal(value or 0).quantize(Decimal("0.01"))

def _local_today() -> date:
    return (utc_now() + OFFSET).date()

def _utc_start_of(local_day: date) -> datetime:
    return datetime.combine(local_day, time.min) - OFFSET

def _local(column):

    return func.dateadd(literal_column("minute"), literal_column(str(int(BUSINESS_UTC_OFFSET_MINUTES))), column)

_ADMIN_SUMMARY_TTL_SECONDS = 60
_DASHBOARD_TTL_SECONDS = 300
_admin_summary_cache = TTLCache()
_revenue_chart_cache = TTLCache()
_top_performing_cache = TTLCache()

async def admin_summary(db: AsyncSession) -> AdminSummaryResponse:
    return await _admin_summary_cache.get_or_set((), _ADMIN_SUMMARY_TTL_SECONDS, lambda: _admin_summary_uncached(db))

async def _admin_summary_uncached(db: AsyncSession) -> AdminSummaryResponse:
    today = _local_today()
    start, end = _utc_start_of(today), _utc_start_of(today + timedelta(days=1))
    not_deleted = Order.IsDeleted == False
    today_row = (
        await db.execute(
            select(
                func.sum(case((Order.Status == COMPLETED, Order.NetAmount), else_=0)),
                func.sum(case((Order.Status == COMPLETED, 1), else_=0)),
                func.sum(case((Order.Status != CANCELLED, 1), else_=0)),
                func.sum(case((Order.Status == COMPLETED, Order.GuestCount), else_=0)),
            ).where(not_deleted, Order.OrderDate >= start, Order.OrderDate < end)
        )
    ).one()
    sales, completed, placed, guests = _money(today_row[0]), today_row[1] or 0, today_row[2] or 0, today_row[3] or 0
    pending = await db.scalar(select(func.count()).select_from(Order).where(not_deleted, Order.Status == PENDING))
    tables = dict(
        (
            await db.execute(
                select(DiningTable.Status, func.count())
                .where(DiningTable.IsDeleted == False)
                .group_by(DiningTable.Status)
            )
        ).all()
    )
    stock = (
        await db.execute(
            select(
                func.sum(case((InventoryItem.CurrentStock <= InventoryItem.ReorderLevel, 1), else_=0)),
                func.sum(case((InventoryItem.CurrentStock <= 0, 1), else_=0)),
            ).where(InventoryItem.IsDeleted == False)
        )
    ).one()
    return AdminSummaryResponse(
        BusinessDate=today,
        SalesToday=sales,
        CompletedOrdersToday=completed,
        OrdersToday=placed,
        GuestsToday=guests,
        AverageOrderValueToday=_money(sales / completed) if completed else _money(0),
        PendingOrders=pending or 0,
        ActiveTables=tables.get("OCCUPIED", 0),
        ReservedTables=tables.get("RESERVED", 0),
        TotalTables=sum(tables.values()),
        LowStockItems=stock[0] or 0,
        OutOfStockItems=stock[1] or 0,
    )

def _month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"

def _months_back(today: date, months: int) -> list[date]:
    firsts, year, month = [], today.year, today.month
    for _ in range(months):
        firsts.append(date(year, month, 1))
        year, month = (year, month - 1) if month > 1 else (year - 1, 12)
    return list(reversed(firsts))

async def revenue_chart(db: AsyncSession, days: int, months: int) -> RevenueChartResponse:
    return await _revenue_chart_cache.get_or_set(
        (days, months), _DASHBOARD_TTL_SECONDS, lambda: _revenue_chart_uncached(db, days, months)
    )

async def _revenue_chart_uncached(db: AsyncSession, days: int, months: int) -> RevenueChartResponse:
    today = _local_today()
    completed = [Order.IsDeleted == False, Order.Status == COMPLETED]

    first_day = today - timedelta(days=days - 1)
    local_date = cast(_local(Order.OrderDate), Date)
    daily_rows = (
        await db.execute(
            select(local_date, func.sum(Order.NetAmount), func.count())
            .where(*completed, Order.OrderDate >= _utc_start_of(first_day), Order.OrderDate < _utc_start_of(today + timedelta(days=1)))
            .group_by(local_date)
        )
    ).all()
    daily = {row[0]: row for row in daily_rows}

    month_starts = _months_back(today, months)
    local_year = func.year(_local(Order.OrderDate))
    local_month = func.month(_local(Order.OrderDate))
    monthly_rows = (
        await db.execute(
            select(local_year, local_month, func.sum(Order.NetAmount), func.count())
            .where(*completed, Order.OrderDate >= _utc_start_of(month_starts[0]), Order.OrderDate < _utc_start_of(today + timedelta(days=1)))
            .group_by(local_year, local_month)
        )
    ).all()
    monthly = {f"{row[0]:04d}-{row[1]:02d}": row for row in monthly_rows}

    return RevenueChartResponse(
        TimeZoneOffsetMinutes=BUSINESS_UTC_OFFSET_MINUTES,
        Daily=[
            RevenuePoint(
                Period=d.isoformat(),
                Revenue=_money(daily[d][1]) if d in daily else _money(0),
                Orders=daily[d][2] if d in daily else 0,
            )
            for d in (first_day + timedelta(days=i) for i in range(days))
        ],
        Monthly=[
            RevenuePoint(
                Period=key,
                Revenue=_money(monthly[key][2]) if key in monthly else _money(0),
                Orders=monthly[key][3] if key in monthly else 0,
            )
            for key in map(_month_key, month_starts)
        ],
    )

async def admin_top_performing(db: AsyncSession, days: int, segments: int) -> AdminTopPerformingResponse:
    return await _top_performing_cache.get_or_set(
        (days, segments), _DASHBOARD_TTL_SECONDS, lambda: _admin_top_performing_uncached(db, days, segments)
    )

async def _admin_top_performing_uncached(db: AsyncSession, days: int, segments: int) -> AdminTopPerformingResponse:
    start = _local_today() - timedelta(days=days - 1)
    top = await analytics_service.get_top_items(db, start, None, limit=5)
    rfm = await analytics_service.get_rfm_segmentation(db, None)
    return AdminTopPerformingResponse(
        PeriodDays=days,
        TopItems=top.TopByRevenue,
        TopSpendingSegments=sorted(rfm.Segments, key=lambda s: s.Revenue, reverse=True)[:segments],
    )

async def customer_me(db: AsyncSession, customer: Customer) -> CustomerMeResponse:
    stats, _ = await customer_service.get_customer_history(db, customer.Id)
    tier = tier_for(customer.LoyaltyPoints)
    return CustomerMeResponse(
        CustomerId=customer.Id,
        Name=customer.Name,
        Phone=customer.Phone,
        Email=customer.Email,
        Address=customer.Address,
        MemberSince=customer.CreatedAt,
        LoyaltyPoints=customer.LoyaltyPoints,
        PointsValue=_money(customer.LoyaltyPoints * LOYALTY_POINT_VALUE_PKR),
        TierStatus=TierStatus(
            Tier=tier.name,
            DiscountPercentage=tier.discount_percent,
            NextTier=tier.next_tier,
            PointsToNextTier=tier.points_to_next,
        ),
        Tiers=[TierInfo(Name=n, MinPoints=m, DiscountPercentage=d) for n, m, d in all_tiers()],
        TotalOrders=stats.TotalOrders,
        TotalSpent=stats.TotalSpent,
        LastOrderDate=stats.LastOrderDate,
    )

def _tracking_status(order: Order) -> str:
    if order.Status == CANCELLED:
        return "Cancelled"
    if order.Status == COMPLETED:
        return "Completed & paid" if order.Payment is not None else "Completed"
    if order.TableId is not None and order.Table is not None:
        return f"Being served at table {order.Table.TableNumber}"
    return {"Delivery": "Preparing for delivery", "Takeaway": "Preparing for pickup"}.get(order.OrderType, "Order received")

async def my_orders(db: AsyncSession, customer_id: int, skip: int, limit: int, open_only: Optional[bool]) -> MyOrdersResponse:
    filters = [Order.CustomerId == customer_id, Order.IsDeleted == False]
    if open_only is True:
        filters.append(Order.Status == PENDING)
    elif open_only is False:
        filters.append(Order.Status != PENDING)
    total = await db.scalar(select(func.count()).select_from(Order).where(*filters))
    orders = await db.scalars(
        select(Order)
        .options(
            selectinload(Order.Customer),
            selectinload(Order.Table),
            selectinload(Order.Payment),
            selectinload(Order.items).selectinload(OrderDetail.MenuItem),
        )
        .where(*filters)

        .order_by(case((Order.Status == PENDING, 0), else_=1), Order.OrderDate.desc(), Order.Id.desc())
        .offset(skip)
        .limit(limit)
    )
    return MyOrdersResponse(
        Total=total or 0,
        Skip=skip,
        Limit=limit,
        Items=[
            MyOrder(**OrderResponse.from_model(o).model_dump(), TrackingStatus=_tracking_status(o), IsOpen=o.Status == PENDING)
            for o in orders
        ],
    )

async def recommendations(db: AsyncSession, customer_id: int, limit: int) -> RecommendationsResponse:
    completed_lines = (
        select(OrderDetail.MenuItemId, OrderDetail.Quantity)
        .join(Order, Order.Id == OrderDetail.OrderId)
        .where(Order.Status == COMPLETED, Order.IsDeleted == False, OrderDetail.IsDeleted == False)
    )
    mine = completed_lines.where(Order.CustomerId == customer_id).subquery()
    my_counts = dict(
        (await db.execute(select(mine.c.MenuItemId, cast(func.sum(mine.c.Quantity), Integer)).group_by(mine.c.MenuItemId))).all()
    )
    order_count = await db.scalar(
        select(func.count()).select_from(Order).where(
            Order.CustomerId == customer_id, Order.Status == COMPLETED, Order.IsDeleted == False
        )
    )

    everyone = completed_lines.subquery()
    popularity = (
        select(everyone.c.MenuItemId, func.sum(everyone.c.Quantity).label("Sold")).group_by(everyone.c.MenuItemId).subquery()
    )
    menu = (
        await db.execute(
            select(MenuItem.Id, MenuItem.Name, MenuItem.CategoryId, Category.Name, MenuItem.Price, func.coalesce(popularity.c.Sold, 0))
            .join(Category, Category.Id == MenuItem.CategoryId)
            .outerjoin(popularity, popularity.c.MenuItemId == MenuItem.Id)
            .where(MenuItem.IsDeleted == False, MenuItem.IsActive == True, MenuItem.IsAvailable == True)
            .order_by(desc(func.coalesce(popularity.c.Sold, 0)), MenuItem.Id)
        )
    ).all()
    by_id = {row[0]: row for row in menu}

    category_counts: dict[int, int] = {}
    for item_id, qty in my_counts.items():
        if item_id in by_id:
            category_counts[by_id[item_id][2]] = category_counts.get(by_id[item_id][2], 0) + qty
    favourite_ids = [c for c, _ in sorted(category_counts.items(), key=lambda kv: -kv[1])[:3]]
    category_names = {row[2]: row[3] for row in menu}

    picks: list[Recommendation] = []
    chosen: set[int] = set()

    def add(row, reason: str) -> None:
        if len(picks) < limit and row[0] not in chosen:
            chosen.add(row[0])
            picks.append(Recommendation(MenuItemId=row[0], Name=row[1], CategoryName=row[3], Price=row[4], Reason=reason))

    for item_id, qty in sorted(my_counts.items(), key=lambda kv: -kv[1])[:3]:
        if item_id in by_id:
            add(by_id[item_id], f"You've ordered this {qty} time{'s' if qty != 1 else ''}")
    for row in menu:
        if row[2] in favourite_ids and row[0] not in my_counts:
            add(row, f"Popular in {row[3]}, which you like")
    for row in menu:
        add(row, "Popular with other diners")

    return RecommendationsResponse(
        BasedOnOrders=order_count or 0,
        FavouriteCategories=[category_names[c] for c in favourite_ids],
        Items=picks,
    )
