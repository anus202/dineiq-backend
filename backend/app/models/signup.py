from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Unicode, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import CommonFields

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.login import Login
    from app.models.restaurant_branch import RestaurantBranch
    from app.models.role import Role

class Signup(CommonFields):

    __tablename__ = "tbl_Signup"

    __table_args__ = (

        Index(
            "UX_tbl_Signup_CustomerId",
            "CustomerId",
            unique=True,
            mssql_where=text("CustomerId IS NOT NULL"),
        ),
    )

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    FullName: Mapped[str] = mapped_column(Unicode(100), nullable=False)
    Email: Mapped[str] = mapped_column(String(150), unique=True, nullable=False, index=True)
    PhoneNumber: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    PasswordHash: Mapped[str] = mapped_column(String(255), nullable=False)
    RoleId: Mapped[int] = mapped_column(ForeignKey("tbl_Role.Id", name="FK_tbl_Signup_RoleId"), nullable=False)

    CustomerId: Mapped[Optional[int]] = mapped_column(
        ForeignKey("Customers.Id", name="FK_tbl_Signup_CustomerId"), nullable=True
    )

    BranchId: Mapped[Optional[int]] = mapped_column(
        ForeignKey("Restaurants.Id", name="FK_tbl_Signup_BranchId"), nullable=True
    )

    CanAccessInventory: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("0"))
    CanTriggerPipeline: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("0"))
    CanAccessMenuManagement: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("0"))
    CanAccessBranchAnalytics: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("0"))

    Role: Mapped["Role"] = relationship(lazy="joined")
    Customer: Mapped[Optional["Customer"]] = relationship()
    Branch: Mapped[Optional["RestaurantBranch"]] = relationship(lazy="joined", foreign_keys=[BranchId])
    Logins: Mapped[List["Login"]] = relationship(back_populates="User")
