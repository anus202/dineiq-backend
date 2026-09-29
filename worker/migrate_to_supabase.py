"""Migrate all data from SQL Server to Supabase PostgreSQL.

Uses COPY (text format) for maximum speed on large tables.
"""
from __future__ import annotations

import io
import os
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

import psycopg2
import pyodbc

# SQL Server connection
MSSQL_CONN = (
    f"DRIVER={{{os.getenv('DB_DRIVER', 'ODBC Driver 17 for SQL Server')}}};"
    f"SERVER={os.getenv('DB_SERVER', '.')};"
    f"DATABASE={os.getenv('DB_NAME', 'DineIQ')};"
    f"UID={os.getenv('DB_USER', 'sa')};"
    f"PWD={os.getenv('DB_PASSWORD', '123')};"
    "TrustServerCertificate=yes;"
)

# Supabase connection
PG_CONN = {
    'host': 'aws-0-ap-northeast-1.pooler.supabase.com',
    'port': 5432,
    'dbname': 'postgres',
    'user': 'postgres.djbfgmugbcxgskzidwtl',
    'password': 'Anus24680@12',
    'sslmode': 'require',
}

# Insert order respects FK dependencies
TABLES = [
    'tbl_Role',
    'Customers',
    'Menu_Categories',
    'Menu_Items',
    'Restaurants',
    'tbl_Signup',
    'tbl_DiningTable',
    'Inventory',
    'Orders',
    'Order_Items',
    'tbl_Payment',
    'Pricing_History',
    'Promotions',
    'Ratings',
    'Wastage',
    'tbl_StockMovementLog',
    'tbl_Recipe',
    'Customer_Favorites',
    'tbl_Login',
    'tbl_AuditLog',
]

BATCH_SIZE = 10000


def to_text(value) -> str:
    """Convert a Python value to PostgreSQL text-format COPY representation."""
    if value is None:
        return r'\N'
    if isinstance(value, bool):
        return 't' if value else 'f'
    if isinstance(value, (int, float, Decimal)):
        return str(value)
    if isinstance(value, datetime):
        return value.strftime('%Y-%m-%d %H:%M:%S')
    if isinstance(value, date):
        return value.strftime('%Y-%m-%d')
    if isinstance(value, (bytes, bytearray)):
        return r'\\x' + value.hex()
    # String: escape special chars for text format
    text = str(value)
    text = text.replace('\\', '\\\\').replace('\t', '\\t').replace('\n', '\\n').replace('\r', '\\r')
    return text


def migrate_table(mssql_cur, pg_cur, table: str) -> int:
    pg_table = table.lower()  # PostgreSQL folds unquoted identifiers to lowercase
    mssql_cur.execute(f'SELECT * FROM [{table}]')
    columns = [d[0] for d in mssql_cur.description]
    col_list = ', '.join(columns)  # unquoted → PostgreSQL folds to lowercase

    total = 0
    while True:
        rows = mssql_cur.fetchmany(BATCH_SIZE)
        if not rows:
            break

        buf = io.StringIO()
        for row in rows:
            buf.write('\t'.join(to_text(v) for v in row))
            buf.write('\n')
        buf.seek(0)

        pg_cur.copy_expert(
            f'COPY "{pg_table}" ({col_list}) FROM STDIN WITH (FORMAT text)',
            buf,
        )
        total += len(rows)
        print(f'  {table}: {total:,} rows migrated...', flush=True)

    return total


def main() -> None:
    only = set(sys.argv[1].split(',')) if len(sys.argv) > 1 else None
    tables = [t for t in TABLES if not only or t in only]

    print('Connecting to SQL Server...')
    mssql = pyodbc.connect(MSSQL_CONN, autocommit=True, timeout=60)
    mssql_cur = mssql.cursor()

    print('Connecting to Supabase...')
    pg = psycopg2.connect(**PG_CONN)
    pg.autocommit = True
    pg_cur = pg.cursor()

    grand = 0
    for table in tables:
        print(f'Migrating {table}...', flush=True)
        grand += migrate_table(mssql_cur, pg_cur, table)

    pg_cur.close()
    pg.close()
    mssql_cur.close()
    mssql.close()
    print(f'\nTOTAL rows migrated: {grand:,}')


if __name__ == '__main__':
    main()
