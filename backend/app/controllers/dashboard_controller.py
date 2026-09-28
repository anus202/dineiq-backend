from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_roles
from app.core.roles import ADMIN_ONLY, STOCK_MANAGERS, RoleName
from app.db.session import get_db
from app.models import Customer, Signup
from app.schemas.dashboard_schema import (
    AdminSummaryResponse,
    AdminTopPerformingResponse,
    CustomerMeResponse,
    MyOrdersResponse,
    RecommendationsResponse,
    RevenueChartResponse,
)
from app.schemas.inventory_schema import (
    MovementTypeEnum,
    StockAdjustment,
    StockAdjustmentResponse,
    StockMovementListResponse,
    StockStatusResponse,
)
from app.services import dashboard_service, inventory_service
from app.services.inventory_service import InsufficientStock

UNAUTHORIZED = {401: {"description": "Missing, invalid or expired token"}}

admin_router = APIRouter(
    prefix="/api/v1/dashboard/admin",
    tags=["Admin Dashboard"],
    dependencies=[Depends(require_roles(ADMIN_ONLY))],
    responses={**UNAUTHORIZED, 403: {"description": "Requires ADMIN or SUPER_ADMIN"}},
)

@admin_router.get("/summary", response_model=AdminSummaryResponse, summary="Today at a glance")
async def admin_summary(db: AsyncSession = Depends(get_db)):
    return await dashboard_service.admin_summary(db)

@admin_router.get("/revenue-chart", response_model=RevenueChartResponse, summary="Daily and monthly revenue trends")
async def revenue_chart(
    days: int = Query(30, ge=1, le=366, description="Daily points, ending today"),
    months: int = Query(12, ge=1, le=36, description="Monthly points, ending this month"),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.revenue_chart(db, days, months)

@admin_router.get(
    "/top-performing",
    response_model=AdminTopPerformingResponse,
    summary="Top 5 dishes and top-spending customer segments",
)
async def top_performing(
    days: int = Query(30, ge=1, le=366, description="Dishes over the last N days"),
    segments: int = Query(3, ge=1, le=6, description="How many customer segments"),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.admin_top_performing(db, days, segments)

inventory_router = APIRouter(
    tags=["Inventory Dashboard"],
    dependencies=[Depends(require_roles(STOCK_MANAGERS, extra_permission="CanAccessInventory"))],
    responses={**UNAUTHORIZED, 403: {"description": "Requires INVENTORY_MANAGER or ADMIN"}},
)

@inventory_router.get(
    "/api/v1/dashboard/inventory/stock-status",
    response_model=StockStatusResponse,
    summary="Low stock, out of stock and total valuation",
)
async def stock_status(db: AsyncSession = Depends(get_db)):
    return await inventory_service.get_stock_status(db)

@inventory_router.get(
    "/api/v1/dashboard/inventory/movement-logs",
    response_model=StockMovementListResponse,
    summary="Stock movement audit log",
    description="Every stock change (opening stock, manual additions / deductions, recipe usage by orders), newest first.",
)
async def movement_logs(
    inventory_item_id: Optional[int] = Query(None, gt=0),
    movement_type: Optional[MovementTypeEnum] = Query(None),
    order_id: Optional[int] = Query(None, gt=0),
    start_date: Optional[date] = Query(None, description="From this local date (inclusive)"),
    end_date: Optional[date] = Query(None, description="Up to this local date (inclusive)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="start_date must be on or before end_date")
    total, items = await inventory_service.get_movement_logs(
        db, skip, limit, inventory_item_id, movement_type, order_id, start_date, end_date
    )
    return StockMovementListResponse(Total=total, Skip=skip, Limit=limit, Items=items)

@inventory_router.post(
    "/api/v1/inventory/adjust",
    response_model=StockAdjustmentResponse,
    summary="Manual stock adjustment (logged)",
    description=(
        "Positive Quantity for purchases, negative for wastage or corrections; can't go below zero. "
        "The Reason is stored in tbl_StockMovementLog with who made the change."
    ),
    responses={404: {"description": "Inventory item not found"}, 400: {"description": "Would take stock below zero"}},
)
async def adjust_stock(
    payload: StockAdjustment,
    db: AsyncSession = Depends(get_db),
    user: Signup = Depends(require_roles(STOCK_MANAGERS, extra_permission="CanAccessInventory")),
):
    try:
        result = await inventory_service.adjust_stock(db, payload, user.Id, user.BranchId)
    except InsufficientStock as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Inventory item {payload.InventoryItemId} not found")
    return result

customer_only = require_roles([RoleName.CUSTOMER], allow_super_admin=False)

customer_router = APIRouter(
    prefix="/api/v1/dashboard/customer",
    tags=["Customer Dashboard"],
    responses={
        **UNAUTHORIZED,
        403: {"description": "Requires a CUSTOMER account"},
        404: {"description": "No customer profile is linked to this account"},
    },
)

async def current_customer(user: Signup = Depends(customer_only), db: AsyncSession = Depends(get_db)) -> Customer:
    customer = None
    if user.CustomerId is not None:
        customer = await db.scalar(
            select(Customer).where(Customer.Id == user.CustomerId, Customer.IsDeleted == False)
        )
    if customer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No customer profile is linked to this account. Sign up with your phone number, or ask the restaurant to link it.",
        )
    return customer

@customer_router.get("/me", response_model=CustomerMeResponse, summary="My profile, points and tier")
async def me(customer: Customer = Depends(current_customer), db: AsyncSession = Depends(get_db)):
    return await dashboard_service.customer_me(db, customer)

@customer_router.get("/my-orders", response_model=MyOrdersResponse, summary="My orders with live status")
async def my_orders(
    open_only: Optional[bool] = Query(None, description="true: only open orders; false: only past orders; omit: all"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    customer: Customer = Depends(current_customer),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.my_orders(db, customer.Id, skip, limit, open_only)

@customer_router.get(
    "/recommendations", response_model=RecommendationsResponse, summary="Dishes recommended for me"
)
async def recommendations(
    limit: int = Query(10, ge=1, le=30),
    customer: Customer = Depends(current_customer),
    db: AsyncSession = Depends(get_db),
):
    return await dashboard_service.recommendations(db, customer.Id, limit)
