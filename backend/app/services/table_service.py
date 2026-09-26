from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import audit
from app.models import DiningTable, Order
from app.schemas.order_schema import OrderStatusEnum, OrderTypeEnum
from app.schemas.table_schema import (
    ManualTableStatusEnum,
    SeatedOrder,
    TableAssignRequest,
    TableCreate,
    TableListResponse,
    TableResponse,
    TableStatusEnum,
)

PENDING = OrderStatusEnum.PENDING.value
AVAILABLE, OCCUPIED, RESERVED = (s.value for s in TableStatusEnum)


class TableError(Exception):
    """Base class for table failures the controller turns into HTTP errors."""


class TableNumberTaken(TableError):
    def __init__(self, number: str):
        super().__init__(f"Table {number} already exists")


class TableNotFound(TableError):
    def __init__(self, table_id: int):
        super().__init__(f"Table {table_id} not found")


class OrderNotSeatable(TableError):
    pass


class TableUnavailable(TableError):
    pass


def _not_deleted():
    return DiningTable.IsDeleted == False  # noqa: E712


async def _seated_orders(db: AsyncSession, table_ids: list[int]) -> dict[int, SeatedOrder]:
    if not table_ids:
        return {}
    orders = await db.scalars(
        select(Order)
        .where(Order.TableId.in_(table_ids), Order.Status == PENDING, Order.IsDeleted == False)  # noqa: E712
        # Refresh: assign() changes TableId with a Core UPDATE, and an Order already in the
        # session (expire_on_commit=False) would otherwise keep its old TableId.
        .execution_options(populate_existing=True)
    )
    return {
        o.TableId: SeatedOrder(
            OrderId=o.Id, OrderNumber=o.OrderNumber, GuestCount=o.GuestCount, NetAmount=o.NetAmount, OrderDate=o.OrderDate
        )
        for o in orders
    }


async def _response(db: AsyncSession, table: DiningTable) -> TableResponse:
    seated = await _seated_orders(db, [table.Id])
    return TableResponse(
        Id=table.Id, TableNumber=table.TableNumber, Capacity=table.Capacity, Status=table.Status, CurrentOrder=seated.get(table.Id)
    )


async def get_table(db: AsyncSession, table_id: int) -> Optional[DiningTable]:
    return await db.scalar(
        select(DiningTable).where(DiningTable.Id == table_id, _not_deleted()).execution_options(populate_existing=True)
    )


async def list_tables(db: AsyncSession, status: Optional[TableStatusEnum]) -> TableListResponse:
    tables = list(await db.scalars(select(DiningTable).where(_not_deleted()).order_by(DiningTable.TableNumber)))
    counts = {s: sum(1 for t in tables if t.Status == s) for s in (AVAILABLE, OCCUPIED, RESERVED)}
    shown = [t for t in tables if status is None or t.Status == status.value]
    seated = await _seated_orders(db, [t.Id for t in shown if t.Status == OCCUPIED])
    return TableListResponse(
        Total=len(tables),
        Available=counts[AVAILABLE],
        Occupied=counts[OCCUPIED],
        Reserved=counts[RESERVED],
        Items=[
            TableResponse(Id=t.Id, TableNumber=t.TableNumber, Capacity=t.Capacity, Status=t.Status, CurrentOrder=seated.get(t.Id))
            for t in shown
        ],
    )


async def create_table(db: AsyncSession, payload: TableCreate, user_id: int) -> TableResponse:
    table = DiningTable(TableNumber=payload.TableNumber, Capacity=payload.Capacity, CreatedBy=user_id, UpdatedBy=user_id)
    db.add(table)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise TableNumberTaken(payload.TableNumber)
    return await _response(db, table)


