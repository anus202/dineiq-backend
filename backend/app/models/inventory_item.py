from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import ForeignKey, Integer, Numeric, Unicode, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import CommonFields

if TYPE_CHECKING:
    from app.models.recipe import Recipe
    from app.models.restaurant_branch import RestaurantBranch


class InventoryItem(CommonFields):
    """A raw material, e.g. rice (kg), cooking oil (liters), eggs (pcs)."""

    __tablename__ = "tbl_InventoryItem"

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ItemName: Mapped[str] = mapped_column(Unicode(150), nullable=False, index=True)
    Unit: Mapped[str] = mapped_column(Unicode(20), nullable=False)
    # Can go below zero: completing an order records food already served, even if the
    # recorded stock was wrong. A negative figure shows up as a low-stock alert.
    CurrentStock: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False, default=Decimal("0"), server_default=text("0"))
    ReorderLevel: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False, default=Decimal("0"), server_default=text("0"))
    # Purchase cost per unit (PKR per kg / liter / piece), for stock valuation.
    UnitCost: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"), server_default=text("0"))
    # NULL = shared across every branch (true today for all existing items — this system
    # has one central inventory list, not per-branch stock rooms). Set to scope an item
    # to a single branch going forward.
    BranchId: Mapped[Optional[int]] = mapped_column(ForeignKey("tbl_RestaurantBranch.Id"), nullable=True, index=True)

    Recipes: Mapped[List["Recipe"]] = relationship(back_populates="InventoryItem")
    Branch: Mapped[Optional["RestaurantBranch"]] = relationship()
