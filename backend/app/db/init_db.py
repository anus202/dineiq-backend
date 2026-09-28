import asyncio

from sqlalchemy import func, inspect, select, text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.config import DB_NAME
from app.core.roles import ROLE_DESCRIPTIONS, RoleName
from app.db.migrations import rename_legacy_tables, run_migrations
from app.db.sequences import INVOICE_NUMBERS, ORDER_NUMBERS
from app.db.session import build_engine, engine
from app.models import Base, Role, Signup
from app.models.base import utc_now

DEFAULT_ADMIN_PASSWORD_HASH = "$2b$12$hCMVKiQDpwv.mti6W4PVreRPDdc5.smQAyVVykXn.cuIb.mkV4PJe"
DEFAULT_ADMIN_EMAIL = "admin@dineiq.demo"

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
    existing = set((await conn.execute(select(Role.Name))).scalars())
    missing = [role for role in ROLE_DESCRIPTIONS if role.value not in existing]
    if missing:
        await conn.execute(
            Role.__table__.insert(),
            [{"Name": role.value, "Description": ROLE_DESCRIPTIONS[role], "CreatedAt": utc_now(), "UpdatedAt": utc_now()} for role in missing],
        )
        await conn.commit()
    return [role.value for role in missing]

async def seed_default_admin(conn: AsyncConnection) -> bool:
    existing_count = (await conn.execute(select(func.count()).select_from(Signup))).scalar()
    if existing_count:
        return False

    admin_role_id = await conn.scalar(select(Role.Id).where(Role.Name == RoleName.ADMIN.value))
    if admin_role_id is None:
        admin_role_id = await conn.scalar(select(Role.Id).where(Role.Name == RoleName.SUPER_ADMIN.value))
    if admin_role_id is None:

        raise RuntimeError("Cannot seed default admin: no ADMIN or SUPER_ADMIN role exists in tbl_Role")

    await conn.execute(
        Signup.__table__.insert(),
        [
            {
                "FullName": "Demo Admin",
                "Email": DEFAULT_ADMIN_EMAIL,
                "PasswordHash": DEFAULT_ADMIN_PASSWORD_HASH,
                "RoleId": admin_role_id,
                "CanAccessInventory": True,
                "CanAccessMenuManagement": True,
                "CanAccessBranchAnalytics": True,
                "IsActive": True,
                "IsDeleted": False,
                "CreatedAt": utc_now(),
                "UpdatedAt": utc_now(),
            }
        ],
    )
    await conn.commit()
    return True

async def init_db() -> None:
    await create_database_if_missing()
    async with engine.begin() as conn:
        renamed = await rename_legacy_tables(conn)
        if renamed:
            print(f"Renamed tables to match the SRS: {', '.join(renamed)}")
        await conn.run_sync(Base.metadata.create_all)
        tables = await conn.run_sync(lambda sync_conn: inspect(sync_conn).get_table_names())
    print(f"Tables in {DB_NAME}: {', '.join(tables)}")

    async with engine.connect() as conn:

        seeded = await seed_roles(conn)
        if seeded:
            print(f"Seeded roles: {', '.join(seeded)}")
        if await seed_default_admin(conn):
            print(f"Seeded default admin: {DEFAULT_ADMIN_EMAIL}")
        applied = await run_migrations(conn)
        if applied:
            print(f"Applied schema changes: {', '.join(applied)}")
        year = utc_now().year
        await ORDER_NUMBERS.ensure(conn, year)
        await INVOICE_NUMBERS.ensure(conn, year)

if __name__ == "__main__":
    asyncio.run(init_db())
