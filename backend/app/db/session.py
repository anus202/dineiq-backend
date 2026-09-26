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

# aioodbc runs every pyodbc call on a thread. By default that is the event loop's shared
# executor (only min(32, CPUs + 4) threads), smaller than the connection pool: when more
# connections than threads were waiting in SQL Server, the connection holding the lock
# could not get a thread to commit, and the app froze. One thread per possible connection
# means every checked-out connection can always make progress.
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
        # SQL Server waits for locks forever by default; fail after 10s instead so a
        # blocked query can't hold a connection and its thread indefinitely.
        cursor = dbapi_connection.cursor()
        cursor.execute(f"SET LOCK_TIMEOUT {LOCK_TIMEOUT_MS}")
        cursor.close()

    return async_engine


def is_deadlock(exc: DBAPIError) -> bool:
    """SQL Server error 1205: this transaction was chosen as a deadlock victim (safe to retry)."""
    return "1205" in str(exc.orig) or "deadlock" in str(exc.orig).lower()


engine = build_engine()

# expire_on_commit=False: objects stay readable after commit without an extra (async) reload.
SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yields an async session and always closes it."""
    async with SessionLocal() as db:
        yield db
