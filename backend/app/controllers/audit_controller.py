from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import require_roles
from app.core.roles import ADMIN_ONLY
from app.db.session import get_db
from app.schemas.audit_schema import AuditLogListResponse
from app.services import audit_service

router = APIRouter(
    prefix="/api/v1/audit-logs",
    tags=["Audit Logs"],
    dependencies=[Depends(require_roles(ADMIN_ONLY))],
    responses={401: {"description": "Missing, invalid or expired token"}, 403: {"description": "Requires ADMIN or SUPER_ADMIN"}},
)

@router.get(
    "",
    response_model=AuditLogListResponse,
    summary="System audit trail",
    description="Every create / update / delete of business records, logins, status changes, stock adjustments, "
    "table seating and loyalty-point changes, with who did it, from which IP, and the old and new values.",
)
async def list_audit_logs(
    user_id: Optional[int] = Query(None, gt=0),
    action: Optional[str] = Query(None, max_length=30, examples=["UPDATE"]),
    entity_name: Optional[str] = Query(None, max_length=60, examples=["MenuItem"]),
    entity_id: Optional[str] = Query(None, max_length=60),
    start_date: Optional[date] = Query(None, description="From this local date (inclusive)"),
    end_date: Optional[date] = Query(None, description="Up to this local date (inclusive)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="start_date must be on or before end_date")
    total, items = await audit_service.get_audit_logs(
        db, skip, limit, user_id, action, entity_name, entity_id, start_date, end_date
    )
    return AuditLogListResponse(Total=total, Skip=skip, Limit=limit, Items=items)

@router.get("/filters", response_model=dict[str, list[str]], summary="Actions and entity names present in the log")
async def filter_options(db: AsyncSession = Depends(get_db)):
    return await audit_service.get_filter_options(db)
