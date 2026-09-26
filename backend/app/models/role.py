from typing import Optional

from sqlalchemy import Integer, Unicode
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import CommonFields


class Role(CommonFields):
    """One of app.core.roles.RoleName; rows are seeded at startup."""

    __tablename__ = "tbl_Role"

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    Name: Mapped[str] = mapped_column(Unicode(30), unique=True, nullable=False)
    Description: Mapped[Optional[str]] = mapped_column(Unicode(200), nullable=True)
