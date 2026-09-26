from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_current_user, require_roles
from app.core.roles import ADMIN_ONLY, FRONT_OF_HOUSE
from app.db.session import get_db
from app.models import Signup
from app.schemas.analytics_schema import CustomerRFMResponse
from app.schemas.customer_schema import (
    CustomerCreate,
    CustomerDetailResponse,
    CustomerListResponse,
    CustomerOrderSummary,
    CustomerResponse,
    CustomerUpdate,
)
from app.services import analytics_service, customer_service
from app.services.customer_service import PhoneAlreadyRegistered

# Every route here requires a valid token and one of the FRONT_OF_HOUSE roles.
router = APIRouter(
    prefix="/api/v1/customers",
    tags=["Customers"],
    dependencies=[Depends(require_roles(FRONT_OF_HOUSE))],
    responses={401: {"description": "Missing, invalid or expired token"}, 403: {"description": "Your role can't use this endpoint"}},
)

NOT_FOUND = {404: {"description": "Customer not found"}}
PHONE_TAKEN = {409: {"description": "Phone number already registered"}}


def _not_found(customer_id: int) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Customer {customer_id} not found")


def _phone_taken(exc: PhoneAlreadyRegistered) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post(
    "",
    response_model=CustomerResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create customer",
    description="Phone is stored without spaces or dashes and must be unique.",
    responses=PHONE_TAKEN,
)
async def create_customer(
    payload: CustomerCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Signup = Depends(get_current_user),
):
    try:
        return await customer_service.create_customer(db, payload, current_user.Id)
    except PhoneAlreadyRegistered as exc:
        raise _phone_taken(exc)


@router.get("", response_model=CustomerListResponse, summary="Search / list customers (newest first)")
async def get_customers(
    search: Optional[str] = Query(
        None, max_length=100, description="Part of the phone number (if it's all digits) or else part of the name"
    ),
    skip: int = Query(0, ge=0, description="Number of customers to skip"),
    limit: int = Query(20, ge=1, le=100, description="Maximum customers to return (1-100)"),
    db: AsyncSession = Depends(get_db),
):
    total, customers = await customer_service.get_customers(db, skip, limit, search)
    return CustomerListResponse(
        Total=total, Skip=skip, Limit=limit, Items=[CustomerResponse.model_validate(c) for c in customers]
    )


@router.get(
    "/{id}",
    response_model=CustomerDetailResponse,
    summary="Get customer profile & order history",
    description="Stats count Completed orders only; RecentOrders lists the latest 50 of any status.",
    responses=NOT_FOUND,
)
async def get_customer(id: int, db: AsyncSession = Depends(get_db)):
    customer = await customer_service.get_customer_by_id(db, id)
    if customer is None:
        raise _not_found(id)
    stats, recent = await customer_service.get_customer_history(db, id)
    return CustomerDetailResponse(
        **CustomerResponse.model_validate(customer).model_dump(),
        Stats=stats,
        RecentOrders=[CustomerOrderSummary.model_validate(o) for o in recent],
    )


@router.get(
    "/{id}/analytics",
    response_model=CustomerRFMResponse,
    dependencies=[Depends(require_roles(ADMIN_ONLY))],
    summary="Customer RFM metrics",
    description=(
        "Recency (days since last completed order), Frequency (completed orders) and Monetary value "
        "(total spent), with 1-5 scores relative to all purchasing customers and the customer's segment."
    ),
    responses=NOT_FOUND,
)
async def get_customer_analytics(
    id: int,
    as_of: Optional[datetime] = Query(None, description="Measure recency from this UTC time (default: now)"),
    db: AsyncSession = Depends(get_db),
):
    customer = await customer_service.get_customer_by_id(db, id)
    if customer is None:
        raise _not_found(id)
    return await analytics_service.get_customer_rfm(db, customer, as_of)


@router.put(
    "/{id}",
    response_model=CustomerResponse,
    summary="Update customer (partial)",
    description="Send only the fields to change.",
    responses={**NOT_FOUND, **PHONE_TAKEN},
)
async def update_customer(
    id: int,
    payload: CustomerUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: Signup = Depends(get_current_user),
):
    try:
        customer = await customer_service.update_customer(db, id, payload, current_user.Id)
    except PhoneAlreadyRegistered as exc:
        raise _phone_taken(exc)
    if customer is None:
        raise _not_found(id)
    return customer
