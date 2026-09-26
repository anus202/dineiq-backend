from typing import List, Optional

from pydantic import BaseModel


class MarketBasketRule(BaseModel):
    antecedent: List[str]
    consequent: List[str]
    support: float
    confidence: float
    lift: float


class PriceSensitivityItem(BaseModel):
    menu_item_id: int
    menu_item_name: str
    price_quantity_correlation: Optional[float]
    elasticity_label: str
    interpretation: str


class PromotionTrapItem(BaseModel):
    promotion_id: int
    promotion_name: str
    menu_item_id: int
    menu_item_name: str
    revenue_lift_percent: float
    margin_percent: float
    volume_lift_percent: float
    severity: str


class MLRecommendation(BaseModel):
    priority: str
    category: str
    title: str
    menu_item_id: Optional[int]
    menu_item_name: Optional[str]
    justification: str
    metrics: dict
    action: str


class ChurnRiskCustomer(BaseModel):
    CustomerId: int
    Name: str
    RecencyDays: int
    Frequency: int
    Monetary: float
    AvgOrderValue: float
    TenureDays: int
    ChurnProbability: float
    RiskLabel: str


class ChurnRiskResponse(BaseModel):
    ScoredCustomers: int
    Customers: List[ChurnRiskCustomer]


class WhatIfRequest(BaseModel):
    menu_item_id: int
    price_change_percent: float = 0.0
    discount_percent: float = 0.0
    remove_item: bool = False
    prep_quantity_change_percent: float = 0.0
    wastage_assumption_change_percent: float = 0.0


class WhatIfResponse(BaseModel):
    menu_item_id: int
    menu_item_name: str
    price_change_percent: float
    discount_percent: float
    remove_item: bool
    prep_quantity_change_percent: float
    wastage_assumption_change_percent: float
    elasticity_coefficient: float
    current_price: float
    projected_price: float
    current_quantity: float
    projected_quantity: float
    current_revenue: float
    projected_revenue: float
    current_profit: float
    projected_profit: float
    current_margin_percent: float
    projected_margin_percent: float
    revenue_delta_percent: float
    profit_delta_percent: float
    volume_delta_percent: float


class RatingAnomalyItem(BaseModel):
    menu_item_id: int
    menu_item_name: str
    date: str
    anomaly_type: str
    rating_count: int
    average_score: float
    trailing_average_score: float
    reason: str


class SlowMovingDish(BaseModel):
    menu_item_id: int
    menu_item_name: str
    total_quantity_sold: int
    order_count: int
    recency_days: int
    margin_percent: float
    recent_30d_quantity: int
    prior_30d_quantity: int
    signal_count: int
    signals: List[str]


class WastageRiskItem(BaseModel):
    MenuItemId: int
    MenuItemName: str
    PredictedWastagePercent: float
    RiskLabel: str
    TotalQuantitySold: float
    AvgRating: float


class DemandForecastItem(BaseModel):
    MenuItemId: int
    MenuItemName: str
    CurrentMonthQuantity: float
    PredictedNextMonthQuantity: float
