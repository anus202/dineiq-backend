from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import case, delete, func, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core import audit
from app.core.config import BUSINESS_UTC_OFFSET_MINUTES
from app.models import InventoryItem, MenuItem, Order, OrderDetail, Recipe, Signup, StockMovementLog, Wastage
from app.models.base import utc_now
from app.schemas.inventory_schema import (
    InventoryItemCreate,
    InventoryItemResponse,
    InventoryItemUpdate,
    LowStockAlert,
    MovementTypeEnum,
    RecipeLineResponse,
    RecipeResponse,
    RecipeSet,
    StockAdjustment,
    StockAdjustmentResponse,
    StockItemStatus,
    StockMovementResponse,
    StockStatusResponse,
)


class InventoryError(Exception):
    """Base class for inventory failures the controller turns into HTTP errors."""


class DuplicateItemName(InventoryError):
    def __init__(self, name: str):
        super().__init__(f"An inventory item named '{name}' already exists")


class InsufficientStock(InventoryError):
    def __init__(self, item: InventoryItem, change):
        super().__init__(
            f"Removing {-change} {item.Unit} would take '{item.ItemName}' below zero "
            f"(current stock {item.CurrentStock})"
        )


class UnknownInventoryItems(InventoryError):
    def __init__(self, item_ids: list[int]):
        super().__init__(f"Inventory items not found: {item_ids}")


class ItemInUse(InventoryError):
    def __init__(self, item_name: str, menu_items: list[str]):
        super().__init__(f"'{item_name}' is used in recipes for: {', '.join(menu_items)}. Remove it from those recipes first.")


class MenuItemNotFound(InventoryError):
    def __init__(self, menu_item_id: int):
        super().__init__(f"Menu item {menu_item_id} not found")


def _not_deleted():
    return InventoryItem.IsDeleted == False  # noqa: E712


def _alert(item: InventoryItem) -> LowStockAlert:
    return LowStockAlert(
        InventoryItemId=item.Id,
        ItemName=item.ItemName,
        Unit=item.Unit,
        CurrentStock=item.CurrentStock,
        ReorderLevel=item.ReorderLevel,
    )


# --- Inventory items -------------------------------------------------------------------


async def _name_taken(db: AsyncSession, name: str, exclude_id: Optional[int] = None) -> bool:
    query = select(InventoryItem.Id).where(InventoryItem.ItemName == name, _not_deleted())
    if exclude_id is not None:
        query = query.where(InventoryItem.Id != exclude_id)
    return await db.scalar(query) is not None


async def create_item(db: AsyncSession, payload: InventoryItemCreate, user_id: int) -> InventoryItem:
    if await _name_taken(db, payload.ItemName):
        raise DuplicateItemName(payload.ItemName)
    item = InventoryItem(
        ItemName=payload.ItemName,
        Unit=payload.Unit.value,
        CurrentStock=payload.CurrentStock,
        ReorderLevel=payload.ReorderLevel,
        UnitCost=payload.UnitCost,
        CreatedBy=user_id,
        UpdatedBy=user_id,
    )
    db.add(item)
    if payload.CurrentStock > 0:
        await db.flush()  # assigns item.Id
        db.add(
            StockMovementLog(
                InventoryItemId=item.Id,
                MovementType=MovementTypeEnum.INITIAL_STOCK.value,
                QuantityChange=payload.CurrentStock,
                StockAfter=payload.CurrentStock,
                Reason="Opening stock",
                CreatedBy=user_id,
                UpdatedBy=user_id,
            )
        )
    await db.commit()
    return item


async def get_item(db: AsyncSession, item_id: int) -> Optional[InventoryItem]:
    return await db.scalar(
        select(InventoryItem)
        .where(InventoryItem.Id == item_id, _not_deleted())
        .execution_options(populate_existing=True)
    )


async def get_items(
    db: AsyncSession, skip: int, limit: int, search: Optional[str], low_stock_only: bool
) -> tuple[int, list[InventoryItem]]:
    filters = [_not_deleted()]
    if search and search.strip():
        filters.append(InventoryItem.ItemName.contains(search.strip(), autoescape=True))
    if low_stock_only:
        filters.append(InventoryItem.CurrentStock <= InventoryItem.ReorderLevel)
    total = await db.scalar(select(func.count()).select_from(InventoryItem).where(*filters))
    items = await db.scalars(
        select(InventoryItem).where(*filters).order_by(InventoryItem.ItemName).offset(skip).limit(limit)
    )
    return total or 0, list(items)


