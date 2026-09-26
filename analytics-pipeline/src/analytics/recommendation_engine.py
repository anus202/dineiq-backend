"""SECTION 4 — Recommendation Engine.

Turns the outputs of advanced_analytics.py and the menu_item_features table into a
ranked list of concrete, evidence-backed recommendations, each carrying:
  - a priority level (LOW / MEDIUM / HIGH / CRITICAL),
  - the specific metric(s) that justify it (Lift, Margin %, Elasticity, Wastage %),
  - a plain-English action.

No recommendation is generated without a numeric justification attached — this is what
distinguishes it from a generic "consider reviewing your menu" suggestion.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from config import settings  # noqa: E402
from src.analytics.advanced_analytics import (  # noqa: E402
    analyze_price_sensitivity,
    detect_promotion_traps,
    run_market_basket_analysis,
)

CLEAN_DIR = settings.PROCESSED_DATA_DIR / "clean_parquet"

PRIORITY_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}


@dataclass
class Recommendation:
    priority: str
    category: str
    title: str
    menu_item_id: int | None
    menu_item_name: str | None
    justification: str
    metrics: dict
    action: str


def _menu_features() -> pd.DataFrame:
    path = CLEAN_DIR / "menu_item_features"
    if not path.exists():
        raise FileNotFoundError(f"{path} not found — run spark_jobs/feature_engineering.py first.")
    return pd.read_parquet(path)


def _recommendations_from_dogs(df: pd.DataFrame) -> list[Recommendation]:
    recs = []
    dogs = df[df["MenuPerformanceClass"] == "Dog"].sort_values("TotalRevenue")
    for _, r in dogs.head(15).iterrows():
        margin_pct = float(r["MarginPercent"]) if pd.notna(r["MarginPercent"]) else 0.0
        priority = "HIGH" if margin_pct < 0 else "MEDIUM"
        recs.append(
            Recommendation(
                priority=priority,
                category="Menu Rationalization",
                title=f"Consider retiring or reworking '{r['MenuItemName']}'",
                menu_item_id=int(r["MenuItemId"]),
                menu_item_name=str(r["MenuItemName"]),
                justification=f"Low sales volume ({int(r['TotalQuantitySold'])} units) combined with {margin_pct:.1f}% margin classifies it as a 'Dog' in the menu-engineering matrix.",
                metrics={"margin_percent": margin_pct, "total_quantity_sold": int(r["TotalQuantitySold"]), "menu_class": "Dog"},
                action="Remove from the menu, or re-cost and reposition it before the next menu review.",
            )
        )
    return recs


def _recommendations_from_plow_horses(df: pd.DataFrame) -> list[Recommendation]:
    recs = []
    plow = df[df["MenuPerformanceClass"] == "PlowHorse"].sort_values("TotalQuantitySold", ascending=False)
    for _, r in plow.head(15).iterrows():
        margin_pct = float(r["MarginPercent"]) if pd.notna(r["MarginPercent"]) else 0.0
        priority = "HIGH" if margin_pct < 5 else "MEDIUM"
        recs.append(
            Recommendation(
                priority=priority,
                category="Margin Improvement",
                title=f"Re-price or re-cost '{r['MenuItemName']}'",
                menu_item_id=int(r["MenuItemId"]),
                menu_item_name=str(r["MenuItemName"]),
                justification=f"High volume ({int(r['TotalQuantitySold'])} units sold) but only {margin_pct:.1f}% margin — a 'Plow Horse' generating revenue without proportional profit.",
                metrics={"margin_percent": margin_pct, "total_quantity_sold": int(r["TotalQuantitySold"]), "menu_class": "PlowHorse"},
                action="Raise price modestly (see price-elasticity analysis) or reduce ingredient cost without harming perceived quality.",
            )
        )
    return recs


def _recommendations_from_wastage(df: pd.DataFrame) -> list[Recommendation]:
    recs = []
    high_waste = df[df["WastagePercent"] > 15].sort_values("WastagePercent", ascending=False)
    for _, r in high_waste.head(10).iterrows():
        waste_pct = float(r["WastagePercent"])
        priority = "CRITICAL" if waste_pct > 30 else "HIGH"
        recs.append(
            Recommendation(
                priority=priority,
                category="Wastage Reduction",
                title=f"Reduce prep quantity for '{r['MenuItemName']}'",
                menu_item_id=int(r["MenuItemId"]),
                menu_item_name=str(r["MenuItemName"]),
                justification=f"{waste_pct:.1f}% of prepared units are wasted, well above the 15% attention threshold.",
                metrics={"wastage_percent": waste_pct, "menu_class": str(r["MenuPerformanceClass"])},
                action="Lower daily prep batch size and/or move to made-to-order preparation for this item.",
            )
        )
    return recs


def _recommendations_from_promotion_traps() -> list[Recommendation]:
    traps = detect_promotion_traps()
    recs = []
    for t in traps[:15]:
        recs.append(
            Recommendation(
                priority=t.severity,
                category="Promotion Trap",
                title=f"Revisit promotion '{t.promotion_name}' on '{t.menu_item_name}'",
                menu_item_id=t.menu_item_id,
                menu_item_name=t.menu_item_name,
                justification=f"Volume rose {t.volume_lift_percent:.1f}% under this promotion, but margin fell to {t.margin_percent:.1f}% — the promotion is buying volume at the expense of profit.",
                metrics={"volume_lift_percent": t.volume_lift_percent, "margin_percent": t.margin_percent, "revenue_lift_percent": t.revenue_lift_percent},
                action="Reduce the discount depth or exclude this item from the promotion.",
            )
        )
    return recs


def _recommendations_from_basket_rules() -> list[Recommendation]:
    rules = run_market_basket_analysis()
    recs = []
    for rule in rules[:10]:
        antecedent_str = ", ".join(rule.antecedent)
        consequent_str = ", ".join(rule.consequent)
        priority = "MEDIUM" if rule.lift >= 2.0 else "LOW"
        recs.append(
            Recommendation(
                priority=priority,
                category="Cross-Sell Opportunity",
                title=f"Bundle '{antecedent_str}' with '{consequent_str}'",
                menu_item_id=None,
                menu_item_name=None,
                justification=f"Customers who buy {antecedent_str} buy {consequent_str} {rule.lift:.2f}x more often than chance (Lift={rule.lift:.2f}, Confidence={rule.confidence:.0%}, Support={rule.support:.1%}).",
                metrics={"lift": rule.lift, "confidence": rule.confidence, "support": rule.support},
                action="Create a combo deal or suggest this pairing at point-of-sale / online checkout.",
            )
        )
    return recs


def _recommendations_from_elasticity() -> list[Recommendation]:
    results = analyze_price_sensitivity()
    recs = []
    for r in results:
        if r.elasticity_label == "Price Inelastic" and r.price_quantity_correlation is not None:
            recs.append(
                Recommendation(
                    priority="LOW",
                    category="Pricing Opportunity",
                    title=f"Consider a price increase on '{r.menu_item_name}'",
                    menu_item_id=r.menu_item_id,
                    menu_item_name=r.menu_item_name,
                    justification=f"Price-quantity correlation of {r.price_quantity_correlation:.2f} indicates demand is largely insensitive to price in the observed range.",
                    metrics={"price_quantity_correlation": r.price_quantity_correlation, "elasticity_label": r.elasticity_label},
                    action="Test a 5-10% price increase and monitor volume for 4-6 weeks.",
                )
            )
    return recs[:10]


def generate_recommendations() -> list[Recommendation]:
    df = _menu_features()
    all_recs: list[Recommendation] = []
    all_recs += _recommendations_from_promotion_traps()
    all_recs += _recommendations_from_wastage(df)
    all_recs += _recommendations_from_dogs(df)
    all_recs += _recommendations_from_plow_horses(df)
    all_recs += _recommendations_from_basket_rules()
    all_recs += _recommendations_from_elasticity()
    all_recs.sort(key=lambda r: PRIORITY_ORDER.get(r.priority, 99))
    return all_recs


def recommendations_to_dicts(recs: list[Recommendation]) -> list[dict]:
    return [
        {
            "priority": r.priority,
            "category": r.category,
            "title": r.title,
            "menu_item_id": r.menu_item_id,
            "menu_item_name": r.menu_item_name,
            "justification": r.justification,
            "metrics": r.metrics,
            "action": r.action,
        }
        for r in recs
    ]
