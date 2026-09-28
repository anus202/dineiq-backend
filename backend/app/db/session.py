from concurrent.futures import ThreadPoolExecutor
from typing import AsyncGenerator
from urllib.parse import quote_plus

from sqlalchemy import event
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import DB_DRIVER, DB_MAX_OVERFLOW, DB_NAME, DB_PASSWORD, DB_POOL_SIZE, DB_SERVER, DB_USER

def build_connection_string(database: str = DB_NAME) -> str:
    return (
        f"Driver={{{DB_DRIVER}}};"
        f"Server={DB_SERVER};"
        f"Database={database};"
        f"UID={DB_USER};"
        f"PWD={DB_PASSWORD};"
        "TrustServerCertificate=yes;"
    )

LOCK_TIMEOUT_MS = 10_000

_db_executor = ThreadPoolExecutor(max_workers=DB_POOL_SIZE + DB_MAX_OVERFLOW, thread_name_prefix="db")

def build_engine(database: str = DB_NAME, **kwargs) -> AsyncEngine:
    url = f"mssql+aioodbc:///?odbc_connect={quote_plus(build_connection_string(database))}"
    kwargs.setdefault("pool_size", DB_POOL_SIZE)
    kwargs.setdefault("max_overflow", DB_MAX_OVERFLOW)
    async_engine = create_async_engine(
        url,
        pool_pre_ping=True,
        connect_args={"executor": _db_executor},
        **kwargs,
    )

    @event.listens_for(async_engine.sync_engine, "connect")
    def _set_lock_timeout(dbapi_connection, _record):

        cursor = dbapi_connection.cursor()
        cursor.execute(f"SET LOCK_TIMEOUT {LOCK_TIMEOUT_MS}")
        cursor.close()

    return async_engine

def is_deadlock(exc: DBAPIError) -> bool:
    return "1205" in str(exc.orig) or "deadlock" in str(exc.orig).lower()

engine = build_engine()

SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as db:
        yield db
