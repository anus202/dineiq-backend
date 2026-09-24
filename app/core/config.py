"""Application settings, loaded from environment variables and the .env file."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- App ---
    app_name: str = "DineIQ API"
    app_version: str = "0.1.0"
    app_env: str = "development"
    api_prefix: str = "/api"

    # --- Spark ---
    spark_app_name: str = "dineiq-api"
    spark_master: str = "local[*]"
    spark_driver_memory: str = "1g"
    spark_shuffle_partitions: int = 4


@lru_cache
def get_settings() -> Settings:
    return Settings()
