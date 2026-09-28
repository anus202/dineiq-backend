from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import CommonFields

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.menu_item import MenuItem

class CustomerFavorite(CommonFields):

    __tablename__ = "Customer_Favorites"
    __table_args__ = (
        UniqueConstraint("CustomerId", "MenuItemId", name="UX_Customer_Favorites_Customer_MenuItem"),
        Index("ix_Customer_Favorites_CustomerId", "CustomerId"),
    )

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    CustomerId: Mapped[int] = mapped_column(ForeignKey("Customers.Id", name="FK_Customer_Favorites_CustomerId"), nullable=False)
    MenuItemId: Mapped[int] = mapped_column(ForeignKey("Menu_Items.Id", name="FK_Customer_Favorites_MenuItemId"), nullable=False)

    Customer: Mapped["Customer"] = relationship()
    MenuItem: Mapped["MenuItem"] = relationship(lazy="joined")
