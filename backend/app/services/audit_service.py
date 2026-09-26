import json
from datetime import date, datetime, time, timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import BUSINESS_UTC_OFFSET_MINUTES
from app.models import AuditLog, Signup
from app.schemas.audit_schema import AuditLogResponse


def _load(value: Optional[str]) -> Optional[dict]:
    if not value:
        return None
    try:
        return json.loads(value)
    except ValueError:
        return {"raw": value}


async def get_audit_logs(
    db: AsyncSession,
    skip: int,
    limit: int,
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    entity_name: Optional[str] = None,
    entity_id: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> tuple[int, list[AuditLogResponse]]:
    """Newest first. Dates are local business dates (inclusive)."""
    offset = timedelta(minutes=BUSINESS_UTC_OFFSET_MINUTES)
    filters = []
    if user_id is not None:
        filters.append(AuditLog.UserId == user_id)
    if action:
        filters.append(AuditLog.Action == action.upper())
    if entity_name:
        filters.append(AuditLog.EntityName == entity_name)
    if entity_id:
        filters.append(AuditLog.EntityId == entity_id)
    if start_date is not None:
        filters.append(AuditLog.Timestamp >= datetime.combine(start_date, time.min) - offset)
    if end_date is not None:
        filters.append(AuditLog.Timestamp < datetime.combine(end_date + timedelta(days=1), time.min) - offset)

    total = await db.scalar(select(func.count()).select_from(AuditLog).where(*filters))
    rows = (
        await db.execute(
            select(AuditLog, Signup.FullName, Signup.Email)
            .outerjoin(Signup, Signup.Id == AuditLog.UserId)
            .where(*filters)
            .order_by(AuditLog.Timestamp.desc(), AuditLog.Id.desc())
            .offset(skip)
            .limit(limit)
        )
    ).all()
    return total or 0, [
        AuditLogResponse(
            Id=log.Id,
            UserId=log.UserId,
            UserName=name,
            UserEmail=email,
            Action=log.Action,
            EntityName=log.EntityName,
            EntityId=log.EntityId,
            OldValues=_load(log.OldValues),
            NewValues=_load(log.NewValues),
            IPAddress=log.IPAddress,
            Timestamp=log.Timestamp,
        )
        for log, name, email in rows
    ]


async def get_filter_options(db: AsyncSession) -> dict[str, list[str]]:
    actions = list(await db.scalars(select(AuditLog.Action).distinct().order_by(AuditLog.Action)))
    entities = list(await db.scalars(select(AuditLog.EntityName).distinct().order_by(AuditLog.EntityName)))
    return {"Actions": actions, "Entities": entities}
