from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.analytics_schema import SegmentSummary, TopItem
from app.schemas.common import Money, MoneyTotal
from app.schemas.order_schema import OrderResponse

# --- Admin -----------------------------------------------------------------------------


class AdminSummaryResponse(BaseModel):
    BusinessDate: date = Field(..., description="Today in the business time zone")
    SalesToday: MoneyTotal = Field(..., description="NetAmount of orders completed today")
    CompletedOrdersToday: int
    OrdersToday: int = Field(..., description="Orders placed today, excluding cancelled")
    GuestsToday: int
    AverageOrderValueToday: MoneyTotal
    PendingOrders: int = Field(..., description="All orders still Pending")
    ActiveTables: int = Field(..., description="Tables OCCUPIED now")
    ReservedTables: int
    TotalTables: int
    LowStockItems: int = Field(..., description="Inventory items at or below reorder level (including out of stock)")
    OutOfStockItems: int


class RevenuePoint(BaseModel):
    Period: str = Field(..., examples=["2026-09-24", "2026-09"])
    Revenue: MoneyTotal
    Orders: int


class RevenueChartResponse(BaseModel):
    TimeZoneOffsetMinutes: int
    Daily: List[RevenuePoint] = Field(..., description="One point per day, oldest first, zero-filled")
    Monthly: List[RevenuePoint] = Field(..., description="One point per month, oldest first, zero-filled")


class AdminTopPerformingResponse(BaseModel):
    PeriodDays: int
    TopItems: List[TopItem]
    TopSpendingSegments: List[SegmentSummary] = Field(..., description="Customer segments by revenue, highest first")


# --- Customer portal -------------------------------------------------------------------


class TierStatus(BaseModel):
    Tier: str = Field(..., examples=["Gold"])
    DiscountPercentage: int = Field(..., description="Taken off each bill at settlement")
    NextTier: Optional[str] = None
    PointsToNextTier: Optional[int] = None


class TierInfo(BaseModel):
    Name: str
    MinPoints: int
    DiscountPercentage: int


class CustomerMeResponse(BaseModel):
    CustomerId: int
    Name: str
    Phone: str
    Email: Optional[str] = None
    Address: Optional[str] = None
    MemberSince: datetime
    LoyaltyPoints: int
    PointsValue: MoneyTotal = Field(..., description="What the points are worth when redeemed (PKR)")
    TierStatus: TierStatus
    Tiers: List[TierInfo] = Field(..., description="All tiers, lowest first, for a progress bar")
    TotalOrders: int = Field(..., description="Completed orders")
    TotalSpent: MoneyTotal
    LastOrderDate: Optional[datetime] = None


class MyOrder(OrderResponse):
    TrackingStatus: str = Field(..., examples=["Being served at table T-04", "Completed & paid"])
    IsOpen: bool = Field(..., description="Still Pending (being prepared or served)")


class MyOrdersResponse(BaseModel):
    Total: int
    Skip: int
    Limit: int
    Items: List[MyOrder]


class Recommendation(BaseModel):
    MenuItemId: int
    Name: str
    CategoryName: str
    Price: Money
    Reason: str = Field(..., examples=["You've ordered this 3 times", "Popular in Desserts, which you like"])


class RecommendationsResponse(BaseModel):
    BasedOnOrders: int = Field(..., description="Completed orders used to learn preferences (0 = new customer)")
    FavouriteCategories: List[str]
    Items: List[Recommendation]
