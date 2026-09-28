import os
import random
import sys
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import pyodbc
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

HISTORY_DAYS = 600

def sql():
    return pyodbc.connect(
        f"Driver={{{os.getenv('DB_DRIVER', 'ODBC Driver 17 for SQL Server')}}};Server={os.getenv('DB_SERVER', '.')};"
        f"Database={os.getenv('DB_NAME', 'DineIQ')};UID={os.getenv('DB_USER', 'sa')};PWD={os.getenv('DB_PASSWORD', '')};"
        "TrustServerCertificate=yes",
        autocommit=False,
    )

def round_price(value: Decimal) -> Decimal:
    return value.quantize(Decimal("1"), rounding=ROUND_HALF_UP)

def main() -> None:
    conn = sql()
    cur = conn.cursor()
    cur.fast_executemany = True

    cur.execute("SELECT COUNT(*) FROM Pricing_History")
    if cur.fetchone()[0] > 0:
        print("Pricing_History already has rows - skipping", flush=True)
        return

    cur.execute("SELECT Id, Price FROM Menu_Items WHERE IsDeleted = 0")
    menu_items = cur.fetchall()

    now = datetime.utcnow()
    history_start = now - timedelta(days=HISTORY_DAYS)

    rows = []
    for menu_item_id, current_price in menu_items:
        current_price = Decimal(str(current_price))
        n_changes = random.randint(2, 4)

        offsets = sorted(random.sample(range(30, HISTORY_DAYS), n_changes))
        change_dates = [history_start + timedelta(days=o) for o in offsets]

        prices = [current_price]
        for _ in range(n_changes - 1):
            pct = Decimal(random.uniform(-0.15, 0.15))
            prev_price = round_price(prices[-1] / (1 + pct)) if pct != -1 else prices[-1]
            prices.append(max(Decimal("50"), prev_price))
        prices.reverse()

        old_price = None
        for change_date, new_price in zip(change_dates, prices):
            rows.append((menu_item_id, old_price, new_price, change_date, change_date, change_date))
            old_price = new_price

    cur.executemany(
        "INSERT INTO dbo.Pricing_History (MenuItemId, OldPrice, NewPrice, ChangedAt, CreatedAt, UpdatedAt) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        rows,
    )
    conn.commit()
    print(f"Pricing_History seeded: +{len(rows):,} price-change records across {len(menu_items)} menu items.", flush=True)

if __name__ == "__main__":
    main()
