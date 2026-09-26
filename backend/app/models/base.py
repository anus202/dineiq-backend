from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, func, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utc_now() -> datetime:
    # SQL Server DATETIME has no time zone, so store naive UTC.
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class CommonFields(Base):
    __abstract__ = True

    # sort_order keeps these audit columns after each table's own columns.
    # default= fills values on ORM inserts; server_default= covers raw SQL inserts.
    CreatedBy: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, sort_order=100)
    UpdatedBy: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, sort_order=100)
    CreatedAt: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utc_now, server_default=func.getutcdate(), sort_order=100
    )
    UpdatedAt: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
        server_default=func.getutcdate(),
        sort_order=100,
    )
    IsActive: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("1"), sort_order=100
    )
    IsDeleted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("0"), sort_order=100
    )
