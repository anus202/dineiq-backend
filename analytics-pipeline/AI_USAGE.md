# AI Usage Disclosure — DineIQ Analytics (Data Science Intelligence Arena)

This document discloses how AI assistance (Claude, Anthropic) was used in building this
project, per the SRS's transparency requirement.

## What AI generated

Claude Code generated the full first draft of every file under `data_pipeline/`,
`spark_jobs/`, `python_pipeline/`, `src/analytics/`, `src/api/`, and the `frontend-analytics/`
React app, based on an iterative, human-directed specification (an SRS document supplied
by the project owner, refined across multiple prompts specifying exact modules, endpoints,
metrics, and UI components).

## What the human (project owner) directed

- Supplied the SRS defining every required section, module, model type, metric, and
  endpoint.
- Supplied the existing production MSSQL database (`DineIQ`) as the real data source
  (500,000+ customers, 200+ menu items, 15 categories) that all synthetic data generation
  and feature engineering builds on top of.
- Directed the build order (Sections 1 → 6, deferring dashboard/recommendation code until
  the underlying trained models existed, rather than shipping code that referenced
  non-existent model artifacts).
- Reviewed and can independently re-run every stage (`ingest_sql_data.py` →
  `ingest_and_clean.py` → `feature_engineering.py` → `spark_mllib_models.py` /
  `train_python_models.py` → the analytics/API layer) to verify the reported metrics are
  reproducible, not fabricated.

## What was verified, not assumed

- Every metric surfaced by `/api/v1/models/metrics`, `/api/v1/dual-pipeline/compare`, and
  the dashboard endpoints is computed at run time from `reports/*.json` and the Parquet
  feature tables — none of these numbers are hardcoded or invented by the AI.
- The Data Quality Report (`reports/data_quality_report.json`) is produced by
  `spark_jobs/ingest_and_clean.py` actually counting and correcting each anomaly class
  defined in `config/settings.py`'s `ANOMALY_RATES`, not a static description of intended
  behavior.
- The dual-pipeline comparison in `src/analytics/dual_pipeline_verifier.py` loads two
  independently trained models (Spark MLlib's saved `PipelineModel`, and the pickled
  XGBoost model) and scores the same held-out records through both at request time.

## Known limitations / honest caveats

- The transaction volume (100,000+ orders, 1,000,000+ order lines) is synthetically
  generated (Section 1) on top of the real customer/menu/category dimension data, because
  the production system does not yet have a full year of real transactional history at
  that volume. This is explicitly documented, not disguised as real transaction history.
- Spark MLlib's `GBTClassifier` only supports binary classification; since
  `MenuPerformanceClass` has 4 classes (Star/PlowHorse/Puzzle/Dog), the third Spark
  candidate model is a second, differently-tuned Random Forest rather than a true GBT —
  documented explicitly in `spark_jobs/spark_mllib_models.py` and in the metrics JSON's
  `display_name` field, rather than silently mislabeling it.
