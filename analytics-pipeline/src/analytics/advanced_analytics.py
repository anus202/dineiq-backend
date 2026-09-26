"""SECTION 4 — Advanced Analytics: Market-Basket Analysis, Promotion Trap Detection,
Price Sensitivity / Elasticity.

Reads directly from processed_data/clean_parquet/ (the cleaned fact table + features
from spark_jobs/) with pandas — this module is analytical/statistical, not ML-model
based, so it doesn't need Spark or XGBoost at request time; it needs to be fast enough
to serve a dashboard endpoint on demand.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pandas as pd
from mlxtend.frequent_patterns import apriori, association_rules
from mlxtend.preprocessing import TransactionEncoder

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from config import settings  # noqa: E402

CLEAN_DIR = settings.PROCESSED_DATA_DIR / "clean_parquet"

MIN_SUPPORT = 0.01
MIN_CONFIDENCE = 0.20
MIN_LIFT = 1.0


@dataclass
class BasketRule:
    antecedent: list[str]
    consequent: list[str]
    support: float
    confidence: float
    lift: float


@dataclass
class PromotionTrap:
    promotion_id: int
    promotion_name: str
    menu_item_id: int
    menu_item_name: str
    revenue_lift_percent: float
    margin_percent: float
    volume_lift_percent: float
    severity: str


@dataclass
class PriceSensitivityResult:
    menu_item_id: int
    menu_item_name: str
    price_quantity_correlation: Optional[float]
    elasticity_label: str
    interpretation: str


def _load_fact_sales() -> pd.DataFrame:
    path = CLEAN_DIR / "fact_sales"
    if not path.exists():
        raise FileNotFoundError(f"{path} not found — run spark_jobs/ingest_and_clean.py first.")
    return pd.read_parquet(path)


def run_market_basket_analysis(max_baskets: int = 60_000, min_support: float = MIN_SUPPORT) -> list[BasketRule]:
    """Support / Confidence / Lift over co-purchased menu items within the same order."""
    fact_sales = _load_fact_sales()
    baskets = fact_sales.groupby("OrderId")["MenuItemName"].apply(lambda s: sorted(set(s))).reset_index(drop=True)
    baskets = baskets[baskets.apply(len) >= 2]
    if len(baskets) > max_baskets:
        baskets = baskets.sample(n=max_baskets, random_state=settings.RANDOM_SEED)
    if baskets.empty:
        return []

    encoder = TransactionEncoder()
    encoded = encoder.fit(baskets.tolist()).transform(baskets.tolist())
    basket_df = pd.DataFrame(encoded, columns=encoder.columns_)

    frequent_itemsets = apriori(basket_df, min_support=min_support, use_colnames=True, max_len=3)
    if frequent_itemsets.empty:
        return []
    rules = association_rules(frequent_itemsets, metric="confidence", min_threshold=MIN_CONFIDENCE)
    rules = rules[rules["lift"] >= MIN_LIFT].sort_values("lift", ascending=False)

    return [
        BasketRule(
            antecedent=sorted(r["antecedents"]),
            consequent=sorted(r["consequents"]),
            support=round(float(r["support"]), 4),
            confidence=round(float(r["confidence"]), 4),
            lift=round(float(r["lift"]), 4),
        )
        for _, r in rules.head(50).iterrows()
    ]


def detect_promotion_traps() -> list[PromotionTrap]:
    """Items whose sales rose under a promotion while margin collapsed — the SRS's
    "promotion trap" pattern: a promotion that looks successful on revenue/volume alone
    but is quietly destroying profitability.
    """
    fact_sales = _load_fact_sales()
    promoted = fact_sales[fact_sales["PromotionId"].notna()]
    if promoted.empty:
        return []

    baseline = (
        fact_sales[fact_sales["PromotionId"].isna()]
        .groupby("MenuItemId")
        .agg(BaselineRevenue=("LineTotal", "sum"), BaselineQty=("Quantity", "sum"), BaselineMargin=("LineMargin", "sum"))
    )
    promo_agg = (
        promoted.groupby(["PromotionId", "PromotionName", "MenuItemId", "MenuItemName"])
        .agg(PromoRevenue=("LineTotal", "sum"), PromoQty=("Quantity", "sum"), PromoMargin=("LineMargin", "sum"), IsTrapFlag=("IsTrapPromotion", "max"))
        .reset_index()
    )
    merged = promo_agg.merge(baseline, on="MenuItemId", how="left").fillna(
        {"BaselineRevenue": 0.0, "BaselineQty": 0.0, "BaselineMargin": 0.0}
    )
    merged["RevenueLiftPercent"] = merged.apply(
        lambda r: round(((r["PromoRevenue"] - r["BaselineRevenue"]) / r["BaselineRevenue"] * 100) if r["BaselineRevenue"] > 0 else 100.0, 2), axis=1
    )
    merged["VolumeLiftPercent"] = merged.apply(
        lambda r: round(((r["PromoQty"] - r["BaselineQty"]) / r["BaselineQty"] * 100) if r["BaselineQty"] > 0 else 100.0, 2), axis=1
    )
    merged["PromoMarginPercent"] = round(merged["PromoMargin"] / merged["PromoRevenue"].replace(0, pd.NA) * 100, 2)

    traps = merged[(merged["VolumeLiftPercent"] > 0) & ((merged["PromoMarginPercent"] < 10) | (merged["IsTrapFlag"] == True))]  # noqa: E712

    results = []
    for _, r in traps.sort_values("PromoMarginPercent").iterrows():
        margin_pct = float(r["PromoMarginPercent"]) if pd.notna(r["PromoMarginPercent"]) else 0.0
        severity = "CRITICAL" if margin_pct < 0 else "HIGH" if margin_pct < 5 else "MEDIUM"
        results.append(
            PromotionTrap(
                promotion_id=int(r["PromotionId"]),
                promotion_name=str(r["PromotionName"]),
                menu_item_id=int(r["MenuItemId"]),
                menu_item_name=str(r["MenuItemName"]),
                revenue_lift_percent=float(r["RevenueLiftPercent"]),
                margin_percent=margin_pct,
                volume_lift_percent=float(r["VolumeLiftPercent"]),
                severity=severity,
            )
        )
    return results


def analyze_price_sensitivity() -> list[PriceSensitivityResult]:
    """Classifies each menu item's demand elasticity from the PriceQuantityCorrelation
    feature already computed in feature_engineering.py (Pearson correlation between
    monthly average price and monthly quantity sold).
    """
    features_path = CLEAN_DIR / "menu_item_features"
    if not features_path.exists():
        raise FileNotFoundError(f"{features_path} not found — run spark_jobs/feature_engineering.py first.")
    df = pd.read_parquet(features_path)

    results = []
    for _, r in df.iterrows():
        corr = r.get("PriceQuantityCorrelation")
        corr = float(corr) if pd.notna(corr) else None
        if corr is None:
            label, interpretation = "Unknown", "Insufficient price variation to estimate elasticity."
        elif corr <= -0.5:
            label, interpretation = "Highly Elastic", "Demand drops sharply as price rises — a strong candidate for careful, targeted discounting rather than list-price increases."
        elif corr <= -0.15:
            label, interpretation = "Moderately Elastic", "Demand is price-sensitive; moderate price increases risk a meaningful volume drop."
        elif corr < 0.15:
            label, interpretation = "Price Inelastic", "Demand is largely insensitive to price changes in the observed range — a reasonable candidate for a price increase."
        else:
            label, interpretation = "Positively Correlated (anomalous)", "Quantity rose alongside price, likely reflecting demand-driven price increases rather than true inelasticity — investigate before acting."
        results.append(
            PriceSensitivityResult(
                menu_item_id=int(r["MenuItemId"]),
                menu_item_name=str(r["MenuItemName"]),
                price_quantity_correlation=corr,
                elasticity_label=label,
                interpretation=interpretation,
            )
        )
    return results


def basket_rules_to_dicts(rules: list[BasketRule]) -> list[dict]:
    return [r.__dict__ for r in rules]


def promotion_traps_to_dicts(traps: list[PromotionTrap]) -> list[dict]:
    return [t.__dict__ for t in traps]


def price_sensitivity_to_dicts(results: list[PriceSensitivityResult]) -> list[dict]:
    return [r.__dict__ for r in results]
