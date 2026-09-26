from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_roles
from app.core.roles import FRONT_OF_HOUSE
from app.db.session import get_db
from app.models import Signup
from app.schemas.order_schema import (
    OrderCreate,
    OrderListResponse,
    OrderResponse,
    OrderStatusEnum,
    OrderStatusResponse,
    OrderStatusUpdate,
    OrderTypeEnum,
)
from app.services import order_service
from app.services.order_service import (
    CustomerNotFound,
    DiscountTooLarge,
    InvalidStatusTransition,
    MenuItemsUnavailable,
)

# Every route here requires a valid token and one of the FRONT_OF_HOUSE roles.
router = APIRouter(
    prefix="/api/v1/orders",
    tags=["Orders & Sales"],
    dependencies=[Depends(require_roles(FRONT_OF_HOUSE))],
    responses={401: {"description": "Missing, invalid or expired token"}, 403: {"description": "Your role can't use this endpoint"}},
)

NOT_FOUND = {404: {"description": "Order not found"}}


def _not_found(order_id: int) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Order {order_id} not found")


@router.post(
    "",
    response_model=OrderResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create order",
    description=(
        "Prices come from the current menu, not the request. Repeated menu items are merged into one line. "
        "New orders start as Pending. Omit CustomerId for walk-ins; for a group, pass the primary "
        "customer and the party size as GuestCount."
    ),
    responses={400: {"description": "Menu item or customer not found, or discount larger than the total"}},
)
async def create_order(
    payload: OrderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Signup = Depends(get_current_user),
):
    try:
        order = await order_service.create_order(db, payload, current_user.Id, current_user.BranchId)
    except (MenuItemsUnavailable, DiscountTooLarge, CustomerNotFound) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return OrderResponse.from_model(order)


@router.get("", response_model=OrderListResponse, summary="Get orders (paginated, filterable)")
async def get_orders(
    skip: int = Query(0, ge=0, description="Number of orders to skip"),
    limit: int = Query(20, ge=1, le=100, description="Maximum orders to return (1-100)"),
    order_type: Optional[OrderTypeEnum] = Query(None, description="Only this order type"),
    status_filter: Optional[OrderStatusEnum] = Query(None, alias="status", description="Only this status"),
    start_date: Optional[date] = Query(None, description="From this date (inclusive, UTC), e.g. 2026-09-01"),
    end_date: Optional[date] = Query(None, description="Up to this date (inclusive, UTC), e.g. 2026-09-30"),
    customer_id: Optional[int] = Query(None, gt=0, description="Only this customer's orders"),
    db: AsyncSession = Depends(get_db),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="start_date must be on or before end_date")
    total, orders = await order_service.get_all_orders(
        db, skip, limit, order_type, status_filter, start_date, end_date, customer_id
    )
    return OrderListResponse(Total=total, Skip=skip, Limit=limit, Items=[OrderResponse.from_model(o) for o in orders])


@router.get("/{id}", response_model=OrderResponse, summary="Get order by ID", responses=NOT_FOUND)
async def get_order(id: int, db: AsyncSession = Depends(get_db)):
    order = await order_service.get_order_by_id(db, id)
    if order is None:
        raise _not_found(id)
    return OrderResponse.from_model(order)


@router.put(
    "/{id}/status",
    response_model=OrderStatusResponse,
    summary="Update order status",
    description=(
        "Pending orders can become Completed or Cancelled; Completed and Cancelled are final. "
        "Completing an order deducts its ingredients (from each menu item's recipe) from stock and "
        "returns LowStockAlerts for any ingredient now at or below its reorder level."
    ),
    responses={**NOT_FOUND, 409: {"description": "Status change not allowed"}},
)
async def update_order_status(
    id: int,
    payload: OrderStatusUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Signup = Depends(get_current_user),
):
    try:
        result = await order_service.update_order_status(db, id, payload.Status, current_user.Id)
    except InvalidStatusTransition as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if result is None:
        raise _not_found(id)
    order, alerts = result
    return OrderStatusResponse(**OrderResponse.from_model(order).model_dump(), LowStockAlerts=alerts)
