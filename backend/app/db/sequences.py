"""Yearly document numbers (ORD-2026-000042, INV-2026-000042) from SQL Server SEQUENCEs.

One SEQUENCE per kind per year. A SEQUENCE hands out numbers without holding any lock
afterwards, even inside an open transaction. Holding a lock across the order transaction
(or needing a second pooled connection for a counter) froze the app under concurrent
orders: waiting requests used up the driver's worker threads and pool connections the
lock holder needed to finish. A rolled-back transaction leaves a gap, which is harmless.
"""
from dataclasses import dataclass
from typing import Union

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession

Executor = Union[AsyncSession, AsyncConnection]


@dataclass(frozen=True)
class YearlyNumberSequence:
    sequence_base: str  # e.g. "OrderNumberSeq" -> dbo.[OrderNumberSeq_2026]
    prefix: str  # e.g. "ORD"
    table: str  # table holding the numbers, to seed a new year's sequence
    column: str

    def _prefix(self, year: int) -> str:
        return f"{self.prefix}-{int(year)}-"

    def _sequence_name(self, year: int) -> str:
        return f"dbo.[{self.sequence_base}_{int(year)}]"

    async def ensure(self, db: Executor, year: int) -> None:
        """Create this year's sequence if missing, starting after any existing numbers.

        Commits (or rolls back) immediately, so call it before loading anything the
        caller still needs from the session.
        """
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
            # NO CACHE: numbers aren't skipped when SQL Server restarts.
            await db.execute(text(f"CREATE SEQUENCE {self._sequence_name(year)} AS INT START WITH {int(start)} NO CACHE"))
            await db.commit()
        except DBAPIError:
            # Another request created it at the same moment.
            await db.rollback()

    async def next(self, db: Executor, year: int) -> str:
        seq = await db.scalar(text(f"SELECT NEXT VALUE FOR {self._sequence_name(year)}"))
        return f"{self._prefix(year)}{seq:06d}"


ORDER_NUMBERS = YearlyNumberSequence("OrderNumberSeq", "ORD", "tbl_Orders", "OrderNumber")
INVOICE_NUMBERS = YearlyNumberSequence("InvoiceNumberSeq", "INV", "tbl_Payment", "InvoiceNumber")
