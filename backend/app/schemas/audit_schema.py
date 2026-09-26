from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    Id: int
    UserId: Optional[int] = None
    UserName: Optional[str] = None
    UserEmail: Optional[str] = None
    Action: str
    EntityName: str
    EntityId: Optional[str] = None
    OldValues: Optional[dict[str, Any]] = None
    NewValues: Optional[dict[str, Any]] = None
    IPAddress: Optional[str] = None
    Timestamp: datetime


class AuditLogListResponse(BaseModel):
    Total: int
    Skip: int
    Limit: int
    Items: List[AuditLogResponse]
