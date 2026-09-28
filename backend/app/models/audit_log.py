from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Unicode, UnicodeText, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utc_now

class AuditLog(Base):

    __tablename__ = "tbl_AuditLog"
    __table_args__ = (
        Index("ix_tbl_AuditLog_Timestamp", "Timestamp"),
        Index("ix_tbl_AuditLog_Entity", "EntityName", "EntityId"),
        Index("ix_tbl_AuditLog_UserId", "UserId"),
    )

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    UserId: Mapped[Optional[int]] = mapped_column(ForeignKey("tbl_Signup.Id"), nullable=True)

    Action: Mapped[str] = mapped_column(Unicode(30), nullable=False)
    EntityName: Mapped[str] = mapped_column(Unicode(60), nullable=False)
    EntityId: Mapped[Optional[str]] = mapped_column(Unicode(60), nullable=True)

    OldValues: Mapped[Optional[str]] = mapped_column(UnicodeText, nullable=True)
    NewValues: Mapped[Optional[str]] = mapped_column(UnicodeText, nullable=True)
    IPAddress: Mapped[Optional[str]] = mapped_column(Unicode(45), nullable=True)
    Timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now, server_default=func.getutcdate())
