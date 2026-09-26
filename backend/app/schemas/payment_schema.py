from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.common import Money
from app.schemas.inventory_schema import LowStockAlert
from app.schemas.order_schema import PaymentMethodEnum


class SettleRequest(BaseModel):
    OrderId: int = Field(..., gt=0, examples=[1])
    PaymentMethod: PaymentMethodEnum = Field(
        ...,
        description=(
            "Cash / Card pay what's left after any RedeemPoints. 'Loyalty Points' pays the whole bill "
            "with points (RedeemPoints is then worked out for you)."
        ),
        examples=[PaymentMethodEnum.CASH],
    )
    RedeemPoints: int = Field(0, ge=0, description="Points to put towards a Cash / Card bill (registered customers)")
    AmountTendered: Optional[Money] = Field(None, ge=0, description="Cash handed over (required for Cash)", examples=[5000])


class BillBreakdown(BaseModel):
    SubTotal: Money = Field(..., description="Order total before any discount")
    OrderDiscount: Money = Field(..., description="Discount entered on the order")
    TierName: Optional[str] = Field(None, description="Customer's loyalty tier (registered customers)")
    TierDiscountPercentage: int
    TierDiscount: Money
    AmountDue: Money = Field(..., description="After all discounts")
    PointsRedeemed: int
    PointsRedemptionAmount: Money
    AmountPayable: Money = Field(..., description="What cash / card must cover after points")
    AmountTendered: Money
    ChangeDue: Money
    PointsEarned: int
    PointsBalanceBefore: Optional[int] = None
    PointsBalanceAfter: Optional[int] = None


class PaymentPreviewResponse(BaseModel):
    OrderId: int
    OrderNumber: str
    PaymentMethod: str
    Bill: BillBreakdown


class InvoiceLine(BaseModel):
    MenuItemName: str
    Quantity: int
    UnitPrice: Money
    TotalPrice: Money


class InvoiceResponse(BaseModel):
    InvoiceNumber: str
    RestaurantName: str
    PaidAt: datetime
    OrderId: int
    OrderNumber: str
    OrderType: str
    TableNumber: Optional[str] = None
    GuestCount: int
    CustomerName: Optional[str] = Field(None, description="Null for walk-in customers")
    CustomerPhone: Optional[str] = None
    CashierName: Optional[str] = None
    PaymentMethod: str
    Lines: List[InvoiceLine]
    Bill: BillBreakdown
    LowStockAlerts: List[LowStockAlert] = Field(
        default_factory=list, description="Only on the settle response: ingredients now at or below reorder level"
    )
