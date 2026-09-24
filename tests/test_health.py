from fastapi.testclient import TestClient

from app.main import app


def test_health():
    with TestClient(app) as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "healthy"
    assert body["app_name"] == "DineIQ API"


def test_spark_health_runs_real_job():
    with TestClient(app) as client:
        response = client.get("/api/health/spark")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "healthy"
    assert body["spark_version"].startswith("4.")
    assert body["rows_processed"] == 1000
    assert body["computed_total"] == body["expected_total"] == 500500
    assert body["result_correct"] is True


def test_docs_available():
    with TestClient(app) as client:
        assert client.get("/docs").status_code == 200
        assert client.get("/openapi.json").json()["info"]["title"] == "DineIQ API"
