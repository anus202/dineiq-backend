"""Health check endpoints."""

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.schemas.health import HealthResponse, SparkHealthResponse
from app.services import spark_service

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("", response_model=HealthResponse, summary="API health check")
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="healthy",
        app_name=settings.app_name,
        version=settings.app_version,
        environment=settings.app_env,
        timestamp=datetime.now(timezone.utc),
    )


# Plain `def` (not async) so FastAPI runs this blocking Spark call in a worker thread.
@router.get("/spark", response_model=SparkHealthResponse, summary="Spark health check (runs a real Spark job)")
def spark_health() -> SparkHealthResponse:
    try:
        result = spark_service.run_health_check()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Spark health check failed: {exc}") from exc

    if not result["result_correct"]:
        raise HTTPException(status_code=503, detail="Spark returned an incorrect result")

    return SparkHealthResponse(status="healthy", **result)