async def update_item(
    db: AsyncSession, item_id: int, payload: InventoryItemUpdate, user_id: int
) -> Optional[InventoryItem]:
    item = await get_item(db, item_id)
    if item is None:
        return None
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return item  # nothing sent: leave UpdatedBy / UpdatedAt untouched
    if "ItemName" in changes and await _name_taken(db, changes["ItemName"], exclude_id=item_id):
        raise DuplicateItemName(changes["ItemName"])
    if "Unit" in changes:
        changes["Unit"] = changes["Unit"].value
    for field, value in changes.items():
        setattr(item, field, value)
    item.UpdatedBy = user_id
    await db.commit()
    return await get_item(db, item_id)


async def adjust_stock(
    db: AsyncSession, payload: StockAdjustment, user_id: int, branch_id: Optional[int] = None
) -> Optional[StockAdjustmentResponse]:
    """Add or remove stock and log it, in one transaction.

    The UPDATE is atomic (CurrentStock = CurrentStock + change) and returns the new
    stock via OUTPUT, so concurrent adjustments never overwrite each other and the log's
    StockAfter is exact. Returns None if the item doesn't exist.
    """
    change = payload.Quantity
    new_stock = await db.scalar(
        update(InventoryItem)
        .where(
            InventoryItem.Id == payload.InventoryItemId,
            _not_deleted(),
            # A manual removal may not push stock below zero.
            (InventoryItem.CurrentStock + change) >= 0,
        )
        .values(CurrentStock=InventoryItem.CurrentStock + change, UpdatedBy=user_id)
        .returning(InventoryItem.CurrentStock)
        .execution_options(synchronize_session=False)
    )
    if new_stock is None:
        await db.rollback()
        item = await get_item(db, payload.InventoryItemId)
        if item is None:
            return None
        raise InsufficientStock(item, change)

    # Additions are genuine stock movements; removals are always spoilage, overproduction,
    # or a correction -- i.e. wastage -- so they go into the dedicated Wastage table
    # instead of the general movement log (see app/models/wastage.py).
    log = wastage = None
    if change > 0:
        log = StockMovementLog(
            InventoryItemId=payload.InventoryItemId,
            MovementType=MovementTypeEnum.MANUAL_ADDITION.value,
            QuantityChange=change,
            StockAfter=new_stock,
            Reason=payload.Reason,
            BranchId=branch_id,
            CreatedBy=user_id,
            UpdatedBy=user_id,
        )
        db.add(log)
    else:
        wastage = Wastage(
            InventoryItemId=payload.InventoryItemId,
            BranchId=branch_id,
            Quantity=-change,
            Reason=payload.Reason,
            CreatedBy=user_id,
            UpdatedBy=user_id,
        )
        db.add(wastage)
    await audit.record(
        db, "STOCK_ADJUSTMENT", "InventoryItem", payload.InventoryItemId,
        {"CurrentStock": new_stock - change}, {"CurrentStock": new_stock, "Reason": payload.Reason}, user_id,
    )
    await db.commit()

    item = await get_item(db, payload.InventoryItemId)
    if log is not None:
        movement = (await get_movement_logs(db, 0, 1, movement_id=log.Id))[1][0]
    else:
        changed_by_name = await db.scalar(select(Signup.FullName).where(Signup.Id == user_id))
        movement = StockMovementResponse(
            Id=wastage.Id,
            InventoryItemId=payload.InventoryItemId,
            ItemName=item.ItemName,
            Unit=item.Unit,
            MovementType=MovementTypeEnum.MANUAL_DEDUCTION.value,
            QuantityChange=-wastage.Quantity,
            StockAfter=new_stock,
            Reason=payload.Reason,
            ChangedBy=user_id,
            ChangedByName=changed_by_name,
            ChangedAt=wastage.CreatedAt,
        )
    return StockAdjustmentResponse(
        Item=InventoryItemResponse.model_validate(item),
        Movement=movement,
        LowStockAlert=_alert(item) if item.CurrentStock <= item.ReorderLevel else None,
    )


async def delete_item(db: AsyncSession, item_id: int, user_id: int) -> bool:
    """Soft delete (keeps its movement history). Refused while a recipe still uses the item."""
    item = await get_item(db, item_id)
    if item is None:
        return False
    used_by = list(
        await db.scalars(
            select(MenuItem.Name)
            .join(Recipe, Recipe.MenuItemId == MenuItem.Id)
            .where(Recipe.InventoryItemId == item_id, MenuItem.IsDeleted == False)  # noqa: E712
            .order_by(MenuItem.Name)
        )
    )
    if used_by:
        raise ItemInUse(item.ItemName, used_by)
    item.IsDeleted = True
    item.IsActive = False
    item.UpdatedBy = user_id
    await db.commit()
    return True


