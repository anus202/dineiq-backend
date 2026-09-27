"""Functional + security tests: authentication and role-based access control."""
import pytest

from conftest import ADMIN_EMAIL

ML_ENDPOINTS = [
    "/api/v1/ml-analytics/market-basket",
    "/api/v1/ml-analytics/price-sensitivity",
    "/api/v1/ml-analytics/promotion-traps",
    "/api/v1/ml-analytics/recommendations",
    "/api/v1/ml-analytics/churn-risk",
    "/api/v1/ml-analytics/rating-anomalies",
    "/api/v1/ml-analytics/slow-moving-dishes",
    "/api/v1/ml-analytics/wastage-risk",
    "/api/v1/ml-analytics/demand-forecast",
]


def test_health_check(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_login_returns_token_for_valid_credentials(admin_headers):
    assert admin_headers["Authorization"].startswith("Bearer ")


def test_login_rejects_wrong_password(client):
    response = client.post("/api/v1/auth/login", json={"Email": ADMIN_EMAIL, "Password": "definitely-wrong"})
    assert response.status_code == 401


def test_login_rejects_unknown_user(client):
    response = client.post("/api/v1/auth/login", json={"Email": "nobody-3f8a2c@dineiq-test.example.com", "Password": "whatever1"})
    assert response.status_code in (401, 404)


@pytest.mark.parametrize("path", ML_ENDPOINTS)
def test_ml_endpoints_require_authentication(client, path):
    assert client.get(path).status_code == 401


def test_what_if_requires_authentication(client):
    assert client.post("/api/v1/ml-analytics/what-if", json={"menu_item_id": 5}).status_code == 401


@pytest.mark.parametrize("path", ["/api/v1/ml-analytics/rating-anomalies", "/api/v1/ml-analytics/slow-moving-dishes"])
def test_cashier_is_forbidden_from_ml_analytics(client, cashier_headers, path):
    assert client.get(path, headers=cashier_headers).status_code == 403


def test_tampered_token_is_rejected(client, admin_headers):
    token = admin_headers["Authorization"].removeprefix("Bearer ")
    tampered = token[:-4] + ("AAAA" if not token.endswith("AAAA") else "BBBB")
    response = client.get("/api/v1/ml-analytics/rating-anomalies", headers={"Authorization": f"Bearer {tampered}"})
    assert response.status_code == 401
