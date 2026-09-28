from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, Numeric, Unicode
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import CommonFields

if TYPE_CHECKING:
    from app.models.inventory_item import InventoryItem
    from app.models.restaurant_branch import RestaurantBranch

class Wastage(CommonFields):

    __tablename__ = "Wastage"

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    InventoryItemId: Mapped[int] = mapped_column(ForeignKey("Inventory.Id"), nullable=False, index=True)

    BranchId: Mapped[Optional[int]] = mapped_column(ForeignKey("Restaurants.Id"), nullable=True, index=True)

    Quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    Reason: Mapped[Optional[str]] = mapped_column(Unicode(250), nullable=True)

    InventoryItem: Mapped["InventoryItem"] = relationship()
    Branch: Mapped[Optional["RestaurantBranch"]] = relationship()
