from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, Unicode
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import CommonFields

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.menu_item import MenuItem
    from app.models.order import Order
    from app.models.restaurant_branch import RestaurantBranch


class Rating(CommonFields):
    """A customer's 1-5 rating (optionally with a comment) for a menu item, tied to the
    order it came from and the branch it was ordered at (for branch-level rating rollups).
    """

    __tablename__ = "Ratings"
    __table_args__ = (
        CheckConstraint("Score >= 1 AND Score <= 5", name="CK_tbl_Rating_Score"),
        Index("ix_tbl_Rating_MenuItemId", "MenuItemId"),
        Index("ix_tbl_Rating_BranchId", "BranchId"),
    )

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    MenuItemId: Mapped[int] = mapped_column(ForeignKey("Menu_Items.Id", name="FK_tbl_Rating_MenuItemId"), nullable=False)
    CustomerId: Mapped[int] = mapped_column(ForeignKey("Customers.Id", name="FK_tbl_Rating_CustomerId"), nullable=False)
    OrderId: Mapped[Optional[int]] = mapped_column(ForeignKey("Orders.Id", name="FK_tbl_Rating_OrderId"), nullable=True)
    BranchId: Mapped[Optional[int]] = mapped_column(ForeignKey("Restaurants.Id", name="FK_tbl_Rating_BranchId"), nullable=True)
    Score: Mapped[int] = mapped_column(Integer, nullable=False)
    Comment: Mapped[Optional[str]] = mapped_column(Unicode(500), nullable=True)

    MenuItem: Mapped["MenuItem"] = relationship(lazy="joined")
    Customer: Mapped["Customer"] = relationship(lazy="joined")
    Order: Mapped[Optional["Order"]] = relationship()
    Branch: Mapped[Optional["RestaurantBranch"]] = relationship()