async def get_low_stock(db: AsyncSession) -> list[LowStockAlert]:
    items = await db.scalars(
        select(InventoryItem)
        .where(_not_deleted(), InventoryItem.CurrentStock <= InventoryItem.ReorderLevel)
        # Worst first: furthest below the reorder level.
        .order_by((InventoryItem.CurrentStock - InventoryItem.ReorderLevel), InventoryItem.ItemName)
    )
    return [_alert(i) for i in items]


# --- Recipes ---------------------------------------------------------------------------


async def get_recipe(db: AsyncSession, menu_item_id: int) -> Optional[RecipeResponse]:
    menu_item = await db.scalar(
        select(MenuItem).where(MenuItem.Id == menu_item_id, MenuItem.IsDeleted == False)  # noqa: E712
    )
    if menu_item is None:
        return None
    lines = await db.scalars(
        select(Recipe)
        .options(selectinload(Recipe.InventoryItem))
        .where(Recipe.MenuItemId == menu_item_id)
        .order_by(Recipe.Id)
        .execution_options(populate_existing=True)
    )
    return RecipeResponse(
        MenuItemId=menu_item.Id,
        MenuItemName=menu_item.Name,
        Lines=[
            RecipeLineResponse(
                InventoryItemId=line.InventoryItemId,
                ItemName=line.InventoryItem.ItemName,
                Unit=line.InventoryItem.Unit,
                QuantityRequired=line.QuantityRequired,
            )
            for line in lines
        ],
    )


async def set_recipe(db: AsyncSession, menu_item_id: int, payload: RecipeSet, user_id: int) -> RecipeResponse:
    """Replace a menu item's whole recipe in one transaction."""
    exists = await db.scalar(
        select(MenuItem.Id).where(MenuItem.Id == menu_item_id, MenuItem.IsDeleted == False)  # noqa: E712
    )
    if exists is None:
        raise MenuItemNotFound(menu_item_id)

    wanted = {line.InventoryItemId for line in payload.Lines}
    if wanted:
        found = set(await db.scalars(select(InventoryItem.Id).where(InventoryItem.Id.in_(wanted), _not_deleted())))
        if wanted - found:
            raise UnknownInventoryItems(sorted(wanted - found))

    await db.execute(delete(Recipe).where(Recipe.MenuItemId == menu_item_id))
    db.add_all(
        Recipe(
            MenuItemId=menu_item_id,
            InventoryItemId=line.InventoryItemId,
            QuantityRequired=line.QuantityRequired,
            CreatedBy=user_id,
            UpdatedBy=user_id,
        )
        for line in payload.Lines
    )
    await db.commit()
    return await get_recipe(db, menu_item_id)


# --- Order consumption -----------------------------------------------------------------


async def consume_stock_for_order(db: AsyncSession, order_id: int, user_id: int) -> list[LowStockAlert]:
    """Deduct every ingredient the order used and log it, inside the caller's transaction (no commit).

    One set-based UPDATE: each ingredient's total (recipe quantity x ordered quantity,
    summed over all lines) is subtracted atomically, so orders completing at the same
    time can't lose each other's deductions. Its OUTPUT returns each item's deduction
    and new stock, which become ORDER_CONSUMPTION log rows. Menu items without a recipe
    use nothing. Returns alerts for touched ingredients now at or below reorder level.
    """
    needed = (
        select(
            Recipe.InventoryItemId.label("InventoryItemId"),
            func.sum(Recipe.QuantityRequired * OrderDetail.Quantity).label("Needed"),
        )
        .join(OrderDetail, OrderDetail.MenuItemId == Recipe.MenuItemId)
        .where(OrderDetail.OrderId == order_id, OrderDetail.IsDeleted == False)  # noqa: E712
        .group_by(Recipe.InventoryItemId)
        .subquery()
    )
    changed = (
        await db.execute(
            update(InventoryItem)
            .where(InventoryItem.Id == needed.c.InventoryItemId)
            .values(CurrentStock=InventoryItem.CurrentStock - needed.c.Needed, UpdatedBy=user_id)
            .returning(InventoryItem.Id, InventoryItem.CurrentStock, needed.c.Needed)
            .execution_options(synchronize_session=False)
        )
    ).all()
    if not changed:
        return []

    now = utc_now()
    await db.execute(
        insert(StockMovementLog),
        [
            {
                "InventoryItemId": item_id,
                "MovementType": MovementTypeEnum.ORDER_CONSUMPTION.value,
                "QuantityChange": -used,
                "StockAfter": stock_after,
                "OrderId": order_id,
                "Reason": "Recipe usage",
                "CreatedBy": user_id,
                "UpdatedBy": user_id,
                "CreatedAt": now,
                "UpdatedAt": now,
            }
            for item_id, stock_after, used in changed
        ],
    )

    low = await db.scalars(
        select(InventoryItem)
        .where(
            InventoryItem.Id.in_([row[0] for row in changed]),
            _not_deleted(),
            InventoryItem.CurrentStock <= InventoryItem.ReorderLevel,
        )
        .order_by(InventoryItem.ItemName)
        .execution_options(populate_existing=True)
    )
    return [_alert(i) for i in low]


