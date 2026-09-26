from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import MenuItem, Order, Rating, Signup
from app.schemas.rating_schema import MenuItemRatingSummary, RatingCreate


class RatingError(Exception):
    pass


class MenuItemNotFound(RatingError):
    pass


class NoCustomerProfile(RatingError):
    """The account submitting the rating has no linked tbl_Customer profile."""


class OrderNotOwnedByCustomer(RatingError):
    pass


def _with_relations():
    return (selectinload(Rating.MenuItem), selectinload(Rating.Customer))


async def create_rating(db: AsyncSession, payload: RatingCreate, user: Signup) -> Rating:
    if user.CustomerId is None:
        raise NoCustomerProfile

    menu_item = await db.scalar(
        select(MenuItem).where(MenuItem.Id == payload.MenuItemId, MenuItem.IsDeleted == False)  # noqa: E712
    )
    if menu_item is None:
        raise MenuItemNotFound

    branch_id = None
    if payload.OrderId is not None:
        order = await db.scalar(select(Order).where(Order.Id == payload.OrderId, Order.IsDeleted == False))  # noqa: E712
        if order is None or order.CustomerId != user.CustomerId:
            raise OrderNotOwnedByCustomer
        branch_id = order.BranchId

    rating = Rating(
        MenuItemId=payload.MenuItemId,
        CustomerId=user.CustomerId,
        OrderId=payload.OrderId,
        BranchId=branch_id,
        Score=payload.Score,
        Comment=payload.Comment,
        CreatedBy=user.Id,
        UpdatedBy=user.Id,
    )
    db.add(rating)
    await db.commit()
    return await db.scalar(select(Rating).options(*_with_relations()).where(Rating.Id == rating.Id))


async def list_for_menu_item(db: AsyncSession, menu_item_id: int, skip: int, limit: int) -> tuple[int, list[Rating]]:
    filters = [Rating.MenuItemId == menu_item_id, Rating.IsDeleted == False]  # noqa: E712
    total = await db.scalar(select(func.count()).select_from(Rating).where(*filters))
    rows = await db.scalars(
        select(Rating).options(*_with_relations()).where(*filters).order_by(Rating.CreatedAt.desc()).offset(skip).limit(limit)
    )
    return total or 0, list(rows)


async def list_for_customer(db: AsyncSession, customer_id: int, skip: int, limit: int) -> tuple[int, list[Rating]]:
    filters = [Rating.CustomerId == customer_id, Rating.IsDeleted == False]  # noqa: E712
    total = await db.scalar(select(func.count()).select_from(Rating).where(*filters))
    rows = await db.scalars(
        select(Rating).options(*_with_relations()).where(*filters).order_by(Rating.CreatedAt.desc()).offset(skip).limit(limit)
    )
    return total or 0, list(rows)


async def summaries_for_menu_items(db: AsyncSession, menu_item_ids: list[int]) -> dict[int, MenuItemRatingSummary]:
    """Average score + count per menu item, for showing a star rating on the menu."""
    if not menu_item_ids:
        return {}
    rows = await db.execute(
        select(Rating.MenuItemId, func.avg(Rating.Score * 1.0), func.count(Rating.Id))
        .where(Rating.MenuItemId.in_(menu_item_ids), Rating.IsDeleted == False)  # noqa: E712
        .group_by(Rating.MenuItemId)
    )
    return {
        menu_item_id: MenuItemRatingSummary(MenuItemId=menu_item_id, AverageScore=round(float(avg), 2), RatingCount=count)
        for menu_item_id, avg, count in rows
    }


async def branch_average_rating(db: AsyncSession, branch_id: Optional[int] = None) -> dict[int, float]:
    """Average rating per branch (used by the multi-branch comparison + branch dashboards)."""
    filters = [Rating.IsDeleted == False]  # noqa: E712
    if branch_id is not None:
        filters.append(Rating.BranchId == branch_id)
    rows = await db.execute(
        select(Rating.BranchId, func.avg(Rating.Score * 1.0))
        .where(*filters, Rating.BranchId.isnot(None))
        .group_by(Rating.BranchId)
    )
    return {bid: round(float(avg), 2) for bid, avg in rows}
