from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Index, Integer, Unicode, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import CommonFields

if TYPE_CHECKING:
    from app.models.order import Order

class Customer(CommonFields):
    __tablename__ = "Customers"

    __table_args__ = (Index("ix_tbl_Customer_CreatedAt", "CreatedAt"),)

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    Name: Mapped[str] = mapped_column(Unicode(100), nullable=False)

    Phone: Mapped[str] = mapped_column(Unicode(20), unique=True, index=True, nullable=False)
    Email: Mapped[Optional[str]] = mapped_column(Unicode(100), nullable=True)
    Address: Mapped[Optional[str]] = mapped_column(Unicode(250), nullable=True)
    LoyaltyPoints: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))

    Orders: Mapped[List["Order"]] = relationship(back_populates="Customer")
