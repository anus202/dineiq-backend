# DineIQ automated tests

## What's covered

| File | What it tests |
|---|---|
| `test_api_auth_rbac.py` | Login, rejected credentials, tampered tokens, and that ML endpoints need auth and reject the Cashier role |
| `test_api_ml_analytics.py` | Every `/api/v1/ml-analytics/*` endpoint: What-If arithmetic for all 6 inputs, ordering, value ranges, and labels that match their thresholds |
| `test_data_quality.py` | That cleaned Parquet obeys every rule in `spark_jobs/ingest_and_clean.py`, and that the live database meets the SRS dataset minimums and value ranges |
| `test_ml_models.py` | Saved-model inference, the chronological (leak-free) split, evaluation metrics, NFR-4 accuracy, and the dual-pipeline report (100+ records, required fields, independence) |

## Prerequisites

- SQL Server running, with `backend/.env` configured.
- The demo accounts (`admin@dineiq.demo`, `cashier@dineiq.demo`) seeded. If they're
  missing, the tests that need them skip with a message.
- The analytics pipeline has been run. If its outputs are missing, the pipeline and model
  tests skip with a message rather than fail.

You don't need to start a server: the API tests run the FastAPI app in-process.

## Run

Run from the repo root, using the backend virtual environment:

```bash
backend/.venv/Scripts/python -m pip install -r tests/requirements.txt
```

```bash
backend/.venv/Scripts/python -m pytest
```

## Expected result

All tests pass except one, `test_demand_forecast_beats_naive_baseline`. It is marked
**xfail** because it's a known, documented limitation — see `AI_USAGE.md` §7. It stays
in the suite so the gap shows up in every run instead of being hidden.
