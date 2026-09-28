from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import ForeignKey, Integer, Numeric, Unicode, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import CommonFields

if TYPE_CHECKING:
    from app.models.recipe import Recipe
    from app.models.restaurant_branch import RestaurantBranch

class InventoryItem(CommonFields):

    __tablename__ = "Inventory"

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ItemName: Mapped[str] = mapped_column(Unicode(150), nullable=False, index=True)
    Unit: Mapped[str] = mapped_column(Unicode(20), nullable=False)

    CurrentStock: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False, default=Decimal("0"), server_default=text("0"))
    ReorderLevel: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False, default=Decimal("0"), server_default=text("0"))

    UnitCost: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("0"), server_default=text("0"))

    BranchId: Mapped[Optional[int]] = mapped_column(ForeignKey("Restaurants.Id"), nullable=True, index=True)

    Recipes: Mapped[List["Recipe"]] = relationship(back_populates="InventoryItem")
    Branch: Mapped[Optional["RestaurantBranch"]] = relationship()