async def set_status(db: AsyncSession, table_id: int, status: ManualTableStatusEnum, user_id: int) -> TableResponse:
    """Reserve or free a table. An OCCUPIED table is freed by settling or cancelling its order."""
    updated = await db.scalar(
        update(DiningTable)
        .where(DiningTable.Id == table_id, _not_deleted(), DiningTable.Status != OCCUPIED)
        .values(Status=status.value, UpdatedBy=user_id)
        .returning(DiningTable.Id)
        .execution_options(synchronize_session=False)
    )
    if updated is None:
        await db.rollback()
        table = await get_table(db, table_id)
        if table is None:
            raise TableNotFound(table_id)
        seated = (await _seated_orders(db, [table_id])).get(table_id)
        which = f" by order {seated.OrderNumber}" if seated else ""
        raise TableUnavailable(f"Table {table.TableNumber} is occupied{which}; settle or cancel the order to free it")
    await audit.record(db, "TABLE_STATUS", "DiningTable", table_id, None, {"Status": status.value}, user_id)
    await db.commit()
    return await _response(db, await get_table(db, table_id))


async def assign(db: AsyncSession, payload: TableAssignRequest, user_id: int) -> TableResponse:
    """Seat a Pending dine-in order at a table (moving it if it was seated elsewhere).

    Both UPDATEs are conditional, so two cashiers can't seat two parties at one table,
    and one order can't end up at two tables.
    """
    table = await get_table(db, payload.TableId)
    if table is None:
        raise TableNotFound(payload.TableId)
    order = await db.scalar(
        select(Order).where(Order.Id == payload.OrderId, Order.IsDeleted == False)  # noqa: E712
    )
    if order is None:
        raise OrderNotSeatable(f"Order {payload.OrderId} not found")
    if order.Status != PENDING:
        raise OrderNotSeatable(f"Order {order.OrderNumber} is {order.Status}; only Pending orders can be seated")
    if order.OrderType != OrderTypeEnum.DINE_IN.value:
        raise OrderNotSeatable(f"Order {order.OrderNumber} is {order.OrderType}; only Dine-in orders get a table")
    guests = payload.GuestCount or order.GuestCount
    if guests > table.Capacity:
        raise TableUnavailable(f"Table {table.TableNumber} seats {table.Capacity}, but the party is {guests}")

    # Plain values for error messages: rollback() expires ORM objects, and reloading an
    # expired attribute is implicit IO, which async SQLAlchemy doesn't allow.
    table_number, order_number = table.TableNumber, order.OrderNumber
    previous_table = order.TableId
    if previous_table != table.Id:
        claimed = await db.scalar(
            update(DiningTable)
            .where(DiningTable.Id == table.Id, _not_deleted(), DiningTable.Status.in_([AVAILABLE, RESERVED]))
            .values(Status=OCCUPIED, UpdatedBy=user_id)
            .returning(DiningTable.Id)
            .execution_options(synchronize_session=False)
        )
        if claimed is None:
            await db.rollback()
            raise TableUnavailable(f"Table {table_number} is already occupied")

    moved = await db.scalar(
        update(Order)
        .where(
            Order.Id == order.Id,
            Order.Status == PENDING,
            (Order.TableId == previous_table) if previous_table is not None else Order.TableId.is_(None),
        )
        .values(TableId=table.Id, GuestCount=guests, UpdatedBy=user_id)
        .returning(Order.Id)
        .execution_options(synchronize_session=False)
    )
    if moved is None:
        await db.rollback()
        raise OrderNotSeatable(f"Order {order_number} was changed by another request; try again")

    await audit.record(
        db, "TABLE_ASSIGN", "DiningTable", table.Id, {"PreviousTableId": previous_table},
        {"Status": OCCUPIED, "OrderId": order.Id, "GuestCount": guests}, user_id,
    )
    if previous_table is not None and previous_table != table.Id:
        await db.execute(
            update(DiningTable)
            .where(DiningTable.Id == previous_table, DiningTable.Status == OCCUPIED)
            .values(Status=AVAILABLE, UpdatedBy=user_id)
            .execution_options(synchronize_session=False)
        )
    await db.commit()
    return await _response(db, await get_table(db, table.Id))
