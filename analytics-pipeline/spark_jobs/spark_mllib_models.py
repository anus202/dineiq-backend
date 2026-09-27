"""SECTION 2.3 — Spark MLlib models.

Trains, on the feature tables built by feature_engineering.py:
  1. Menu Performance classifier   — 3 candidate MLlib classifiers (Logistic Regression,
     Random Forest, GBTClassifier) predicting MenuPerformanceClass (Star/PlowHorse/
     Puzzle/Dog). All three are trained and evaluated; the best by weighted F1 is saved
     as "the" Spark menu-performance model, but every model's metrics are kept so the
     dual-pipeline verifier and dashboard can show the full comparison, not just the winner.
  2. Demand forecasting regressor  — GBTRegressor predicting a menu item's next-month
     quantity sold from its trailing engineered features.

All metrics (Accuracy, Precision, Recall, Macro-F1 for classifiers; MAE, RMSE, MAPE for
the regressor) are written to reports/spark_model_metrics.json so Section 4's dual-pipeline
verifier and Section 5's dashboard endpoint can load real numbers instead of recomputing.

Usage:
    .venv-bigdata\\Scripts\\python -m spark_jobs.spark_mllib_models
"""
from __future__ import annotations

import json
import logging
import shutil
import sys
from pathlib import Path

from pyspark.ml import Pipeline
from pyspark.ml.classification import GBTClassifier, LogisticRegression, RandomForestClassifier
from pyspark.ml.evaluation import MulticlassClassificationEvaluator, RegressionEvaluator
from pyspark.ml.feature import StringIndexer, VectorAssembler
from pyspark.ml.regression import GBTRegressor
from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import settings  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s  %(message)s")
log = logging.getLogger("spark_mllib_models")

CLEAN_DIR = settings.PROCESSED_DATA_DIR / "clean_parquet"

# TotalQuantitySold and MarginPercent are deliberately excluded: MenuPerformanceClass is
# a deterministic threshold function of exactly those two columns (see
# feature_engineering.py::build_menu_item_features), so including them here would let the
# classifier trivially re-derive the label instead of genuinely predicting it from
# behavioral signals -- a classic target-leakage bug that inflates accuracy to ~100%
# without the model having learned anything real.
MENU_CLASSIFIER_FEATURES = [
    "OrderCount", "TotalRevenue", "AvgSellingPrice",
    "RecencyDays", "WastagePercent", "AvgRating", "RatingCount", "RatingTrendDelta",
    "PriceQuantityCorrelation", "PromotedOrderCount",
]
DEMAND_REGRESSOR_FEATURES = [
    "QuantitySold", "Revenue", "MarginPercent", "AvgSellingPrice", "AvgRating",
    "RatingCount", "PromotedOrderCount",
]


def build_spark_session() -> SparkSession:
    return (
        SparkSession.builder.appName("DineIQ-SparkMLlib")
        .master("local[*]")
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.sql.shuffle.partitions", "8")
        .config("spark.driver.memory", "3g")
        .getOrCreate()
    )


def load_menu_features(spark: SparkSession) -> DataFrame:
    path = CLEAN_DIR / "menu_item_features"
    if not path.exists():
        raise FileNotFoundError(f"{path} not found — run spark_jobs/feature_engineering.py first.")
    df = spark.read.parquet(str(path))
    for c in MENU_CLASSIFIER_FEATURES:
        df = df.withColumn(c, F.coalesce(F.col(c).cast("double"), F.lit(0.0)))
    return df


def load_monthly_demand(spark: SparkSession) -> DataFrame:
    path = CLEAN_DIR / "menu_item_monthly_demand"
    if not path.exists():
        raise FileNotFoundError(f"{path} not found — run spark_jobs/feature_engineering.py first.")
    df = spark.read.parquet(str(path))
    for c in DEMAND_REGRESSOR_FEATURES:
        df = df.withColumn(c, F.coalesce(F.col(c).cast("double"), F.lit(0.0)))
    return df


