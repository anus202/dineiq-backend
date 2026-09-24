"""Response models for the health endpoints."""

from datetime import datetime

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    app_name: str
    version: str
    environment: str
    timestamp: datetime


class SparkBucket(BaseModel):
    bucket: int
    count: int
    total: int


class SparkHealthResponse(BaseModel):
    status: str
    spark_version: str
    master: str
    app_name: str
    rows_processed: int
    buckets: list[SparkBucket]
    computed_total: int
    expected_total: int
    result_correct: bool
    duration_ms: float
