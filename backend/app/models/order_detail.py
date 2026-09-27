from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import CommonFields

if TYPE_CHECKING:
    from app.models.menu_item import MenuItem
    from app.models.order import Order


class OrderDetail(CommonFields):
    __tablename__ = "Order_Items"
    __table_args__ = (CheckConstraint("Quantity > 0", name="CK_tbl_OrderDetails_Quantity"),)

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    OrderId: Mapped[int] = mapped_column(ForeignKey("Orders.Id"), nullable=False, index=True)
    MenuItemId: Mapped[int] = mapped_column(ForeignKey("Menu_Items.Id"), nullable=False, index=True)
    Quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    # Price at the time of the order, so later menu price changes don't rewrite old sales.
    UnitPrice: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    TotalPrice: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    # Menu cost at order time, for profit. NULL on rows imported before this column existed;
    # analytics then fall back to the menu item's current cost.
    UnitCost: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)

    Order: Mapped["Order"] = relationship(back_populates="items")
    MenuItem: Mapped["MenuItem"] = relationship()
