from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CustomerFavorite, MenuItem

class MenuItemNotFound(Exception):
    def __init__(self, menu_item_id: int):
        super().__init__(f"Menu item {menu_item_id} does not exist")

async def list_favorite_ids(db: AsyncSession, customer_id: int) -> list[int]:
    rows = await db.scalars(select(CustomerFavorite.MenuItemId).where(CustomerFavorite.CustomerId == customer_id))
    return list(rows)

async def toggle_favorite(db: AsyncSession, customer_id: int, menu_item_id: int, user_id: int) -> bool:
    menu_item_exists = await db.scalar(
        select(MenuItem.Id).where(
            MenuItem.Id == menu_item_id,
            MenuItem.IsDeleted == False,
        )
    )
    if menu_item_exists is None:
        raise MenuItemNotFound(menu_item_id)

    existing = await db.scalar(
        select(CustomerFavorite).where(
            CustomerFavorite.CustomerId == customer_id,
            CustomerFavorite.MenuItemId == menu_item_id,
        )
    )
    if existing is not None:
        await db.delete(existing)
        await db.commit()
        return False

    db.add(CustomerFavorite(CustomerId=customer_id, MenuItemId=menu_item_id, CreatedBy=user_id, UpdatedBy=user_id))
    await db.commit()
    return True
