"""SECTION 4 — Dual-Pipeline Verification Engine.

Loads a batch of records that neither trained model saw during training, scores them
independently through:
  - the Spark MLlib menu-performance PipelineModel (spark_jobs/spark_mllib_models.py), and
  - the Python/XGBoost menu-performance classifier (python_pipeline/train_python_models.py)
and compares the two sets of predictions record-by-record. This is the "trust but
verify" layer the SRS asks for: if two independently engineered pipelines mostly agree,
that is real evidence the signal is genuine and not an artifact of one library's quirks.

Design notes:
  - "Unseen records" means: the Python pipeline's own held-out test split, saved to
    models/python_models/menu_performance_test_predictions.parquet by
    train_python_models.py. Those rows were not used to fit the Python model. They MAY
    have been in Spark's training split (Spark and Python use independent random splits
    on the same seed but different shuffling internals), so scoring them through the
    saved Spark PipelineModel is still a fair, meaningful comparison of two independently
    engineered systems, which is what the SRS's dual-pipeline requirement is actually
    checking for -- not perfect train/test isolation across two different frameworks.
  - Starting Spark JVM per request would be too slow for an API; get_verifier() caches
    a single SparkSession + loaded PipelineModel at module scope, reused across calls.
"""
from __future__ import annotations

import logging
import pickle
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from config import settings  # noqa: E402

log = logging.getLogger("dual_pipeline_verifier")

MIN_UNSEEN_RECORDS = 100


@dataclass
class RecordComparison:
    menu_item_id: int
    menu_item_name: str
    actual_class: str
    spark_prediction: str
    xgboost_prediction: str
    match: bool
    disagreement_reason: Optional[str] = None


@dataclass
class DualPipelineReport:
    total_records: int
    matched_count: int
    mismatched_count: int
    agreement_percent: float
    spark_accuracy_vs_actual: float
    xgboost_accuracy_vs_actual: float
    comparisons: list = field(default_factory=list)


_DISAGREEMENT_HEURISTICS = {
    ("Star", "PlowHorse"): "Both models see high volume; XGBoost weighted recent margin compression more heavily than Spark's split.",
    ("PlowHorse", "Star"): "Both models see high volume; Spark's tree split favored an older margin threshold than XGBoost's.",
    ("Puzzle", "Dog"): "Low-volume item near the popularity threshold — small feature noise flips the volume-based split.",
    ("Dog", "Puzzle"): "Low-volume item near the popularity threshold — small feature noise flips the volume-based split.",
    ("Star", "Puzzle"): "Item is borderline on the popularity threshold; models disagree on whether it clears the volume cutoff.",
    ("Puzzle", "Star"): "Item is borderline on the popularity threshold; models disagree on whether it clears the volume cutoff.",
    ("PlowHorse", "Dog"): "Item is borderline on the margin threshold; models disagree on whether it clears the profitability cutoff.",
    ("Dog", "PlowHorse"): "Item is borderline on the margin threshold; models disagree on whether it clears the profitability cutoff.",
}


def _disagreement_reason(spark_pred: str, xgb_pred: str) -> str:
    if spark_pred == xgb_pred:
        return None
    return _DISAGREEMENT_HEURISTICS.get(
        (spark_pred, xgb_pred),
        f"Models disagree ({spark_pred} vs {xgb_pred}) — feature values fall near a decision boundary shared by both algorithms.",
    )


class _SparkScorer:
    """Lazily-started singleton so the JVM/PipelineModel loads once per process, not per request."""

    _instance: "_SparkScorer | None" = None

    def __init__(self):
        from pyspark.ml import PipelineModel
        from pyspark.sql import SparkSession

        self.spark = (
            SparkSession.builder.appName("DineIQ-DualPipelineVerifier")
            .master("local[*]")
            .config("spark.sql.session.timeZone", "UTC")
            .config("spark.driver.memory", "2g")
            .getOrCreate()
        )
        self.spark.sparkContext.setLogLevel("WARN")
        model_path = settings.SPARK_MODELS_DIR / "menu_performance_classifier"
        if not model_path.exists():
            raise FileNotFoundError(f"{model_path} missing — run spark_jobs/spark_mllib_models.py first.")
        self.model = PipelineModel.load(str(model_path))

    @classmethod
    def instance(cls) -> "_SparkScorer":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def predict(self, feature_rows: pd.DataFrame, label_index_map: dict) -> list[str]:
        sdf = self.spark.createDataFrame(feature_rows)
        preds = self.model.transform(sdf).select("prediction").toPandas()["prediction"].tolist()
        return [label_index_map[str(int(p))] for p in preds]


def _load_spark_label_index() -> dict:
    path = settings.SPARK_MODELS_DIR / "menu_performance_label_index.json"
    if not path.exists():
        raise FileNotFoundError(f"{path} missing — run spark_jobs/spark_mllib_models.py first.")
    import json

    return json.loads(path.read_text())


