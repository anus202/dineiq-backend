from datetime import date
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, Unicode
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import CommonFields

if TYPE_CHECKING:
    from app.models.menu_item import MenuItem
    from app.models.restaurant_branch import RestaurantBranch


class Promotion(CommonFields):
    """A discount campaign. NULL MenuItemId = store-wide; NULL BranchId = every branch."""

    __tablename__ = "Promotions"
    __table_args__ = (
        CheckConstraint("DiscountPercent > 0 AND DiscountPercent <= 100", name="CK_tbl_Promotion_DiscountPercent"),
        CheckConstraint("EndDate >= StartDate", name="CK_tbl_Promotion_DateRange"),
    )

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    Name: Mapped[str] = mapped_column(Unicode(150), nullable=False)
    Description: Mapped[Optional[str]] = mapped_column(Unicode(500), nullable=True)
    DiscountPercent: Mapped[int] = mapped_column(Integer, nullable=False)
    StartDate: Mapped[date] = mapped_column(Date, nullable=False)
    EndDate: Mapped[date] = mapped_column(Date, nullable=False)
    MenuItemId: Mapped[Optional[int]] = mapped_column(ForeignKey("Menu_Items.Id"), nullable=True, index=True)
    BranchId: Mapped[Optional[int]] = mapped_column(ForeignKey("Restaurants.Id"), nullable=True, index=True)
    # Redeemable voucher code for the customer-facing checkout's "Apply" box (case-insensitive
    # match, see promotion_service.validate_code). NULL for promotions that aren't
    # customer-redeemable by code (e.g. ones applied automatically at settlement).
    Code: Mapped[Optional[str]] = mapped_column(Unicode(40), nullable=True)

    MenuItem: Mapped[Optional["MenuItem"]] = relationship()
    Branch: Mapped[Optional["RestaurantBranch"]] = relationship()
