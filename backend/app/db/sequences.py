from dataclasses import dataclass
from typing import Union

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

Executor = Union[AsyncSession, AsyncConnection]

@dataclass(frozen=True)
class YearlyNumberSequence:
    sequence_base: str
    prefix: str
    table: str
    column: str

    def _prefix(self, year: int) -> str:
        return f"{self.prefix}-{int(year)}-"

    def _sequence_name(self, year: int) -> str:
        return f"dbo.[{self.sequence_base}_{int(year)}]"

    async def ensure(self, db: Executor, year: int) -> None:
        exists = await db.scalar(text("SELECT OBJECT_ID(:name, 'SO')"), {"name": self._sequence_name(year)})
        if exists is not None:
            return
        start = await db.scalar(
            text(
                f"SELECT ISNULL(MAX(TRY_CAST(SUBSTRING([{self.column}], LEN(:prefix) + 1, 20) AS INT)), 0) + 1 "
                f"FROM dbo.[{self.table}] WHERE [{self.column}] LIKE :prefix + '%'"
            ),
            {"prefix": self._prefix(year)},
        )
        try:

            await db.execute(text(f"CREATE SEQUENCE {self._sequence_name(year)} AS INT START WITH {int(start)} NO CACHE"))
            await db.commit()
        except DBAPIError:

            await db.rollback()

    async def next(self, db: Executor, year: int) -> str:
        seq = await db.scalar(text(f"SELECT NEXT VALUE FOR {self._sequence_name(year)}"))
        return f"{self._prefix(year)}{seq:06d}"

    async def resync(self, db: Executor, year: int) -> None:
        await self.ensure(db, year)
        next_value = await db.scalar(
            text(
                f"SELECT ISNULL(MAX(TRY_CAST(SUBSTRING([{self.column}], LEN(:prefix) + 1, 20) AS INT)), 0) + 1 "
                f"FROM dbo.[{self.table}] WHERE [{self.column}] LIKE :prefix + '%'"
            ),
            {"prefix": self._prefix(year)},
        )
        await db.execute(text(f"ALTER SEQUENCE {self._sequence_name(year)} RESTART WITH {int(next_value)}"))
        await db.commit()

ORDER_NUMBERS = YearlyNumberSequence("OrderNumberSeq", "ORD", "Orders", "OrderNumber")
INVOICE_NUMBERS = YearlyNumberSequence("InvoiceNumberSeq", "INV", "tbl_Payment", "InvoiceNumber")