def train_menu_classifiers(df: DataFrame) -> dict:
    label_indexer = StringIndexer(inputCol="MenuPerformanceClass", outputCol="label", handleInvalid="keep")
    assembler = VectorAssembler(inputCols=MENU_CLASSIFIER_FEATURES, outputCol="features", handleInvalid="skip")

    indexed = label_indexer.fit(df)
    labels = indexed.labels
    prepared = assembler.transform(indexed.transform(df))
    train_df, test_df = prepared.randomSplit([0.7, 0.3], seed=settings.RANDOM_SEED)
    train_df.cache()
    test_df.cache()

    candidates = {
        "logistic_regression": LogisticRegression(featuresCol="features", labelCol="label", maxIter=50),
        "random_forest": RandomForestClassifier(featuresCol="features", labelCol="label", numTrees=100, maxDepth=8, seed=settings.RANDOM_SEED),
        "gbt": GBTClassifier(featuresCol="features", labelCol="label", maxIter=50, maxDepth=5, seed=settings.RANDOM_SEED)
        if len(labels) <= 2
        else RandomForestClassifier(featuresCol="features", labelCol="label", numTrees=150, maxDepth=10, seed=settings.RANDOM_SEED + 1),
    }
    # GBTClassifier only supports binary targets in Spark MLlib; MenuPerformanceClass has 4
    # classes, so the 3rd candidate is a second, more heavily-tuned Random Forest — still a
    # genuinely distinct model configuration, evaluated independently and honestly reported
    # as such rather than mislabeling it as GBT.
    candidate_display_names = {
        "logistic_regression": "Logistic Regression",
        "random_forest": "Random Forest (100 trees, depth 8)",
        "gbt": "Random Forest (150 trees, depth 10) [GBT substitute: MLlib GBTClassifier supports binary labels only, and MenuPerformanceClass has 4 classes]",
    }

    results = {}
    best_name, best_f1, best_model = None, -1.0, None
    for name, estimator in candidates.items():
        model = estimator.fit(train_df)
        preds = model.transform(test_df)
        evaluator_acc = MulticlassClassificationEvaluator(labelCol="label", predictionCol="prediction", metricName="accuracy")
        evaluator_f1 = MulticlassClassificationEvaluator(labelCol="label", predictionCol="prediction", metricName="f1")
        evaluator_prec = MulticlassClassificationEvaluator(labelCol="label", predictionCol="prediction", metricName="weightedPrecision")
        evaluator_rec = MulticlassClassificationEvaluator(labelCol="label", predictionCol="prediction", metricName="weightedRecall")
        metrics = {
            "display_name": candidate_display_names[name],
            "accuracy": evaluator_acc.evaluate(preds),
            "weighted_precision": evaluator_prec.evaluate(preds),
            "weighted_recall": evaluator_rec.evaluate(preds),
            "macro_f1": evaluator_f1.evaluate(preds),
            "train_rows": train_df.count(),
            "test_rows": test_df.count(),
        }
        results[name] = metrics
        log.info("[%s] %s", name, metrics)
        if metrics["macro_f1"] > best_f1:
            best_name, best_f1, best_model = name, metrics["macro_f1"], model

    pipeline_model_dir = settings.SPARK_MODELS_DIR / "menu_performance_classifier"
    if pipeline_model_dir.exists():
        shutil.rmtree(pipeline_model_dir)
    full_pipeline = Pipeline(stages=[label_indexer, assembler, best_model])
    fitted_full_pipeline = full_pipeline.fit(df)
    fitted_full_pipeline.write().overwrite().save(str(pipeline_model_dir))

    label_map_path = settings.SPARK_MODELS_DIR / "menu_performance_label_index.json"
    label_map_path.write_text(json.dumps({str(i): lbl for i, lbl in enumerate(labels)}, indent=2))

    return {
        "best_model": best_name,
        "best_model_display_name": candidate_display_names[best_name],
        "best_macro_f1": best_f1,
        "candidates": results,
        "feature_columns": MENU_CLASSIFIER_FEATURES,
        "label_classes": labels,
        "saved_path": str(pipeline_model_dir),
    }


def train_demand_regressor(df: DataFrame) -> dict:
    """Chronological split (SRS Step 21): every row belongs to one calendar month; the
    single most recent month present is held out entirely as the test set, and every
    earlier month is used for training -- never the reverse, and never a random mix of
    both within the same period."""
    assembler = VectorAssembler(inputCols=DEMAND_REGRESSOR_FEATURES, outputCol="features", handleInvalid="skip")
    label_col = "NextMonthQuantitySold"
    prepared = assembler.transform(df.withColumn(label_col, F.col(label_col).cast("double")))

    last_month = prepared.agg(F.max("YearMonth")).first()[0]
    train_df = prepared.where(F.col("YearMonth") < F.lit(last_month))
    test_df = prepared.where(F.col("YearMonth") == F.lit(last_month))

    regressor = GBTRegressor(featuresCol="features", labelCol=label_col, maxIter=80, maxDepth=6, seed=settings.RANDOM_SEED)
    model = regressor.fit(train_df)
    preds = model.transform(test_df)

    evaluator_mae = RegressionEvaluator(labelCol=label_col, predictionCol="prediction", metricName="mae")
    evaluator_rmse = RegressionEvaluator(labelCol=label_col, predictionCol="prediction", metricName="rmse")
    mape = preds.withColumn(
        "ape", F.abs((F.col(label_col) - F.col("prediction")) / F.when(F.col(label_col) == 0, F.lit(1.0)).otherwise(F.col(label_col)))
    ).agg(F.avg("ape")).first()[0] * 100

    metrics = {
        "mae": evaluator_mae.evaluate(preds),
        "rmse": evaluator_rmse.evaluate(preds),
        "mape_percent": mape,
        "train_rows": train_df.count(),
        "test_rows": test_df.count(),
        "feature_columns": DEMAND_REGRESSOR_FEATURES,
    }

    model_dir = settings.SPARK_MODELS_DIR / "demand_forecast_regressor"
    if model_dir.exists():
        shutil.rmtree(model_dir)
    full_pipeline = Pipeline(stages=[assembler, regressor])
    fitted = full_pipeline.fit(df.withColumn(label_col, F.col(label_col).cast("double")))
    fitted.write().overwrite().save(str(model_dir))
    metrics["saved_path"] = str(model_dir)
    return metrics


def main() -> None:
    spark = build_spark_session()
    spark.sparkContext.setLogLevel("WARN")
    try:
        df = load_menu_features(spark)
        df.cache()

        classifier_results = train_menu_classifiers(df)
        log.info("Best menu-performance model: %s (macro F1 = %.4f)", classifier_results["best_model"], classifier_results["best_macro_f1"])

        monthly_demand_df = load_monthly_demand(spark)
        monthly_demand_df.cache()
        regressor_results = train_demand_regressor(monthly_demand_df)
        log.info("Demand regressor: MAE=%.3f RMSE=%.3f MAPE=%.2f%%", regressor_results["mae"], regressor_results["rmse"], regressor_results["mape_percent"])

        report = {
            "pipeline": "spark_mllib",
            "menu_performance_classification": classifier_results,
            "demand_forecasting": regressor_results,
        }
        report_path = settings.REPORTS_DIR / "spark_model_metrics.json"
        report_path.write_text(json.dumps(report, indent=2, default=str))
        log.info("Spark model metrics written to %s", report_path)
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
