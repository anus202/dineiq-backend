from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Integer, Numeric, Unicode
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import CommonFields

if TYPE_CHECKING:
    from app.models.inventory_item import InventoryItem
    from app.models.restaurant_branch import RestaurantBranch


class Wastage(CommonFields):
    """A recorded loss of inventory stock — spoilage, overproduction, or a correction.

    The SRS's dedicated wastage table. Split out from tbl_StockMovementLog (which keeps
    only genuine stock movements: initial stock, purchases, and order consumption) so
    wastage reporting reads from its own table instead of filtering a shared log by
    movement type. Cost is computed at query time from the item's current UnitCost,
    matching how the rest of the app values inventory, rather than being duplicated here.
    """

    __tablename__ = "Wastage"

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    InventoryItemId: Mapped[int] = mapped_column(ForeignKey("Inventory.Id"), nullable=False, index=True)
    # Which branch recorded this loss; NULL for wastage not tied to a specific branch.
    BranchId: Mapped[Optional[int]] = mapped_column(ForeignKey("Restaurants.Id"), nullable=True, index=True)
    # Always positive: the amount wasted, in the inventory item's unit.
    Quantity: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    Reason: Mapped[Optional[str]] = mapped_column(Unicode(250), nullable=True)

    InventoryItem: Mapped["InventoryItem"] = relationship()
    Branch: Mapped[Optional["RestaurantBranch"]] = relationship()
