from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_roles
from app.core.roles import ADMIN_ONLY, FRONT_OF_HOUSE
from app.db.session import get_db
from app.models import Signup
from app.schemas.table_schema import (
    TableAssignRequest,
    TableCreate,
    TableListResponse,
    TableResponse,
    TableStatusEnum,
    TableStatusUpdate,
)
from app.services import table_service
from app.services.table_service import OrderNotSeatable, TableNotFound, TableNumberTaken, TableUnavailable

router = APIRouter(
    prefix="/api/v1/tables",
    tags=["Table Management"],
    dependencies=[Depends(require_roles(FRONT_OF_HOUSE))],
    responses={401: {"description": "Missing, invalid or expired token"}, 403: {"description": "Requires ADMIN or CASHIER"}},
)


@router.get("", response_model=TableListResponse, summary="List tables with status and seated order")
async def list_tables(
    status_filter: Optional[TableStatusEnum] = Query(None, alias="status", description="Only tables with this status"),
    db: AsyncSession = Depends(get_db),
):
    return await table_service.list_tables(db, status_filter)


@router.post(
    "",
    response_model=TableResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a table (ADMIN)",
    responses={409: {"description": "Table number already exists"}},
)
async def create_table(
    payload: TableCreate,
    db: AsyncSession = Depends(get_db),
    user: Signup = Depends(require_roles(ADMIN_ONLY)),
):
    try:
        return await table_service.create_table(db, payload, user.Id)
    except TableNumberTaken as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.post(
    "/assign",
    response_model=TableResponse,
    summary="Seat an order at a table",
    description=(
        "Seats a Pending Dine-in order at an AVAILABLE or RESERVED table and sets the party size (Pax). "
        "Assigning an already-seated order moves it. The table is freed when the bill is settled or the "
        "order is completed or cancelled."
    ),
    responses={
        400: {"description": "Order can't be seated (not Pending, not Dine-in, not found)"},
        404: {"description": "Table not found"},
        409: {"description": "Table occupied or too small"},
    },
)
async def assign_table(
    payload: TableAssignRequest,
    db: AsyncSession = Depends(get_db),
    user: Signup = Depends(require_roles(FRONT_OF_HOUSE)),
):
    try:
        return await table_service.assign(db, payload, user.Id)
    except TableNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except OrderNotSeatable as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except TableUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.put(
    "/{id}/status",
    response_model=TableResponse,
    summary="Reserve or free a table",
    description="AVAILABLE or RESERVED. An OCCUPIED table is freed by settling or cancelling its order.",
    responses={404: {"description": "Table not found"}, 409: {"description": "Table is occupied"}},
)
async def set_table_status(
    id: int,
    payload: TableStatusUpdate,
    db: AsyncSession = Depends(get_db),
    user: Signup = Depends(require_roles(FRONT_OF_HOUSE)),
):
    try:
        return await table_service.set_status(db, id, payload.Status, user.Id)
    except TableNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except TableUnavailable as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
