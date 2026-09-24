# DineIQ Backend

Backend for DineIQ: a restaurant data platform that generates and processes
dining data with **PySpark 4.x** and a plain-Python pipeline, compares the two
approaches, trains a recommender, and serves results through a **FastAPI** API.

## Project structure

| Folder | Purpose |
|---|---|
| `config/` | YAML / app configuration |
| `data_generator/` | Synthetic data generation scripts |
| `raw_data/` | Generated raw input data (git-ignored) |
| `processed_data/` | Cleaned / transformed outputs |
| `parquet_data/` | Partitioned Parquet output from Spark (git-ignored) |
| `spark_jobs/` | PySpark jobs |
| `spark_sql/` | Spark SQL query files |
| `python_pipeline/` | Equivalent pipeline in pandas / plain Python |
| `comparison/` | Spark vs Python performance comparison |
| `recommender/` | Recommendation model code |
| `pipeline/` | End-to-end orchestration |
| `models/` | Saved trained models (joblib) |
| `database/` | SQL schema / migration scripts |
| `app/` | FastAPI app (`routers`, `core`, `schemas`, `services`) |
| `tests/` | pytest test suite |
| `notebooks/` | Exploration notebooks |
| `reports/` | Generated reports |
| `documentation/` | Project documentation |
| `screenshots/` | Screenshots for docs / reports |
| `templates/`, `static/` | HTML templates and static assets |

## Setup (Windows)

Requirements: Python 3.10+ and Java 17 or 21 (for Spark).

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
copy .env.example .env
```

Spark on Windows also needs `winutils.exe` and `hadoop.dll` in
`%HADOOP_HOME%\bin`, plus `HADOOP_HOME`, `PYSPARK_PYTHON` and
`PYSPARK_DRIVER_PYTHON` set. See `DEVLOG.md` (Day 1) for details.

## Run the API

From the repo root, with the venv active:

```powershell
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload
```

- Swagger UI: http://127.0.0.1:8000/docs
- ReDoc: http://127.0.0.1:8000/redoc

| Endpoint | Description |
|---|---|
| `GET /api/health` | Basic API health check |
| `GET /api/health/spark` | Starts/reuses a SparkSession and runs a real Spark job (sum of 1..1000 grouped into 3 buckets, verified against n(n+1)/2) |

The first call to `/api/health/spark` takes a few seconds while the Spark JVM starts; later calls reuse the session.

## Tests

```powershell
python -m pytest -v
```

## Docs

- `DEVLOG.md` - daily development log
- `AI_USAGE.md` - how AI tools were used in this project

## License

MIT - see `LICENSE`.
