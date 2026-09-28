from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_roles
from app.core.roles import STOCK_MANAGERS
from app.db.session import get_db
from app.models import Signup
from app.schemas.inventory_schema import (
    InventoryItemCreate,
    InventoryItemListResponse,
    InventoryItemResponse,
    InventoryItemUpdate,
    LowStockAlert,
    RecipeResponse,
    RecipeSet,
)
from app.services import inventory_service
from app.services.inventory_service import (
    DuplicateItemName,
    ItemInUse,
    MenuItemNotFound,
    UnknownInventoryItems,
)

# Every route here requires a valid token and one of the STOCK_MANAGERS roles.
router = APIRouter(
    prefix="/api/v1/inventory",
    tags=["Inventory"],
    dependencies=[Depends(require_roles(STOCK_MANAGERS, extra_permission="CanAccessInventory"))],
    responses={401: {"description": "Missing, invalid or expired token"}, 403: {"description": "Your role can't use this endpoint"}},
)

ITEM_NOT_FOUND = {404: {"description": "Inventory item not found"}}
NAME_TAKEN = {409: {"description": "Item name already exists"}}


def _item_not_found(item_id: int) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Inventory item {item_id} not found")


@router.post(
    "/items",
    response_model=InventoryItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create inventory item",
    responses=NAME_TAKEN,
)
async def create_item(
    payload: InventoryItemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Signup = Depends(get_current_user),
):
    try:
        return await inventory_service.create_item(db, payload, current_user.Id)
    except DuplicateItemName as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.get("/items", response_model=InventoryItemListResponse, summary="List inventory items")
async def get_items(
    search: Optional[str] = Query(None, max_length=150, description="Part of the item name"),
    low_stock_only: bool = Query(False, description="Only items at or below their reorder level"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    total, items = await inventory_service.get_items(db, skip, limit, search, low_stock_only)
    return InventoryItemListResponse(
        Total=total, Skip=skip, Limit=limit, Items=[InventoryItemResponse.model_validate(i) for i in items]
    )


@router.get(
    "/alerts/low-stock",
    response_model=List[LowStockAlert],
    summary="Low-stock alerts",
    description="Every item at or below its reorder level, furthest below first.",
)
async def get_low_stock(db: AsyncSession = Depends(get_db)):
    return await inventory_service.get_low_stock(db)


@router.get("/items/{id}", response_model=InventoryItemResponse, summary="Get inventory item", responses=ITEM_NOT_FOUND)
async def get_item(id: int, db: AsyncSession = Depends(get_db)):
    item = await inventory_service.get_item(db, id)
    if item is None:
        raise _item_not_found(id)
    return item


@router.put(
    "/items/{id}",
    response_model=InventoryItemResponse,
    summary="Update inventory item (partial)",
    description="Name, unit, reorder level or unit cost. Use POST /api/v1/inventory/adjust to change the stock quantity.",
    responses={**ITEM_NOT_FOUND, **NAME_TAKEN},
)
async def update_item(
    id: int,
    payload: InventoryItemUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Signup = Depends(get_current_user),
):
    try:
        item = await inventory_service.update_item(db, id, payload, current_user.Id)
    except DuplicateItemName as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if item is None:
        raise _item_not_found(id)
    return item


@router.delete(
    "/items/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete inventory item (soft)",
    description="Keeps its movement history. Refused while a recipe still uses the item.",
    responses={**ITEM_NOT_FOUND, 409: {"description": "Item is used in a recipe"}},
)
async def delete_item(
    id: int,
    db: AsyncSession = Depends(get_db),
    current_user: Signup = Depends(get_current_user),
):
    try:
        deleted = await inventory_service.delete_item(db, id, current_user.Id)
    except ItemInUse as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if not deleted:
        raise _item_not_found(id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/recipes/{menu_item_id}",
    response_model=RecipeResponse,
    summary="Get a menu item's recipe",
    responses={404: {"description": "Menu item not found"}},
)
async def get_recipe(menu_item_id: int, db: AsyncSession = Depends(get_db)):
    recipe = await inventory_service.get_recipe(db, menu_item_id)
    if recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Menu item {menu_item_id} not found")
    return recipe


@router.put(
    "/recipes/{menu_item_id}",
    response_model=RecipeResponse,
    summary="Set a menu item's recipe",
    description="Replaces the whole recipe. Quantities are per serving, in each ingredient's unit.",
    responses={404: {"description": "Menu item not found"}, 400: {"description": "Unknown inventory item"}},
)
async def set_recipe(
    menu_item_id: int,
    payload: RecipeSet,
    db: AsyncSession = Depends(get_db),
    current_user: Signup = Depends(get_current_user),
):
    try:
        return await inventory_service.set_recipe(db, menu_item_id, payload, current_user.Id)
    except MenuItemNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except UnknownInventoryItems as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
