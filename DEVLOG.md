# Development Log

Daily log of progress, decisions and issues for the DineIQ backend.

<!-- New entries go below, newest last. -->

## Day 1 - 2026-09-24: Environment + repo scaffold + FastAPI foundation

**Done**
- Local environment on Windows: Python 3.13, Java 21 (Microsoft OpenJDK), `.venv`,
  PySpark 4.2.0, Hadoop 3.4 `winutils.exe` / `hadoop.dll` in `C:\hadoop\bin`,
  `HADOOP_HOME` / `PYSPARK_PYTHON` / `PYSPARK_DRIVER_PYTHON` set.
- Moved the repo to `C:\Projects\dineiq-backend` (no spaces in path; spaces break Spark's Windows launch scripts).
- Repo scaffold: data, pipeline, recommender, docs folders; README, AI_USAGE, LICENSE (MIT), `.env.example`, `.gitignore`.
- `requirements.txt`: kept existing pins, added PySpark 4.x, pandas (<3.0 for PySpark compatibility), pyarrow, scikit-learn, etc.
- FastAPI foundation in `app/` (routers, core/config, services/spark_service, schemas):
  - `GET /api/health` - basic health check.
  - `GET /api/health/spark` - runs a real Spark aggregation and verifies the result.
  - Swagger at `/docs`; `tests/test_health.py` covers both endpoints.

**Decisions**
- Single shared, lazily created SparkSession (thread-safe) that is stopped on API shutdown.
- Spark health endpoint is a sync route so FastAPI runs the blocking Spark call in a worker thread.
- Spark UI disabled for the API session (not needed, avoids port conflicts under `--reload`).

**Next**
- Data generator and the first Spark ETL job.
