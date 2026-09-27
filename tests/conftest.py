"""Shared fixtures for the DineIQ test suite.

API tests run the real FastAPI app in-process through TestClient (no server needed), against
the live SQL Server database configured in backend/.env. Pipeline and model tests read the
artifacts produced by analytics-pipeline/ and skip, with a reason, when those haven't been
generated yet.
"""
import os
import sys
from pathlib import Path

import pytest
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
PIPELINE_DIR = REPO_ROOT / "analytics-pipeline"
REPORTS_DIR = PIPELINE_DIR / "reports"
CLEAN_DIR = PIPELINE_DIR / "processed_data" / "clean_parquet"
PYTHON_MODELS_DIR = PIPELINE_DIR / "models" / "python_models"
SPARK_MODELS_DIR = PIPELINE_DIR / "models" / "spark_models"

sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")

DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "Demo@12345")
ADMIN_EMAIL = "admin@dineiq.demo"
CASHIER_EMAIL = "cashier@dineiq.demo"


def require_path(path: Path) -> Path:
    if not path.exists():
        pytest.skip(f"{path.relative_to(REPO_ROOT)} not found — run the analytics pipeline first")
    return path


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


def _login(client, email: str) -> dict:
    response = client.post("/api/v1/auth/login", json={"Email": email, "Password": DEMO_PASSWORD})
    if response.status_code != 200:
        pytest.skip(f"cannot log in as {email} (status {response.status_code}) — run backend/scripts/seed_demo_data.py")
    return {"Authorization": f"Bearer {response.json()['Token']}"}


@pytest.fixture(scope="session")
def admin_headers(client):
    return _login(client, ADMIN_EMAIL)


@pytest.fixture(scope="session")
def cashier_headers(client):
    return _login(client, CASHIER_EMAIL)


@pytest.fixture(scope="session")
def db():
    import pyodbc

    conn = pyodbc.connect(
        f"DRIVER={{{os.getenv('DB_DRIVER', 'ODBC Driver 17 for SQL Server')}}};SERVER={os.getenv('DB_SERVER', '.')};"
        f"DATABASE={os.getenv('DB_NAME', 'DineIQ')};UID={os.getenv('DB_USER', 'sa')};PWD={os.getenv('DB_PASSWORD', '')};"
        "TrustServerCertificate=yes",
        autocommit=True,
    )
    yield conn
    conn.close()


def scalar(db, sql: str):
    return db.cursor().execute(sql).fetchone()[0]
