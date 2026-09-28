from datetime import date
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.common import MoneyTotal
from app.schemas.order_schema import OrderResponse

class ChannelMixEntry(BaseModel):
    Channel: str
    OrderCount: int
    Revenue: MoneyTotal
    SharePercentage: Decimal

class ChannelMixResponse(BaseModel):
    BranchId: Optional[int]
    Channels: List[ChannelMixEntry]

class MenuQuadrantItem(BaseModel):
    MenuItemId: int
    MenuItemName: str
    CategoryName: str
    QuantitySold: int
    Revenue: MoneyTotal
    Margin: MoneyTotal
    MarginPercentage: Decimal
    Quadrant: str

class MenuQuadrantResponse(BaseModel):
    BranchId: Optional[int]
    MedianQuantity: Decimal
    MedianMarginPercentage: Decimal
    Items: List[MenuQuadrantItem]

class BusinessRecommendation(BaseModel):
    Title: str
    Priority: str
    Evidence: str
    SuggestedAction: str

class WastageByItem(BaseModel):
    InventoryItemId: int
    ItemName: str
    Unit: str
    TotalWasted: Decimal
    WastageCost: MoneyTotal
    IncidentCount: int

class WastageByReason(BaseModel):
    Reason: str
    TotalWasted: Decimal
    WastageCost: MoneyTotal
    IncidentCount: int

class WastageSummaryResponse(BaseModel):
    BranchId: Optional[int]
    TotalWastageCost: MoneyTotal
    ByItem: List[WastageByItem]
    ByReason: List[WastageByReason]

class DemandForecastHour(BaseModel):
    Hour: int
    AverageQuantityConsumed: Decimal

class StockingRecommendation(BaseModel):
    ItemName: str
    PeakHour: int
    RecommendedPrepQuantity: Decimal
    Unit: str
    Reasoning: str

class DemandModelAccuracy(BaseModel):
    mae: Optional[float] = None
    rmse: Optional[float] = None
    mape_percent: Optional[float] = None
    improvement_over_baseline_percent: Optional[float] = None

class DemandForecastResponse(BaseModel):
    BranchId: Optional[int]
    HourlyPattern: List[DemandForecastHour]
    PeakHour: Optional[int]
    Recommendations: List[StockingRecommendation]

    IsMLPowered: bool = False
    ModelAccuracy: Optional[DemandModelAccuracy] = None

    UsedSystemWideFallback: bool = False

class BranchComparisonRow(BaseModel):
    BranchId: int
    BranchName: str
    City: str
    IsActive: bool
    OrderCount: int
    Revenue: MoneyTotal
    Profit: MoneyTotal
    ProfitMarginPercentage: Decimal
    WastageCost: MoneyTotal
    AverageRating: Optional[float] = None
    CustomerCount: int

class BranchComparisonResponse(BaseModel):
    Period: dict
    Branches: List[BranchComparisonRow]

class SalesAnomaly(BaseModel):
    BranchId: int
    BranchName: str
    Date: date
    Revenue: MoneyTotal
    TrailingAverageRevenue: MoneyTotal
    DeviationPercentage: Decimal
    Type: str
    Severity: str

class AnomalyReportResponse(BaseModel):
    SalesAnomalies: List[SalesAnomaly]

class BranchSnapshotResponse(BaseModel):
    BranchId: Optional[int]
    BusinessDate: date
    SalesToday: MoneyTotal
    OrdersToday: int = Field(..., description="Orders placed today at this branch, excluding cancelled")
    CompletedOrdersToday: int
    PendingOrders: int = Field(..., description="This branch's orders still Pending, any date")
    RecentOrders: List[OrderResponse] = Field(..., description="This branch's 6 most recent orders, newest first")
    ActiveTables: int = Field(..., description="Tables OCCUPIED now, across the restaurant (tables aren't assigned to a single branch in this schema)")
    ReservedTables: int
    TotalTables: int
    LowStockItems: int = Field(
        ..., description="Inventory items at or below reorder level, across the restaurant (today's seeded stock is a shared pool, not split per branch)"
    )
    OutOfStockItems: int
    WastageCost30Days: MoneyTotal = Field(..., description="This branch's recorded wastage cost, last 30 days")
