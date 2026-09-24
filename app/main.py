"""DineIQ FastAPI application entry point.

Run with:  python -m uvicorn app.main:app --reload
Swagger:   http://127.0.0.1:8000/docs
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import RedirectResponse

from app.core.config import get_settings
from app.routers import health
from app.services.spark_service import stop_spark

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Spark starts lazily on first use; shut it down cleanly when the server stops.
    stop_spark()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="DineIQ backend API: restaurant analytics powered by PySpark.",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.include_router(health.router, prefix=settings.api_prefix)


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    return RedirectResponse(url="/docs")
