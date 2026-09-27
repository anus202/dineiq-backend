from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, Unicode, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import CommonFields, utc_now

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.order import Order


class Payment(CommonFields):
    """The settlement of one order, with everything needed to reprint its invoice."""

    __tablename__ = "tbl_Payment"

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    InvoiceNumber: Mapped[str] = mapped_column(Unicode(50), unique=True, nullable=False)
    # Unique: an order is settled once.
    OrderId: Mapped[int] = mapped_column(ForeignKey("Orders.Id"), unique=True, nullable=False)
    CustomerId: Mapped[Optional[int]] = mapped_column(ForeignKey("Customers.Id"), nullable=True, index=True)
    # Cash, Card or Loyalty Points (the method covering what points didn't).
    PaymentMethod: Mapped[str] = mapped_column(Unicode(30), nullable=False)
    SubTotal: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    OrderDiscount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    TierName: Mapped[Optional[str]] = mapped_column(Unicode(20), nullable=True)
    TierDiscountPercentage: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    TierDiscount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    # After all discounts, before points.
    AmountDue: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    PointsRedeemed: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    PointsRedemptionAmount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    # What cash / card had to cover after points.
    AmountPayable: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    AmountTendered: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    ChangeDue: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"))
    PointsEarned: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
    PaidAt: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now, server_default=func.getutcdate())

    Order: Mapped["Order"] = relationship()
    Customer: Mapped[Optional["Customer"]] = relationship()