# --- Dashboard: stock status and movement log ------------------------------------------


def _item_status(item: InventoryItem) -> StockItemStatus:
    on_hand = max(item.CurrentStock, Decimal("0"))
    return StockItemStatus(
        InventoryItemId=item.Id,
        ItemName=item.ItemName,
        Unit=item.Unit,
        CurrentStock=item.CurrentStock,
        ReorderLevel=item.ReorderLevel,
        UnitCost=item.UnitCost,
        StockValue=(on_hand * item.UnitCost).quantize(Decimal("0.01")),
    )


async def get_stock_status(db: AsyncSession) -> StockStatusResponse:
    totals = (
        await db.execute(
            select(
                func.count(),
                func.sum(
                    case((InventoryItem.CurrentStock > 0, InventoryItem.CurrentStock * InventoryItem.UnitCost), else_=0)
                ),
            ).where(_not_deleted())
        )
    ).one()
    flagged = list(
        await db.scalars(
            select(InventoryItem)
            .where(_not_deleted(), InventoryItem.CurrentStock <= InventoryItem.ReorderLevel)
            .order_by((InventoryItem.CurrentStock - InventoryItem.ReorderLevel), InventoryItem.ItemName)
        )
    )
    out = [_item_status(i) for i in flagged if i.CurrentStock <= 0]
    low = [_item_status(i) for i in flagged if i.CurrentStock > 0]
    return StockStatusResponse(
        TotalItems=totals[0],
        LowStockCount=len(low),
        OutOfStockCount=len(out),
        TotalValuation=Decimal(totals[1] or 0).quantize(Decimal("0.01")),
        LowStock=low,
        OutOfStock=out,
    )


async def get_movement_logs(
    db: AsyncSession,
    skip: int,
    limit: int,
    inventory_item_id: Optional[int] = None,
    movement_type: Optional[MovementTypeEnum] = None,
    order_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    movement_id: Optional[int] = None,
) -> tuple[int, list[StockMovementResponse]]:
    """Newest first. Dates are local business dates (inclusive)."""
    offset = timedelta(minutes=BUSINESS_UTC_OFFSET_MINUTES)
    filters = []
    if movement_id is not None:
        filters.append(StockMovementLog.Id == movement_id)
    if inventory_item_id is not None:
        filters.append(StockMovementLog.InventoryItemId == inventory_item_id)
    if movement_type is not None:
        filters.append(StockMovementLog.MovementType == movement_type.value)
    if order_id is not None:
        filters.append(StockMovementLog.OrderId == order_id)
    if start_date is not None:
        filters.append(StockMovementLog.CreatedAt >= datetime.combine(start_date, time.min) - offset)
    if end_date is not None:
        filters.append(StockMovementLog.CreatedAt < datetime.combine(end_date + timedelta(days=1), time.min) - offset)

    total = await db.scalar(select(func.count()).select_from(StockMovementLog).where(*filters))
    rows = (
        await db.execute(
            select(StockMovementLog, InventoryItem.ItemName, InventoryItem.Unit, Order.OrderNumber, Signup.FullName)
            .join(InventoryItem, InventoryItem.Id == StockMovementLog.InventoryItemId)
            .outerjoin(Order, Order.Id == StockMovementLog.OrderId)
            .outerjoin(Signup, Signup.Id == StockMovementLog.CreatedBy)
            .where(*filters)
            .order_by(StockMovementLog.CreatedAt.desc(), StockMovementLog.Id.desc())
            .offset(skip)
            .limit(limit)
        )
    ).all()
    return total or 0, [
        StockMovementResponse(
            Id=log.Id,
            InventoryItemId=log.InventoryItemId,
            ItemName=item_name,
            Unit=unit,
            MovementType=log.MovementType,
            QuantityChange=log.QuantityChange,
            StockAfter=log.StockAfter,
            OrderId=log.OrderId,
            OrderNumber=order_number,
            Reason=log.Reason,
            ChangedBy=log.CreatedBy,
            ChangedByName=changed_by,
            ChangedAt=log.CreatedAt,
        )
        for log, item_name, unit, order_number, changed_by in rows
    ]
