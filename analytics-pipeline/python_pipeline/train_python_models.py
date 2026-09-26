"""SECTION 3 — Independent Pandas / Scikit-learn / XGBoost pipeline.

Deliberately does NOT import anything from spark_jobs/: it re-reads the same clean
Parquet feature tables with pandas/pyarrow and re-implements its own train/test split,
its own encoders, and its own models — an intentionally independent second opinion on
the same features, which is what src/analytics/dual_pipeline_verifier.py (Section 4)
needs in order for its "do Spark and Python actually agree?" comparison to mean anything.

Trains:
  1. Menu Performance classifier (XGBoost multiclass) — same MenuPerformanceClass target
     as the Spark job, same MENU_CLASSIFIER_FEATURES, but XGBoost's own encoder/booster.
  2. Demand forecasting regressor (XGBoost regressor) — same target/features as the Spark
     GBTRegressor.
  3. Customer churn-risk classifier (XGBoost binary) — new: not built on the Spark side,
     since Section 2 only asked for menu classification + demand forecasting there;
     Section 3 additionally covers churn + wastage per this pipeline's own remit.
  4. Wastage prediction regressor (XGBoost regressor) — predicts a menu item's
     WastagePercent from its sales/rating features, flagging high-waste items early.

Metrics (Accuracy/Precision/Recall/Macro-F1 for classifiers, MAE/RMSE/MAPE for
regressors) are written to reports/python_model_metrics.json, and every fitted model +
its label encoder + its feature column order are pickled to models/python_models/ so
Section 4's dual_pipeline_verifier.py and Section 4/5's recommendation/what-if code can
load them directly.

Usage:
    .venv-bigdata\\Scripts\\python -m python_pipeline.train_python_models
"""
from __future__ import annotations

import json
import logging
import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    mean_absolute_error,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from xgboost import XGBClassifier, XGBRegressor

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import settings  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s  %(message)s")
log = logging.getLogger("train_python_models")

CLEAN_DIR = settings.PROCESSED_DATA_DIR / "clean_parquet"

MENU_CLASSIFIER_FEATURES = [
    "OrderCount", "TotalQuantitySold", "TotalRevenue", "MarginPercent", "AvgSellingPrice",
    "RecencyDays", "WastagePercent", "AvgRating", "RatingCount", "RatingTrendDelta",
    "PriceQuantityCorrelation", "PromotedOrderCount",
]
DEMAND_REGRESSOR_FEATURES = [
    "TotalRevenue", "MarginPercent", "AvgSellingPrice", "AvgRating", "RatingCount",
    "WastagePercent", "PromotedOrderCount", "RecencyDays",
]
WASTAGE_REGRESSOR_FEATURES = [
    "TotalQuantitySold", "TotalRevenue", "MarginPercent", "AvgSellingPrice", "AvgRating",
    "RatingCount", "PromotedOrderCount",
]
CHURN_CLASSIFIER_FEATURES = [
    "RecencyDays", "Frequency", "Monetary", "AvgOrderValue", "TenureDays",
]


def read_parquet_dir(name: str) -> pd.DataFrame:
    path = CLEAN_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"{path} not found — run spark_jobs/feature_engineering.py first.")
    return pd.read_parquet(path)


def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    denom = np.where(y_true == 0, 1.0, y_true)
    return float(np.mean(np.abs((y_true - y_pred) / denom)) * 100)


def train_menu_classifier(menu_df: pd.DataFrame) -> dict:
    df = menu_df.copy()
    for c in MENU_CLASSIFIER_FEATURES:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)

    encoder = LabelEncoder()
    y = encoder.fit_transform(df["MenuPerformanceClass"])
    X = df[MENU_CLASSIFIER_FEATURES]

    X_train, X_test, y_train, y_test, idx_train, idx_test = train_test_split(
        X, y, df.index, test_size=0.2, random_state=settings.RANDOM_SEED, stratify=y
    )

    model = XGBClassifier(
        n_estimators=300, max_depth=6, learning_rate=0.08, subsample=0.85,
        colsample_bytree=0.85, objective="multi:softprob", num_class=len(encoder.classes_),
        eval_metric="mlogloss", random_state=settings.RANDOM_SEED, n_jobs=-1,
    )
    model.fit(X_train, y_train)
    preds = model.predict(X_test)

    metrics = {
        "accuracy": accuracy_score(y_test, preds),
        "weighted_precision": precision_score(y_test, preds, average="weighted", zero_division=0),
        "weighted_recall": recall_score(y_test, preds, average="weighted", zero_division=0),
        "macro_f1": f1_score(y_test, preds, average="macro", zero_division=0),
        "train_rows": len(X_train),
        "test_rows": len(X_test),
        "feature_columns": MENU_CLASSIFIER_FEATURES,
        "label_classes": list(encoder.classes_),
    }

    settings.PYTHON_MODELS_DIR.mkdir(parents=True, exist_ok=True)
    with open(settings.PYTHON_MODELS_DIR / "menu_performance_classifier.pkl", "wb") as f:
        pickle.dump({"model": model, "encoder": encoder, "features": MENU_CLASSIFIER_FEATURES}, f)

    # Full test-set predictions (including MenuItemId) saved for the dual-pipeline verifier.
    test_predictions = df.loc[idx_test, ["MenuItemId", "MenuItemName", "MenuPerformanceClass"]].copy()
    test_predictions["PythonPredictedClass"] = encoder.inverse_transform(preds)
    test_predictions.to_parquet(settings.PYTHON_MODELS_DIR / "menu_performance_test_predictions.parquet", index=False)

    return metrics


