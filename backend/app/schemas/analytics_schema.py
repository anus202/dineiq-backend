from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.common import MoneyTotal


class DateRange(BaseModel):
    StartDate: Optional[date] = None
    EndDate: Optional[date] = None
    TimeZoneOffsetMinutes: int = Field(..., description="Dates and hours are in this offset from UTC")


class OverviewResponse(BaseModel):
    Period: DateRange
    TotalOrders: int = Field(..., description="Completed orders")
    CancelledOrders: int
    PendingOrders: int
    GrossSales: MoneyTotal = Field(..., description="Sum of TotalAmount (before discounts)")
    TotalDiscount: MoneyTotal
    TotalRevenue: MoneyTotal = Field(..., description="Sum of NetAmount (after discounts)")
    CostOfGoodsSold: MoneyTotal = Field(..., description="Quantity x unit cost at order time (current menu cost if unknown)")
    NetProfit: MoneyTotal = Field(..., description="TotalRevenue - CostOfGoodsSold (food cost only)")
    ProfitMarginPercentage: MoneyTotal
    AverageOrderValue: MoneyTotal = Field(..., description="TotalRevenue / TotalOrders")
    TotalGuests: int
    AverageSpendPerGuest: MoneyTotal = Field(..., description="GrossSales / TotalGuests")


class HourlyBucket(BaseModel):
    Hour: int = Field(..., ge=0, le=23)
    Label: str = Field(..., examples=["13:00"])
    OrderCount: int
    Revenue: MoneyTotal
    Guests: int
    AverageOrderValue: MoneyTotal
    ShareOfOrdersPercentage: MoneyTotal


class PeakHoursResponse(BaseModel):
    Period: DateRange
    Hours: List[HourlyBucket] = Field(..., description="Always 24 entries, 00:00 to 23:00 local time")
    BusiestHour: Optional[HourlyBucket] = None
    LunchPeak: Optional[HourlyBucket] = Field(None, description="Busiest hour between 11:00 and 15:59")
    DinnerPeak: Optional[HourlyBucket] = Field(None, description="Busiest hour between 18:00 and 23:59")


class TopItem(BaseModel):
    Rank: int
    MenuItemId: int
    MenuItemName: str
    CategoryName: str
    QuantitySold: int
    Revenue: MoneyTotal = Field(..., description="Line totals before order-level discounts")
    OrdersContaining: int
    RevenueSharePercentage: MoneyTotal


class TopItemsResponse(BaseModel):
    Period: DateRange
    TopByQuantity: List[TopItem]
    TopByRevenue: List[TopItem]


class SegmentSummary(BaseModel):
    Segment: str
    Customers: int
    Revenue: MoneyTotal
    AverageRecencyDays: MoneyTotal
    AverageFrequency: MoneyTotal
    AverageMonetary: MoneyTotal
    ShareOfCustomersPercentage: MoneyTotal


class RFMSegmentationResponse(BaseModel):
    AsOf: datetime
    SegmentRules: dict[str, str] = Field(..., description="How each segment is defined (R, F, M scores are 1-5)")
    Segments: List[SegmentSummary]
    RegisteredCustomers: int = Field(..., description="Active customers in tbl_Customer")
    PurchasingCustomers: int = Field(..., description="Customers with at least one completed order")
    RepeatCustomers: int
    OneTimeCustomers: int
    RepeatPurchaseRatePercentage: MoneyTotal = Field(..., description="RepeatCustomers / PurchasingCustomers")
    RegisteredOrders: int
    RegisteredRevenue: MoneyTotal
    WalkInOrders: int = Field(..., description="Completed orders with no customer attached")
    WalkInRevenue: MoneyTotal
    WalkInShareOfOrdersPercentage: MoneyTotal


class CustomerRFMResponse(BaseModel):
    CustomerId: int
    CustomerName: str
    AsOf: datetime
    LastOrderDate: Optional[datetime] = None
    RecencyDays: Optional[int] = Field(None, description="Days since the last completed order")
    Frequency: int = Field(..., description="Completed orders")
    MonetaryValue: MoneyTotal = Field(..., description="Total NetAmount of completed orders")
    RScore: Optional[int] = Field(None, description="1-5, relative to all purchasing customers (5 = most recent)")
    FScore: Optional[int] = None
    MScore: Optional[int] = None
    RFMScore: Optional[str] = Field(None, examples=["545"])
    Segment: str
    LoyaltyPoints: int


class HeatmapCell(BaseModel):
    DayOfWeek: int = Field(..., ge=0, le=6, description="0 = Monday ... 6 = Sunday")
    DayName: str
    Hour: int = Field(..., ge=0, le=23)
    Orders: int
    Revenue: MoneyTotal


class HourlyHeatmapResponse(BaseModel):
    Period: DateRange
    Cells: List[HeatmapCell] = Field(..., description="Always 7 x 24 = 168 cells, zero-filled")
    MaxOrders: int
    BusiestSlot: Optional[HeatmapCell] = None


class RFMMatrixCell(BaseModel):
    RScore: int
    Score: int = Field(..., description="F score (FrequencyMatrix) or M score (MonetaryMatrix)")
    Customers: int
    AverageMonetary: MoneyTotal


class RFMMatrixResponse(BaseModel):
    AsOf: datetime
    PurchasingCustomers: int
    FrequencyMatrix: List[RFMMatrixCell] = Field(..., description="Recency score x Frequency score, 25 cells")
    MonetaryMatrix: List[RFMMatrixCell] = Field(..., description="Recency score x Monetary score, 25 cells")
