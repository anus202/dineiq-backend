from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_roles
from app.core.roles import EVERYONE, MENU_MANAGERS
from app.db.session import get_db
from app.models import Signup
from app.schemas.menu_item import MenuItemCreate, MenuItemListResponse, MenuItemResponse, MenuItemUpdate
from app.services import menu_service
from app.services.menu_service import CategoryNotFound

# Every route here requires a valid token and one of the EVERYONE roles.
router = APIRouter(
    prefix="/api/v1/menu-items",
    tags=["Menu Management"],
    dependencies=[Depends(require_roles(EVERYONE))],
    responses={401: {"description": "Missing, invalid or expired token"}, 403: {"description": "Your role can't use this endpoint"}},
)

NOT_FOUND = {404: {"description": "Menu item not found"}}
BAD_CATEGORY = {400: {"description": "CategoryId does not exist"}}


def _not_found(item_id: int) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Menu item {item_id} not found")


def _bad_category(exc: CategoryNotFound) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


@router.post(
    "",
    response_model=MenuItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create menu item",
    description="Creates the item and records its initial price in the pricing history.",
    responses=BAD_CATEGORY,
)
async def create_menu_item(
    payload: MenuItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Signup = Depends(require_roles(MENU_MANAGERS)),
):
    try:
        item = await menu_service.create_menu_item(db, payload, current_user.Id)
    except CategoryNotFound as exc:
        raise _bad_category(exc)
    return MenuItemResponse.from_model(item)


@router.get("", response_model=MenuItemListResponse, summary="Get menu items (paginated, filterable)")
async def get_menu_items(
    skip: int = Query(0, ge=0, description="Number of items to skip"),
    limit: int = Query(20, ge=1, le=100, description="Maximum items to return (1-100)"),
    category_id: Optional[int] = Query(None, gt=0, description="Only items in this category"),
    is_available: Optional[bool] = Query(None, description="Only available / unavailable items"),
    search: Optional[str] = Query(None, max_length=150, description="Name contains this text"),
    db: AsyncSession = Depends(get_db),
):
    total, items = await menu_service.get_menu_items(db, skip, limit, category_id, is_available, search)
    return MenuItemListResponse(
        Total=total, Skip=skip, Limit=limit, Items=[MenuItemResponse.from_model(i) for i in items]
    )


@router.get("/{id}", response_model=MenuItemResponse, summary="Get menu item by ID", responses=NOT_FOUND)
async def get_menu_item(id: int, db: AsyncSession = Depends(get_db)):
    item = await menu_service.get_menu_item_by_id(db, id)
    if item is None:
        raise _not_found(id)
    return MenuItemResponse.from_model(item)


@router.put(
    "/{id}",
    response_model=MenuItemResponse,
    summary="Update menu item (full or partial)",
    description="Send only the fields to change. A price change is recorded in the pricing history.",
    responses={**NOT_FOUND, **BAD_CATEGORY},
)
async def update_menu_item(
    id: int,
    payload: MenuItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Signup = Depends(require_roles(MENU_MANAGERS)),
):
    try:
        item = await menu_service.update_menu_item(db, id, payload, current_user.Id)
    except CategoryNotFound as exc:
        raise _bad_category(exc)
    if item is None:
        raise _not_found(id)
    return MenuItemResponse.from_model(item)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete menu item (soft)", responses=NOT_FOUND)
async def delete_menu_item(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Signup = Depends(require_roles(MENU_MANAGERS)),
):
    if not await menu_service.delete_menu_item(db, id, current_user.Id):
        raise _not_found(id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
