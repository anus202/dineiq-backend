"""SECTION 4 — What-If Simulator.

Given a menu item and a proposed price-change percent and/or discount percent, projects
revenue/profit/volume impact using that item's own historical price-elasticity
(PriceQuantityCorrelation, computed in feature_engineering.py) as the demand-response
model, rather than assuming every item responds identically to a price change.

Elasticity model: a Pearson correlation coefficient r (between -1 and 1) is converted to
an approximate elasticity coefficient e = r * 2.0 (capping the maximum assumed elasticity
at +/-2.0, a standard "highly elastic" ceiling for restaurant menu items), then:

    projected_quantity = current_quantity * (1 + e * price_change_percent / 100)

This is a deliberately transparent, explainable linear approximation (not a black-box
model) so a Restaurant Manager or Analyst can sanity-check the assumption; the elasticity
coefficient used for a given item is always returned alongside the projection.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from config import settings  # noqa: E402

CLEAN_DIR = settings.PROCESSED_DATA_DIR / "clean_parquet"
MAX_ASSUMED_ELASTICITY = 2.0
DEFAULT_ELASTICITY_WHEN_UNKNOWN = -0.3  # mild inelasticity assumed absent evidence


@dataclass
class WhatIfResult:
    menu_item_id: int
    menu_item_name: str
    price_change_percent: float
    discount_percent: float
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


class WhatIfSimulator:
    def __init__(self):
        path = CLEAN_DIR / "menu_item_features"
        if not path.exists():
            raise FileNotFoundError(f"{path} not found — run spark_jobs/feature_engineering.py first.")
        self.features = pd.read_parquet(path)

    def _get_item(self, menu_item_id: int) -> pd.Series:
        rows = self.features[self.features["MenuItemId"] == menu_item_id]
        if rows.empty:
            raise ValueError(f"MenuItemId {menu_item_id} not found in menu_item_features.")
        return rows.iloc[0]

    def simulate(
        self,
        menu_item_id: int,
        price_change_percent: float = 0.0,
        discount_percent: float = 0.0,
    ) -> WhatIfResult:
        item = self._get_item(menu_item_id)

        corr = item.get("PriceQuantityCorrelation")
        if pd.isna(corr):
            elasticity = DEFAULT_ELASTICITY_WHEN_UNKNOWN
        else:
            elasticity = max(-MAX_ASSUMED_ELASTICITY, min(MAX_ASSUMED_ELASTICITY, float(corr) * MAX_ASSUMED_ELASTICITY))

        current_price = float(item.get("CatalogPrice") or item.get("AvgSellingPrice"))
        current_quantity = float(item["TotalQuantitySold"])
        current_revenue = float(item["TotalRevenue"])
        current_margin_pct = float(item["MarginPercent"]) if pd.notna(item["MarginPercent"]) else 0.0
        avg_unit_cost = current_price - (current_price * current_margin_pct / 100)

        net_price_change_percent = price_change_percent - discount_percent
        projected_price = round(current_price * (1 + net_price_change_percent / 100), 2)
        projected_quantity = max(0.0, current_quantity * (1 + elasticity * net_price_change_percent / 100))

        projected_revenue = round(projected_price * projected_quantity, 2)
        projected_unit_margin = projected_price - avg_unit_cost
        projected_profit = round(projected_unit_margin * projected_quantity, 2)
        projected_margin_pct = round((projected_unit_margin / projected_price * 100) if projected_price > 0 else 0.0, 2)

        current_profit = round((current_price - avg_unit_cost) * current_quantity, 2)

        def pct_delta(new: float, old: float) -> float:
            if old == 0:
                return 0.0
            return round((new - old) / abs(old) * 100, 2)

        return WhatIfResult(
            menu_item_id=int(item["MenuItemId"]),
            menu_item_name=str(item["MenuItemName"]),
            price_change_percent=price_change_percent,
            discount_percent=discount_percent,
            elasticity_coefficient=round(elasticity, 3),
            current_price=round(current_price, 2),
            projected_price=projected_price,
            current_quantity=round(current_quantity, 1),
            projected_quantity=round(projected_quantity, 1),
            current_revenue=round(current_revenue, 2),
            projected_revenue=projected_revenue,
            current_profit=current_profit,
            projected_profit=projected_profit,
            current_margin_percent=round(current_margin_pct, 2),
            projected_margin_percent=projected_margin_pct,
            revenue_delta_percent=pct_delta(projected_revenue, current_revenue),
            profit_delta_percent=pct_delta(projected_profit, current_profit),
            volume_delta_percent=pct_delta(projected_quantity, current_quantity),
        )


def what_if_result_to_dict(result: WhatIfResult) -> dict:
    return result.__dict__
