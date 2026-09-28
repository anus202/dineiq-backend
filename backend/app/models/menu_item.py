from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, Unicode, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import CommonFields

if TYPE_CHECKING:
    from app.models.category import Category
    from app.models.pricing_history import PricingHistory

class MenuItem(CommonFields):
    __tablename__ = "Menu_Items"

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    CategoryId: Mapped[int] = mapped_column(ForeignKey("Menu_Categories.Id"), nullable=False, index=True)
    Name: Mapped[str] = mapped_column(Unicode(150), nullable=False, index=True)
    Description: Mapped[Optional[str]] = mapped_column(Unicode(500), nullable=True)
    Price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    Cost: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    IsAvailable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("1"))

    Category: Mapped["Category"] = relationship()
    PricingHistory: Mapped[List["PricingHistory"]] = relationship(back_populates="MenuItem")
