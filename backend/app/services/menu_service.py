from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Category, MenuItem, PricingHistory
from app.schemas.menu_item import MenuItemCreate, MenuItemUpdate


class CategoryNotFound(Exception):
    def __init__(self, category_id: int):
        super().__init__(f"Category {category_id} does not exist")
        self.category_id = category_id


async def _ensure_category_exists(db: AsyncSession, category_id: int) -> None:
    exists = await db.scalar(
        select(Category.Id).where(Category.Id == category_id, Category.IsDeleted == False)  # noqa: E712
    )
    if exists is None:
        raise CategoryNotFound(category_id)


async def get_menu_item_by_id(db: AsyncSession, item_id: int) -> Optional[MenuItem]:
    return await db.scalar(
        select(MenuItem)
        .options(selectinload(MenuItem.Category))
        .where(MenuItem.Id == item_id, MenuItem.IsDeleted == False)  # noqa: E712
        # Reload even if already in the session, so Category reflects the latest CategoryId.
        .execution_options(populate_existing=True)
    )


async def get_menu_items(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 20,
    category_id: Optional[int] = None,
    is_available: Optional[bool] = None,
    search: Optional[str] = None,
) -> tuple[int, list[MenuItem]]:
    """Return (total matching, one page of items)."""
    filters = [MenuItem.IsDeleted == False]  # noqa: E712
    if category_id is not None:
        filters.append(MenuItem.CategoryId == category_id)
    if is_available is not None:
        filters.append(MenuItem.IsAvailable == is_available)
    if search:
        # autoescape so %, _ in the search text match literally.
        filters.append(MenuItem.Name.contains(search.strip(), autoescape=True))

    total = await db.scalar(select(func.count()).select_from(MenuItem).where(*filters))
    items = await db.scalars(
        select(MenuItem)
        .options(selectinload(MenuItem.Category))
        .where(*filters)
        .order_by(MenuItem.Id)  # SQL Server requires ORDER BY for OFFSET/FETCH
        .offset(skip)
        .limit(limit)
    )
    return total or 0, list(items)


async def create_menu_item(db: AsyncSession, payload: MenuItemCreate, user_id: int) -> MenuItem:
    await _ensure_category_exists(db, payload.CategoryId)

    item = MenuItem(**payload.model_dump(), CreatedBy=user_id, UpdatedBy=user_id)
    db.add(item)
    await db.flush()  # assigns item.Id

    db.add(PricingHistory(MenuItemId=item.Id, OldPrice=None, NewPrice=item.Price, CreatedBy=user_id, UpdatedBy=user_id))
    await db.commit()
    return await get_menu_item_by_id(db, item.Id)


async def update_menu_item(
    db: AsyncSession, item_id: int, payload: MenuItemUpdate, user_id: int
) -> Optional[MenuItem]:
    item = await get_menu_item_by_id(db, item_id)
    if item is None:
        return None

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        return item  # nothing sent: leave UpdatedBy / UpdatedAt untouched
    if "CategoryId" in changes and changes["CategoryId"] != item.CategoryId:
        await _ensure_category_exists(db, changes["CategoryId"])

    old_price = item.Price
    for field, value in changes.items():
        setattr(item, field, value)
    item.UpdatedBy = user_id

    if "Price" in changes and changes["Price"] != old_price:
        db.add(
            PricingHistory(MenuItemId=item.Id, OldPrice=old_price, NewPrice=changes["Price"], CreatedBy=user_id, UpdatedBy=user_id)
        )

    await db.commit()
    return await get_menu_item_by_id(db, item.Id)


async def delete_menu_item(db: AsyncSession, item_id: int, user_id: int) -> bool:
    """Soft delete: sets IsDeleted so the item and its price history stay for reporting."""
    item = await get_menu_item_by_id(db, item_id)
    if item is None:
        return False
    item.IsDeleted = True
    item.IsActive = False
    item.UpdatedBy = user_id
    await db.commit()
    return True
