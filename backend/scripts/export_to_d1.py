"""Export the SQL Server DineIQ database into D1-compatible SQL files.

Output: worker/data/<table>_<part>.sql  (each file holds batched INSERTs)
Usage:  python backend/scripts/export_to_d1.py [--only TABLE] [--max-rows N] [--batch N] [--rows-per-file N]
"""
from __future__ import annotations

import argparse
import os
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import pyodbc

SERVER = os.getenv("DB_SERVER", ".")
DATABASE = os.getenv("DB_NAME", "DineIQ")
USER = os.getenv("DB_USER", "sa")
PASSWORD = os.getenv("DB_PASSWORD", "123")
DRIVER = os.getenv("DB_DRIVER", "ODBC Driver 17 for SQL Server")

CONN_STR = (
    f"DRIVER={{{DRIVER}}};SERVER={SERVER};DATABASE={DATABASE};UID={USER};PWD={PASSWORD};"
    "TrustServerCertificate=yes;"
)

# Insert order respects foreign-key dependencies.
TABLES = [
    "tbl_Role",
    "Restaurants",
    "Customers",
    "Menu_Categories",
    "Menu_Items",
    "tbl_Signup",
    "tbl_DiningTable",
    "Inventory",
    "Orders",
    "Order_Items",
    "tbl_Payment",
    "Pricing_History",
    "Promotions",
    "Ratings",
    "Wastage",
    "tbl_StockMovementLog",
    "tbl_Recipe",
    "Customer_Favorites",
    "tbl_Login",
    "tbl_AuditLog",
]

OUT_DIR = Path(__file__).resolve().parents[2] / "worker" / "data"


def sql_literal(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float, Decimal)):
        return str(value)
    if isinstance(value, datetime):
        return "'" + value.strftime("%Y-%m-%d %H:%M:%S") + "'"
    if isinstance(value, date):
        return "'" + value.strftime("%Y-%m-%d") + "'"
    if isinstance(value, (bytes, bytearray)):
        return "'" + value.hex() + "'"
    text = str(value).replace("'", "''")
    return "'" + text + "'"


def export_table(cur, table: str, batch: int, rows_per_file: int, max_rows: int | None) -> int:
    cur.execute(f"SELECT * FROM [{table}]")
    columns = [d[0] for d in cur.description]
    col_list = ", ".join(f"[{c}]" for c in columns)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob(f"{table}_*.sql"):
        old.unlink()

    part = 0
    total = 0
    buf: list[str] = []
    chunk: list[list[object]] = []

    def flush_chunk() -> None:
        nonlocal chunk
        if not chunk:
            return
        values = ",\n".join(
            "(" + ", ".join(sql_literal(v) for v in row) + ")" for row in chunk
        )
        buf.append(
            f"INSERT OR REPLACE INTO [{table}] ({col_list}) VALUES\n{values};"
        )
        chunk = []

    def flush_file() -> None:
        nonlocal part, buf
        if not buf:
            return
        path = OUT_DIR / f"{table}_{part:03d}.sql"
        path.write_text("\n".join(buf), encoding="utf-8")
        print(f"  wrote {path.name} ({path.stat().st_size / 1024:.0f} KB)")
        part += 1
        buf = []

    rows_in_file = 0
    while True:
        rows = cur.fetchmany(batch)
        if not rows:
            break
        for row in rows:
            chunk.append(list(row))
            rows_in_file += 1
            if len(chunk) >= batch:
                flush_chunk()
            if rows_in_file >= rows_per_file:
                flush_chunk()
                flush_file()
                rows_in_file = 0
        total += len(rows)
        if max_rows is not None and total >= max_rows:
            break
    flush_chunk()
    flush_file()
    print(f"{table}: exported {total} rows in {part} file(s)")
    return total


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default=None, help="Comma separated table names")
    parser.add_argument("--max-rows", type=int, default=None)
    parser.add_argument("--batch", type=int, default=250)
    parser.add_argument("--rows-per-file", type=int, default=10000)
    args = parser.parse_args()

    wanted = set(args.only.split(",")) if args.only else None
    tables = [t for t in TABLES if not wanted or t in wanted]

    conn = pyodbc.connect(CONN_STR, autocommit=True, timeout=60)
    cur = conn.cursor()
    grand = 0
    for table in tables:
        grand += export_table(cur, table, args.batch, args.rows_per_file, args.max_rows)
    cur.close()
    conn.close()
    print(f"TOTAL rows exported: {grand}")


if __name__ == "__main__":
    main()