def train_demand_regressor(menu_df: pd.DataFrame) -> dict:
    df = menu_df.copy()
    for c in DEMAND_REGRESSOR_FEATURES + ["TotalQuantitySold"]:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)

    X = df[DEMAND_REGRESSOR_FEATURES]
    y = df["TotalQuantitySold"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=settings.RANDOM_SEED)

    model = XGBRegressor(
        n_estimators=400, max_depth=6, learning_rate=0.06, subsample=0.85,
        colsample_bytree=0.85, objective="reg:squarederror", random_state=settings.RANDOM_SEED, n_jobs=-1,
    )
    model.fit(X_train, y_train)
    preds = model.predict(X_test)

    metrics = {
        "mae": mean_absolute_error(y_test, preds),
        "rmse": float(np.sqrt(np.mean((y_test.values - preds) ** 2))),
        "mape_percent": mape(y_test.values, preds),
        "train_rows": len(X_train),
        "test_rows": len(X_test),
        "feature_columns": DEMAND_REGRESSOR_FEATURES,
    }
    with open(settings.PYTHON_MODELS_DIR / "demand_forecast_regressor.pkl", "wb") as f:
        pickle.dump({"model": model, "features": DEMAND_REGRESSOR_FEATURES}, f)
    return metrics


def train_wastage_regressor(menu_df: pd.DataFrame) -> dict:
    df = menu_df.copy()
    for c in WASTAGE_REGRESSOR_FEATURES + ["WastagePercent"]:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)

    X = df[WASTAGE_REGRESSOR_FEATURES]
    y = df["WastagePercent"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=settings.RANDOM_SEED)

    model = XGBRegressor(
        n_estimators=250, max_depth=5, learning_rate=0.08, subsample=0.85,
        colsample_bytree=0.85, objective="reg:squarederror", random_state=settings.RANDOM_SEED, n_jobs=-1,
    )
    model.fit(X_train, y_train)
    preds = model.predict(X_test)

    metrics = {
        "mae": mean_absolute_error(y_test, preds),
        "rmse": float(np.sqrt(np.mean((y_test.values - preds) ** 2))),
        "mape_percent": mape(y_test.values, preds),
        "train_rows": len(X_train),
        "test_rows": len(X_test),
        "feature_columns": WASTAGE_REGRESSOR_FEATURES,
    }
    with open(settings.PYTHON_MODELS_DIR / "wastage_predictor.pkl", "wb") as f:
        pickle.dump({"model": model, "features": WASTAGE_REGRESSOR_FEATURES}, f)
    return metrics


def train_churn_classifier(customer_df: pd.DataFrame) -> dict:
    df = customer_df.copy()
    for c in CHURN_CLASSIFIER_FEATURES:
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0)
    df["ChurnRisk"] = pd.to_numeric(df["ChurnRisk"], errors="coerce").fillna(0).astype(int)

    X = df[CHURN_CLASSIFIER_FEATURES]
    y = df["ChurnRisk"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=settings.RANDOM_SEED, stratify=y if y.nunique() > 1 else None
    )

    model = XGBClassifier(
        n_estimators=250, max_depth=5, learning_rate=0.08, subsample=0.85,
        colsample_bytree=0.85, objective="binary:logistic", eval_metric="logloss",
        random_state=settings.RANDOM_SEED, n_jobs=-1,
    )
    model.fit(X_train, y_train)
    preds = model.predict(X_test)

    metrics = {
        "accuracy": accuracy_score(y_test, preds),
        "weighted_precision": precision_score(y_test, preds, average="weighted", zero_division=0),
        "weighted_recall": recall_score(y_test, preds, average="weighted", zero_division=0),
        "macro_f1": f1_score(y_test, preds, average="macro", zero_division=0),
        "train_rows": len(X_train),
        "test_rows": len(X_test),
        "feature_columns": CHURN_CLASSIFIER_FEATURES,
        "label_classes": ["Retained", "AtRisk"],
    }
    with open(settings.PYTHON_MODELS_DIR / "churn_risk_classifier.pkl", "wb") as f:
        pickle.dump({"model": model, "features": CHURN_CLASSIFIER_FEATURES}, f)
    return metrics


def main() -> None:
    menu_df = read_parquet_dir("menu_item_features")
    customer_df = read_parquet_dir("customer_features")

    log.info("Training menu performance classifier (XGBoost)...")
    menu_classification_metrics = train_menu_classifier(menu_df)
    log.info(menu_classification_metrics)

    log.info("Training demand forecasting regressor (XGBoost)...")
    demand_metrics = train_demand_regressor(menu_df)
    log.info(demand_metrics)

    log.info("Training wastage predictor (XGBoost)...")
    wastage_metrics = train_wastage_regressor(menu_df)
    log.info(wastage_metrics)

    log.info("Training churn risk classifier (XGBoost)...")
    churn_metrics = train_churn_classifier(customer_df)
    log.info(churn_metrics)

    report = {
        "pipeline": "python_xgboost",
        "menu_performance_classification": menu_classification_metrics,
        "demand_forecasting": demand_metrics,
        "wastage_prediction": wastage_metrics,
        "churn_risk_classification": churn_metrics,
    }
    report_path = settings.REPORTS_DIR / "python_model_metrics.json"
    report_path.write_text(json.dumps(report, indent=2, default=str))
    log.info("Python model metrics written to %s", report_path)


if __name__ == "__main__":
    main()