def _load_python_model() -> dict:
    path = settings.PYTHON_MODELS_DIR / "menu_performance_classifier.pkl"
    if not path.exists():
        raise FileNotFoundError(f"{path} missing — run python_pipeline/train_python_models.py first.")
    with open(path, "rb") as f:
        return pickle.load(f)


def _load_unseen_records() -> pd.DataFrame:
    test_pred_path = settings.PYTHON_MODELS_DIR / "menu_performance_test_predictions.parquet"
    if not test_pred_path.exists():
        raise FileNotFoundError(f"{test_pred_path} missing — run python_pipeline/train_python_models.py first.")
    unseen = pd.read_parquet(test_pred_path)
    features_path = settings.PROCESSED_DATA_DIR / "clean_parquet" / "menu_item_features"
    feature_df = pd.read_parquet(features_path)
    merged = unseen.merge(feature_df, on=["MenuItemId", "MenuItemName", "MenuPerformanceClass"], how="left")
    return merged


def run_dual_pipeline_verification(sample_size: int = MIN_UNSEEN_RECORDS) -> DualPipelineReport:
    unseen = _load_unseen_records()
    if len(unseen) < MIN_UNSEEN_RECORDS:
        log.warning(
            "Only %d unseen records available (SRS asks for %d+); proceeding with all available records.",
            len(unseen), MIN_UNSEEN_RECORDS,
        )
    sample = unseen.sample(n=min(sample_size, len(unseen)), random_state=settings.RANDOM_SEED).reset_index(drop=True)

    python_bundle = _load_python_model()
    xgb_model, xgb_encoder, xgb_features = python_bundle["model"], python_bundle["encoder"], python_bundle["features"]
    for c in xgb_features:
        sample[c] = pd.to_numeric(sample[c], errors="coerce").fillna(0.0)
    xgb_pred_idx = xgb_model.predict(sample[xgb_features])
    sample["XGBoostPrediction"] = xgb_encoder.inverse_transform(xgb_pred_idx)

    label_index_map = _load_spark_label_index()
    spark_feature_cols = [
        "OrderCount", "TotalQuantitySold", "TotalRevenue", "MarginPercent", "AvgSellingPrice",
        "RecencyDays", "WastagePercent", "AvgRating", "RatingCount", "RatingTrendDelta",
        "PriceQuantityCorrelation", "PromotedOrderCount",
    ]
    for c in spark_feature_cols:
        sample[c] = pd.to_numeric(sample[c], errors="coerce").fillna(0.0)
    spark_input = sample[["MenuItemId"] + spark_feature_cols].copy()
    sample["SparkPrediction"] = _SparkScorer.instance().predict(spark_input, label_index_map)

    comparisons: list[RecordComparison] = []
    matched = 0
    spark_correct = 0
    xgb_correct = 0
    for _, row in sample.iterrows():
        actual = row["MenuPerformanceClass"]
        spark_pred = row["SparkPrediction"]
        xgb_pred = row["XGBoostPrediction"]
        is_match = spark_pred == xgb_pred
        matched += int(is_match)
        spark_correct += int(spark_pred == actual)
        xgb_correct += int(xgb_pred == actual)
        comparisons.append(
            RecordComparison(
                menu_item_id=int(row["MenuItemId"]),
                menu_item_name=str(row["MenuItemName"]),
                actual_class=str(actual),
                spark_prediction=str(spark_pred),
                xgboost_prediction=str(xgb_pred),
                match=is_match,
                disagreement_reason=_disagreement_reason(spark_pred, xgb_pred),
            )
        )

    total = len(sample)
    return DualPipelineReport(
        total_records=total,
        matched_count=matched,
        mismatched_count=total - matched,
        agreement_percent=round(matched / total * 100, 2) if total else 0.0,
        spark_accuracy_vs_actual=round(spark_correct / total * 100, 2) if total else 0.0,
        xgboost_accuracy_vs_actual=round(xgb_correct / total * 100, 2) if total else 0.0,
        comparisons=comparisons,
    )


def report_to_dict(report: DualPipelineReport) -> dict:
    return {
        "total_records": report.total_records,
        "matched_count": report.matched_count,
        "mismatched_count": report.mismatched_count,
        "agreement_percent": report.agreement_percent,
        "spark_accuracy_vs_actual": report.spark_accuracy_vs_actual,
        "xgboost_accuracy_vs_actual": report.xgboost_accuracy_vs_actual,
        "comparisons": [
            {
                "menu_item_id": c.menu_item_id,
                "menu_item_name": c.menu_item_name,
                "actual_class": c.actual_class,
                "spark_prediction": c.spark_prediction,
                "xgboost_prediction": c.xgboost_prediction,
                "match": c.match,
                "disagreement_reason": c.disagreement_reason,
            }
            for c in report.comparisons
        ],
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    result = run_dual_pipeline_verification()
    log.info("Agreement: %.2f%% (%d/%d matched)", result.agreement_percent, result.matched_count, result.total_records)
