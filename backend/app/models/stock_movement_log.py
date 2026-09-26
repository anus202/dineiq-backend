from decimal import Decimal
from typing import TYPE_CHECKING, Optional

from sqlalchemy import ForeignKey, Index, Integer, Numeric, Unicode
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import CommonFields

if TYPE_CHECKING:
    from app.models.inventory_item import InventoryItem
    from app.models.restaurant_branch import RestaurantBranch


class StockMovementLog(CommonFields):
    """Append-only audit trail: one row per change to an item's stock.

    CreatedBy / CreatedAt record who changed it and when.
    """

    __tablename__ = "tbl_StockMovementLog"
    __table_args__ = (
        Index("ix_tbl_StockMovementLog_Item_CreatedAt", "InventoryItemId", "CreatedAt"),
        Index("ix_tbl_StockMovementLog_CreatedAt", "CreatedAt"),
    )

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    InventoryItemId: Mapped[int] = mapped_column(ForeignKey("tbl_InventoryItem.Id"), nullable=False)
    # INITIAL_STOCK, MANUAL_ADDITION, MANUAL_DEDUCTION or ORDER_CONSUMPTION
    MovementType: Mapped[str] = mapped_column(Unicode(30), nullable=False)
    # Positive for additions, negative for deductions, in the item's unit.
    QuantityChange: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    StockAfter: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    # Set for ORDER_CONSUMPTION.
    OrderId: Mapped[Optional[int]] = mapped_column(ForeignKey("tbl_Orders.Id"), nullable=True, index=True)
    Reason: Mapped[Optional[str]] = mapped_column(Unicode(250), nullable=True)
    # Which branch recorded this movement (for per-branch wastage analytics). MANUAL_DEDUCTION
    # movements are treated as "wastage" — the closest existing concept to spoilage/overproduction.
    BranchId: Mapped[Optional[int]] = mapped_column(ForeignKey("tbl_RestaurantBranch.Id"), nullable=True, index=True)

    InventoryItem: Mapped["InventoryItem"] = relationship()
    Branch: Mapped[Optional["RestaurantBranch"]] = relationship()
