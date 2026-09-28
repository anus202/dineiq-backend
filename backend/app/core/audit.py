import json
from contextvars import ContextVar
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Optional

from sqlalchemy import event, inspect, insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from starlette.types import ASGIApp, Receive, Scope, Send

from app.models import (
    AuditLog,
    Category,
    Customer,
    DiningTable,
    InventoryItem,
    MenuItem,
    Order,
    Payment,
    Rating,
    Recipe,
    RestaurantBranch,
    Role,
    Signup,
)
from app.models.base import utc_now

current_user_id: ContextVar[Optional[int]] = ContextVar("audit_user_id", default=None)
client_ip: ContextVar[Optional[str]] = ContextVar("audit_client_ip", default=None)

AUDITED_ENTITIES = (
    Category, MenuItem, Customer, InventoryItem, Recipe, DiningTable, Signup, Order, Payment, Role, RestaurantBranch,
    Rating,
)
SECRET_FIELDS = {"PasswordHash"}

NOISE_FIELDS = {"UpdatedAt", "UpdatedBy"}

class AuditContextMiddleware:

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            client = scope.get("client")
            client_ip.set(client[0] if client else None)
            current_user_id.set(None)
        await self.app(scope, receive, send)

def _jsonable(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Enum):
        return value.value
    return value

def _dump(values: Optional[dict]) -> Optional[str]:
    if not values:
        return None
    return json.dumps(
        {k: ("***" if k in SECRET_FIELDS else _jsonable(v)) for k, v in values.items()},
        ensure_ascii=False,
        default=str,
    )

def _row(action: str, entity: str, entity_id: Any, old: Optional[dict], new: Optional[dict], user_id: Optional[int]) -> dict:
    return {
        "UserId": user_id if user_id is not None else current_user_id.get(),
        "Action": action,
        "EntityName": entity,
        "EntityId": None if entity_id is None else str(entity_id),
        "OldValues": _dump(old),
        "NewValues": _dump(new),
        "IPAddress": client_ip.get(),
        "Timestamp": utc_now(),
    }

def _columns(obj) -> list[str]:
    return [attr.key for attr in inspect(obj).mapper.column_attrs]

def _snapshot(obj) -> dict:

    values = inspect(obj).dict
    return {key: values.get(key) for key in _columns(obj) if key not in NOISE_FIELDS}

def _changes(obj) -> tuple[dict, dict]:
    old, new = {}, {}
    state = inspect(obj)
    for key in _columns(obj):
        if key in NOISE_FIELDS:
            continue
        history = state.attrs[key].history
        if history.has_changes():
            old[key] = history.deleted[0] if history.deleted else None
            new[key] = history.added[0] if history.added else None
    return old, new

def _entity_name(obj) -> str:
    return obj.__class__.__name__

def _fallback_user(obj) -> Optional[int]:
    return current_user_id.get() or getattr(obj, "UpdatedBy", None) or getattr(obj, "CreatedBy", None)

@event.listens_for(Session, "after_flush")
def _audit_orm_changes(session: Session, _flush_context) -> None:
    rows = []
    for obj in session.new:
        if isinstance(obj, AUDITED_ENTITIES):
            rows.append(_row("CREATE", _entity_name(obj), getattr(obj, "Id", None), None, _snapshot(obj), _fallback_user(obj)))
    for obj in session.dirty:
        if isinstance(obj, AUDITED_ENTITIES) and session.is_modified(obj, include_collections=False):
            old, new = _changes(obj)
            if new:
                action = "DELETE" if new.get("IsDeleted") is True else "UPDATE"
                rows.append(_row(action, _entity_name(obj), getattr(obj, "Id", None), old, new, _fallback_user(obj)))
    for obj in session.deleted:
        if isinstance(obj, AUDITED_ENTITIES):
            rows.append(_row("DELETE", _entity_name(obj), getattr(obj, "Id", None), _snapshot(obj), None, _fallback_user(obj)))
    if rows:
        session.connection().execute(insert(AuditLog), rows)

async def record(
    db: AsyncSession,
    action: str,
    entity: str,
    entity_id: Any,
    old: Optional[dict] = None,
    new: Optional[dict] = None,
    user_id: Optional[int] = None,
) -> None:
    await db.execute(insert(AuditLog), [_row(action, entity, entity_id, old, new, user_id)])
