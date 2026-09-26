from datetime import date
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel

from app.schemas.common import MoneyTotal


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
    Quadrant: str  # Profit Driver | Volume Driver | Hidden Opportunity | Low Performer


class MenuQuadrantResponse(BaseModel):
    BranchId: Optional[int]
    MedianQuantity: Decimal
    MedianMarginPercentage: Decimal
    Items: List[MenuQuadrantItem]


class BusinessRecommendation(BaseModel):
    Title: str
    Priority: str  # LOW | MEDIUM | HIGH | CRITICAL
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


class DemandForecastResponse(BaseModel):
    BranchId: Optional[int]
    HourlyPattern: List[DemandForecastHour]
    PeakHour: Optional[int]
    Recommendations: List[StockingRecommendation]


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
    Type: str  # SPIKE | DROP
    Severity: str  # MEDIUM | HIGH | CRITICAL


class AnomalyReportResponse(BaseModel):
    SalesAnomalies: List[SalesAnomaly]
