from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import TYPE_CHECKING, List, Optional

from pydantic import BaseModel, Field, computed_field

from app.schemas.common import TWO_PLACES, Money
from app.schemas.inventory_schema import LowStockAlert

if TYPE_CHECKING:
    from app.models import Order


class OrderTypeEnum(str, Enum):
    DINE_IN = "Dine-in"
    TAKEAWAY = "Takeaway"
    DELIVERY = "Delivery"


class PaymentMethodEnum(str, Enum):
    CASH = "Cash"
    CARD = "Card"
    # Set by settlement when points cover the whole bill.
    LOYALTY_POINTS = "Loyalty Points"


class OrderStatusEnum(str, Enum):
    PENDING = "Pending"
    COMPLETED = "Completed"
    CANCELLED = "Cancelled"


class OrderDetailCreate(BaseModel):
    MenuItemId: int = Field(..., gt=0, examples=[1])
    Quantity: int = Field(..., gt=0, le=1000, examples=[2])


class OrderCreate(BaseModel):
    OrderType: OrderTypeEnum = Field(..., examples=[OrderTypeEnum.DINE_IN])
    PaymentMethod: PaymentMethodEnum = Field(..., examples=[PaymentMethodEnum.CASH])
    Discount: Money = Field(Decimal("0.00"), ge=0, examples=[0])
    CustomerId: Optional[int] = Field(
        None,
        gt=0,
        description=(
            "Registered customer (the primary one for a group). Omit for walk-ins. "
            "Ignored (and replaced with the caller's own linked customer) when the caller's role is CUSTOMER."
        ),
    )
    BranchId: Optional[int] = Field(
        None,
        gt=0,
        description=(
            "Which branch this order is for. Required when the caller's role is CUSTOMER "
            "(self-checkout has no assigned branch to fall back on); optional for staff, "
            "who default to their own assigned branch."
        ),
    )
    GuestCount: int = Field(1, ge=1, le=100, description="Party size", examples=[1])
    items: List[OrderDetailCreate] = Field(..., min_length=1, max_length=100)


class OrderStatusUpdate(BaseModel):
    Status: OrderStatusEnum = Field(..., examples=[OrderStatusEnum.COMPLETED])


class OrderDetailResponse(BaseModel):
    Id: int
    MenuItemId: int
    MenuItemName: str
    Quantity: int
    UnitPrice: Money
    TotalPrice: Money


class OrderCustomerSummary(BaseModel):
    CustomerName: str
    Phone: str


class OrderResponse(BaseModel):
    Id: int
    OrderNumber: str
    OrderDate: datetime
    OrderType: str
    PaymentMethod: str
    Status: str
    CustomerId: Optional[int] = None
    Customer: Optional[OrderCustomerSummary] = Field(None, description="Null for walk-in orders")
    GuestCount: int
    TableId: Optional[int] = None
    TableNumber: Optional[str] = None
    TotalAmount: Money
    Discount: Money
    NetAmount: Money
    InvoiceNumber: Optional[str] = Field(None, description="Set once the bill is settled")
    items: List[OrderDetailResponse]
    IsActive: bool
    CreatedBy: Optional[int] = None
    UpdatedBy: Optional[int] = None
    CreatedAt: datetime
    UpdatedAt: datetime

    @computed_field(description="TotalAmount / GuestCount (ASPG)")
    @property
    def AverageSpendPerGuest(self) -> Money:
        return (self.TotalAmount / self.GuestCount).quantize(TWO_PLACES)

    @classmethod
    def from_model(cls, order: "Order") -> "OrderResponse":
        """Build from an ORM Order whose Customer, Table, Payment, items and items' MenuItem are loaded."""
        return cls(
            Id=order.Id,
            OrderNumber=order.OrderNumber,
            OrderDate=order.OrderDate,
            OrderType=order.OrderType,
            PaymentMethod=order.PaymentMethod,
            Status=order.Status,
            CustomerId=order.CustomerId,
            Customer=(
                OrderCustomerSummary(CustomerName=order.Customer.Name, Phone=order.Customer.Phone)
                if order.Customer is not None
                else None
            ),
            GuestCount=order.GuestCount,
            TableId=order.TableId,
            TableNumber=order.Table.TableNumber if order.Table is not None else None,
            TotalAmount=order.TotalAmount,
            Discount=order.Discount,
            NetAmount=order.NetAmount,
            InvoiceNumber=order.Payment.InvoiceNumber if order.Payment is not None else None,
            items=[
                OrderDetailResponse(
                    Id=d.Id,
                    MenuItemId=d.MenuItemId,
                    MenuItemName=d.MenuItem.Name,
                    Quantity=d.Quantity,
                    UnitPrice=d.UnitPrice,
                    TotalPrice=d.TotalPrice,
                )
                for d in order.items
            ],
            IsActive=order.IsActive,
            CreatedBy=order.CreatedBy,
            UpdatedBy=order.UpdatedBy,
            CreatedAt=order.CreatedAt,
            UpdatedAt=order.UpdatedAt,
        )


class OrderStatusResponse(OrderResponse):
    LowStockAlerts: List[LowStockAlert] = Field(
        default_factory=list,
        description="Ingredients at or below their reorder level after this order's stock was deducted",
    )


class OrderListResponse(BaseModel):
    Total: int = Field(..., description="Orders matching the filters, before pagination")
    Skip: int
    Limit: int
    Items: List[OrderResponse]
