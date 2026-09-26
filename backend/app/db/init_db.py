"""Create the DineIQ database (if missing), all model tables, roles and schema changes.

Runs automatically when the app starts; can also be run on its own:
    python -m app.db.init_db
"""
import asyncio

from sqlalchemy import inspect, select, text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.config import DB_NAME
from app.core.roles import ROLE_DESCRIPTIONS
from app.db.migrations import run_migrations
from app.db.sequences import INVOICE_NUMBERS, ORDER_NUMBERS
from app.db.session import build_engine, engine
from app.models import Base, Role  # importing app.models registers every table on Base.metadata
from app.models.base import utc_now


async def create_database_if_missing() -> None:
    master = build_engine("master", isolation_level="AUTOCOMMIT")
    try:
        async with master.connect() as conn:
            exists = (await conn.execute(text("SELECT DB_ID(:name)"), {"name": DB_NAME})).scalar()
            if exists is None:
                await conn.execute(text(f"CREATE DATABASE [{DB_NAME}]"))
                print(f"Created database {DB_NAME}")
    finally:
        await master.dispose()


async def seed_roles(conn: AsyncConnection) -> list[str]:
    """Insert any role from app.core.roles that tbl_Role doesn't have yet."""
    existing = set((await conn.execute(select(Role.Name))).scalars())
    missing = [role for role in ROLE_DESCRIPTIONS if role.value not in existing]
    if missing:
        await conn.execute(
            Role.__table__.insert(),
            [{"Name": role.value, "Description": ROLE_DESCRIPTIONS[role], "CreatedAt": utc_now(), "UpdatedAt": utc_now()} for role in missing],
        )
        await conn.commit()
    return [role.value for role in missing]


async def init_db() -> None:
    await create_database_if_missing()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        tables = await conn.run_sync(lambda sync_conn: inspect(sync_conn).get_table_names())
    print(f"Tables in {DB_NAME}: {', '.join(tables)}")

    async with engine.connect() as conn:
        # Roles first: a migration assigns existing accounts a role.
        seeded = await seed_roles(conn)
        if seeded:
            print(f"Seeded roles: {', '.join(seeded)}")
        applied = await run_migrations(conn)
        if applied:
            print(f"Applied schema changes: {', '.join(applied)}")
        year = utc_now().year
        await ORDER_NUMBERS.ensure(conn, year)
        await INVOICE_NUMBERS.ensure(conn, year)


if __name__ == "__main__":
    asyncio.run(init_db())
