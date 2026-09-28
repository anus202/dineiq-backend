import logging
from collections import OrderedDict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import func, select, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import audit
from app.db.sequences import ORDER_NUMBERS
from app.db.session import is_deadlock
from app.models import Customer, DiningTable, MenuItem, Order, OrderDetail, RestaurantBranch
from app.models.base import utc_now
from app.schemas.common import TWO_PLACES
from app.schemas.inventory_schema import LowStockAlert
from app.schemas.order_schema import OrderCreate, OrderStatusEnum, OrderTypeEnum
from app.services import inventory_service

logger = logging.getLogger("dineiq.orders")

ALLOWED_TRANSITIONS = {
    OrderStatusEnum.PENDING.value: {OrderStatusEnum.COMPLETED.value, OrderStatusEnum.CANCELLED.value},
}

class OrderError(Exception):
    pass

class MenuItemsUnavailable(OrderError):
    def __init__(self, item_ids: list[int]):
        super().__init__(f"Menu items not found or unavailable: {item_ids}")
        self.item_ids = item_ids

class DiscountTooLarge(OrderError):
    def __init__(self, discount: Decimal, total: Decimal):
        super().__init__(f"Discount {discount} is greater than the order total {total}")

class InvalidStatusTransition(OrderError):
    def __init__(self, current: str, new: str):
        super().__init__(f"Cannot change status from {current} to {new}")

class CustomerNotFound(OrderError):
    def __init__(self, customer_id: int):
        super().__init__(f"Customer {customer_id} does not exist")

class BranchNotFound(OrderError):
    def __init__(self, branch_id: int):
        super().__init__(f"Branch {branch_id} does not exist or is inactive")

def _with_relations():
    return (
        selectinload(Order.Customer),
        selectinload(Order.Table),
        selectinload(Order.Payment),
        selectinload(Order.items).selectinload(OrderDetail.MenuItem),
    )

async def get_order_by_id(db: AsyncSession, order_id: int) -> Optional[Order]:
    return await db.scalar(
        select(Order)
        .options(*_with_relations())
        .where(Order.Id == order_id, Order.IsDeleted == False)
        .execution_options(populate_existing=True)
    )

async def get_all_orders(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 20,
    order_type: Optional[OrderTypeEnum] = None,
    status: Optional[OrderStatusEnum] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    customer_id: Optional[int] = None,
) -> tuple[int, list[Order]]:
    filters = [Order.IsDeleted == False]
    if customer_id is not None:
        filters.append(Order.CustomerId == customer_id)
    if order_type is not None:
        filters.append(Order.OrderType == order_type.value)
    if status is not None:
        filters.append(Order.Status == status.value)
    if start_date is not None:
        filters.append(Order.OrderDate >= datetime.combine(start_date, time.min))
    if end_date is not None:
        filters.append(Order.OrderDate < datetime.combine(end_date + timedelta(days=1), time.min))

    total = await db.scalar(select(func.count()).select_from(Order).where(*filters))
    orders = await db.scalars(
        select(Order)
        .options(*_with_relations())
        .where(*filters)
        .order_by(Order.OrderDate.desc(), Order.Id.desc())
        .offset(skip)
        .limit(limit)
    )
    return total or 0, list(orders)

