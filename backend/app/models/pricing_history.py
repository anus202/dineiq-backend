from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import CommonFields, utc_now

if TYPE_CHECKING:
    from app.models.menu_item import MenuItem

class PricingHistory(CommonFields):

    __tablename__ = "Pricing_History"

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    MenuItemId: Mapped[int] = mapped_column(ForeignKey("Menu_Items.Id"), nullable=False, index=True)
    OldPrice: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    NewPrice: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    ChangedAt: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utc_now, server_default=func.getutcdate()
    )

    MenuItem: Mapped["MenuItem"] = relationship(back_populates="PricingHistory")
