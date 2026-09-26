# DineIQ Analytics — Data Science Intelligence Arena

A Big Data / Data Science pipeline and dashboard, built on top of the **same MSSQL
`DineIQ` database** used by the operational restaurant-management backend (see the
[repo-root `README.md`](../README.md) for that system). This project is **separate**
from the operational app — it lives entirely under `analytics-pipeline/` — and reuses
the real Customers / Menu Items / Categories tables as dimension data, generates a
realistic transaction history at scale on top of them, and runs two independent ML
pipelines (Spark MLlib and Python/XGBoost) side by side.

All commands below assume you've `cd`-ed into `analytics-pipeline/` first.

> **Status:** this pipeline is fully written but has not yet been executed end-to-end —
> see `analytics-pipeline/.venv-bigdata`'s install history. No Parquet output, trained
> models, or comparison reports exist yet. Run Setup + Section 1-3 below to produce them.

## Architecture

```
DineIQ (MSSQL)  ──►  data_pipeline/ingest_sql_data.py   (Section 1: ingestion + synthetic data + anomalies)
                            │
                            ▼
                 processed_data/parquet_data/            (raw Parquet, partitioned)
                            │
                            ▼
                 spark_jobs/ingest_and_clean.py           (Section 2a: Data Quality Assessment + cleaning)
                            │
                            ▼
                 spark_jobs/feature_engineering.py        (Section 2b: RFM / margin / wastage / elasticity features)
                            │
                 ┌──────────┴──────────┐
                 ▼                     ▼
   spark_jobs/spark_mllib_models.py   python_pipeline/train_python_models.py
   (Section 2c: Spark MLlib)          (Section 3: Pandas + XGBoost)
                 │                     │
                 └──────────┬──────────┘
                            ▼
                 src/analytics/  (Section 4: dual-pipeline verifier, market-basket,
                                   promotion-trap detection, price elasticity,
                                   recommendations, what-if simulator)
                            │
                            ▼
                 src/api/main.py  (Section 5: FastAPI)
                            │
                            ▼
                 frontend-analytics/  (Section 6: React dashboard)
```

## Setup

```bash
python -m venv .venv-bigdata
.venv-bigdata\Scripts\activate
pip install -r requirements-bigdata.txt
```

Requires a JDK on `PATH` for PySpark (OpenJDK 21 confirmed working on this machine).
`config/settings.py` reads DB credentials directly from `../backend/.env` (the
operational app's own `.env`, one level up from this folder) — no separate copy needed.
An optional `analytics-pipeline/.env` can override any big-data-only setting.

## Running the pipeline end-to-end

```bash
# Section 1 — ingest real dimension data + generate synthetic transactions + inject anomalies
.venv-bigdata\Scripts\python -m data_pipeline.ingest_sql_data --source pyodbc

# Section 2 — Spark: data-quality cleaning, feature engineering, MLlib model training
.venv-bigdata\Scripts\python -m spark_jobs.ingest_and_clean
.venv-bigdata\Scripts\python -m spark_jobs.feature_engineering
.venv-bigdata\Scripts\python -m spark_jobs.spark_mllib_models

# Section 3 — independent Python/XGBoost pipeline
.venv-bigdata\Scripts\python -m python_pipeline.train_python_models

# Section 5 — API
.venv-bigdata\Scripts\python -m uvicorn src.api.main:app --port 8010 --reload
```

`--source jdbc` is available for Section 1 as a genuine Spark JDBC read, but requires SQL
Server's TCP/IP protocol to be enabled on the instance — an infrastructure change that
was deliberately left to the database owner's discretion rather than made automatically.
The default `--source pyodbc` path requires no such change and produces the same result.

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/ingest/sql` | Trigger Section 1 ingestion (Data Engineer role) |
| GET | `/api/v1/dashboard/executive` | Revenue/margin/order KPIs (Executive role) |
| GET | `/api/v1/menu/intelligence` | Menu-engineering matrix + price sensitivity |
| GET | `/api/v1/analytics/market-basket` | Support/Confidence/Lift co-purchase rules |
| GET | `/api/v1/analytics/promotion-traps` | Promotions destroying margin |
| GET | `/api/v1/dual-pipeline/compare` | Spark vs. XGBoost agreement report |
| POST | `/api/v1/simulate/what-if` | Price/discount simulation for one menu item |
| GET | `/api/v1/recommendations` | Priority-ranked, evidence-based recommendations |
| GET | `/api/v1/models/metrics` | Raw Spark + Python model metrics, data-quality report |

## Frontend

See [`frontend-analytics/README.md`](frontend-analytics/README.md) — a separate,
plain-JavaScript (`.jsx`) React app distinct from the TypeScript operational frontend,
built specifically for this project's role-based analytics UI (Executive, Restaurant
Manager, Data Engineer, Analyst).

## See also

- [`AI_USAGE.md`](AI_USAGE.md) — AI-assistance disclosure.
- [`config/settings.py`](config/settings.py) — every tunable parameter (dataset size,
  anomaly rates, file paths) in one place.