async def create_order(db: AsyncSession, payload: OrderCreate, user_id: int, branch_id: Optional[int] = None) -> Order:
    year = utc_now().year

    await ORDER_NUMBERS.ensure(db, year)

    quantities: "OrderedDict[int, int]" = OrderedDict()
    for line in payload.items:
        quantities[line.MenuItemId] = quantities.get(line.MenuItemId, 0) + line.Quantity

    menu_items = {
        m.Id: m
        for m in await db.scalars(
            select(MenuItem).where(
                MenuItem.Id.in_(quantities),
                MenuItem.IsDeleted == False,
                MenuItem.IsActive == True,
                MenuItem.IsAvailable == True,
            )
        )
    }
    missing = [item_id for item_id in quantities if item_id not in menu_items]
    if missing:
        raise MenuItemsUnavailable(missing)

    if payload.CustomerId is not None:
        customer_exists = await db.scalar(
            select(Customer.Id).where(
                Customer.Id == payload.CustomerId,
                Customer.IsDeleted == False,
                Customer.IsActive == True,
            )
        )
        if customer_exists is None:
            raise CustomerNotFound(payload.CustomerId)

    if branch_id is not None:
        branch_exists = await db.scalar(
            select(RestaurantBranch.Id).where(
                RestaurantBranch.Id == branch_id,
                RestaurantBranch.IsDeleted == False,
                RestaurantBranch.IsActive == True,
            )
        )
        if branch_exists is None:
            raise BranchNotFound(branch_id)

    details = []
    for item_id, quantity in quantities.items():
        unit_price = menu_items[item_id].Price
        details.append(
            OrderDetail(
                MenuItemId=item_id,
                Quantity=quantity,
                UnitPrice=unit_price,
                TotalPrice=(unit_price * quantity).quantize(TWO_PLACES),
                UnitCost=menu_items[item_id].Cost,
                CreatedBy=user_id,
                UpdatedBy=user_id,
            )
        )

    total = sum((d.TotalPrice for d in details), Decimal("0.00"))
    if payload.Discount > total:
        raise DiscountTooLarge(payload.Discount, total)

    order = Order(
        OrderNumber=await ORDER_NUMBERS.next(db, year),
        OrderType=payload.OrderType.value,
        PaymentMethod=payload.PaymentMethod.value,
        Status=OrderStatusEnum.PENDING.value,
        CustomerId=payload.CustomerId,
        BranchId=branch_id,
        GuestCount=payload.GuestCount,
        TotalAmount=total,
        Discount=payload.Discount,
        NetAmount=(total - payload.Discount).quantize(TWO_PLACES),
        items=details,
        CreatedBy=user_id,
        UpdatedBy=user_id,
    )
    db.add(order)
    await db.commit()
    return await get_order_by_id(db, order.Id)

MAX_DEADLOCK_RETRIES = 3

async def run_with_deadlock_retry(db: AsyncSession, operation):
    for attempt in range(1, MAX_DEADLOCK_RETRIES + 1):
        try:
            return await operation()
        except DBAPIError as exc:
            await db.rollback()
            if not is_deadlock(exc) or attempt == MAX_DEADLOCK_RETRIES:
                raise
    raise AssertionError("unreachable")

async def apply_status_change(
    db: AsyncSession, order_id: int, new_status: OrderStatusEnum, user_id: int, **extra_values
) -> Optional[list[LowStockAlert]]:
    current = await db.scalar(
        select(Order.Status).where(Order.Id == order_id, Order.IsDeleted == False)
    )
    if current is None:
        return None
    if new_status.value not in ALLOWED_TRANSITIONS.get(current, set()):
        raise InvalidStatusTransition(current, new_status.value)

    updated = (
        await db.execute(
            update(Order)
            .where(Order.Id == order_id, Order.Status == current)
            .values(Status=new_status.value, UpdatedBy=user_id, **extra_values)
            .returning(Order.Id, Order.TableId)
            .execution_options(synchronize_session=False)
        )
    ).first()
    if updated is None:

        await db.rollback()
        latest = await db.scalar(select(Order.Status).where(Order.Id == order_id))
        raise InvalidStatusTransition(latest, new_status.value)
    table_id = updated[1]
    await audit.record(
        db, "STATUS_CHANGE", "Order", order_id, {"Status": current}, {"Status": new_status.value, **extra_values}, user_id
    )

    if table_id is not None:

        freed = await db.scalar(
            update(DiningTable)
            .where(DiningTable.Id == table_id, DiningTable.Status == "OCCUPIED")
            .values(Status="AVAILABLE", UpdatedBy=user_id)
            .returning(DiningTable.Id)
            .execution_options(synchronize_session=False)
        )
        if freed is not None:
            await audit.record(
                db, "TABLE_STATUS", "DiningTable", table_id, {"Status": "OCCUPIED"},
                {"Status": "AVAILABLE", "ReleasedByOrderId": order_id}, user_id,
            )

    alerts: list[LowStockAlert] = []
    if new_status == OrderStatusEnum.COMPLETED:
        alerts = await inventory_service.consume_stock_for_order(db, order_id, user_id)
        for alert in alerts:
            logger.warning(
                "Low stock: %s at %s %s (reorder level %s) after order %s",
                alert.ItemName, alert.CurrentStock, alert.Unit, alert.ReorderLevel, order_id,
            )
    return alerts

async def update_order_status(
    db: AsyncSession, order_id: int, new_status: OrderStatusEnum, user_id: int
) -> Optional[tuple[Order, list[LowStockAlert]]]:

    async def once():
        alerts = await apply_status_change(db, order_id, new_status, user_id)
        if alerts is None:
            return None

        await db.commit()
        return await get_order_by_id(db, order_id), alerts

    return await run_with_deadlock_retry(db, once)
