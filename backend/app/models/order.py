from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, Unicode, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import CommonFields, utc_now

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.dining_table import DiningTable
    from app.models.order_detail import OrderDetail
    from app.models.payment import Payment
    from app.models.restaurant_branch import RestaurantBranch


class Order(CommonFields):
    __tablename__ = "tbl_Orders"
    # Constraint and index names match app/db/migrations.py, which adds them to existing databases.
    __table_args__ = (
        CheckConstraint("GuestCount > 0", name="CK_tbl_Orders_GuestCount"),
        # Covers analytics, which filter on Status and a date range and sum these columns.
        Index(
            "ix_tbl_Orders_Status_OrderDate",
            "Status",
            "OrderDate",
            mssql_include=["CustomerId", "GuestCount", "TotalAmount", "Discount", "NetAmount", "IsDeleted"],
        ),
    )

    Id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # NULL for walk-in customers. For a group, the primary (paying) customer.
    CustomerId: Mapped[Optional[int]] = mapped_column(
        ForeignKey("tbl_Customer.Id", name="FK_tbl_Orders_CustomerId"), nullable=True, index=True
    )
    # Dine-in orders seated at a table (set by POST /api/v1/tables/assign).
    TableId: Mapped[Optional[int]] = mapped_column(
        ForeignKey("tbl_DiningTable.Id", name="FK_tbl_Orders_TableId"), nullable=True, index=True
    )
    # Which branch this order belongs to. NULL for orders placed before branch tracking existed.
    BranchId: Mapped[Optional[int]] = mapped_column(
        ForeignKey("tbl_RestaurantBranch.Id", name="FK_tbl_Orders_BranchId"), nullable=True, index=True
    )
    # Party size, for Average Spend Per Guest.
    GuestCount: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default=text("1"))
    OrderNumber: Mapped[str] = mapped_column(Unicode(50), unique=True, nullable=False)
    OrderDate: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=utc_now, server_default=func.getutcdate(), index=True
    )
    OrderType: Mapped[str] = mapped_column(Unicode(30), nullable=False)
    PaymentMethod: Mapped[str] = mapped_column(Unicode(30), nullable=False)
    Status: Mapped[str] = mapped_column(Unicode(30), nullable=False, default="Pending", server_default=text("'Pending'"))
    TotalAmount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    Discount: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00"), server_default=text("0")
    )
    NetAmount: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    Customer: Mapped[Optional["Customer"]] = relationship(back_populates="Orders")
    Table: Mapped[Optional["DiningTable"]] = relationship()
    Branch: Mapped[Optional["RestaurantBranch"]] = relationship()
    # Set once the bill is settled (tbl_Payment.OrderId is unique).
    Payment: Mapped[Optional["Payment"]] = relationship(uselist=False, viewonly=True)
    items: Mapped[List["OrderDetail"]] = relationship(
        back_populates="Order", cascade="all, delete-orphan", order_by="OrderDetail.Id"
    )
