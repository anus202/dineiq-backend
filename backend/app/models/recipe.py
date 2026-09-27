from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import CommonFields

if TYPE_CHECKING:
    from app.models.inventory_item import InventoryItem
    from app.models.menu_item import MenuItem


class Recipe(CommonFields):
    """How much of one inventory item a single serving of a menu item uses."""

    __tablename__ = "tbl_Recipe"
    __table_args__ = (
        UniqueConstraint("MenuItemId", "InventoryItemId", name="UQ_tbl_Recipe_MenuItem_InventoryItem"),
        CheckConstraint("QuantityRequired > 0", name="CK_tbl_Recipe_QuantityRequired"),
    )

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    MenuItemId: Mapped[int] = mapped_column(ForeignKey("Menu_Items.Id"), nullable=False, index=True)
    InventoryItemId: Mapped[int] = mapped_column(ForeignKey("Inventory.Id"), nullable=False, index=True)
    # In the inventory item's unit, e.g. 0.250 kg of rice per plate.
    QuantityRequired: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)

    MenuItem: Mapped["MenuItem"] = relationship()
    InventoryItem: Mapped["InventoryItem"] = relationship(back_populates="Recipes")
