from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category
from app.schemas.category import CategoryCreate, CategoryUpdate

async def get_all(db: AsyncSession) -> list[Category]:
    result = await db.scalars(
        select(Category).where(Category.IsDeleted == False).order_by(Category.Id)
    )
    return list(result)

async def get_by_id(db: AsyncSession, category_id: int) -> Optional[Category]:
    return await db.scalar(
        select(Category).where(Category.Id == category_id, Category.IsDeleted == False)
    )

async def create(db: AsyncSession, payload: CategoryCreate, user_id: int) -> Category:
    category = Category(Name=payload.Name, CreatedBy=user_id, UpdatedBy=user_id)
    db.add(category)
    await db.commit()
    return category

async def update(db: AsyncSession, category_id: int, payload: CategoryUpdate, user_id: int) -> Optional[Category]:
    category = await get_by_id(db, category_id)
    if category is None:
        return None
    category.Name = payload.Name
    category.UpdatedBy = user_id
    await db.commit()
    return category

async def delete(db: AsyncSession, category_id: int, user_id: int) -> bool:
    category = await get_by_id(db, category_id)
    if category is None:
        return False
    category.IsDeleted = True
    category.IsActive = False
    category.UpdatedBy = user_id
    await db.commit()
    return True
