"""Scale the operational database to SRS Big-Data volumes.

Targets (SRS Phase 2):
  - Order_Items  >= 1,000,000 rows (order lines)
  - Ratings        >=   100,000 rows
  - Wastage >= 50,000 rows
  - Promotions     seeded with a realistic set of campaigns

Safe to run repeatedly: every section checks its current count against its target
first and only inserts the shortfall. Ensures the schema (including the new
Promotions table) exists by running the app's own init_db() before touching data,
exactly like a normal app startup would.

    cd backend
    .venv\\Scripts\\python scripts\\scale_bigdata_seed.py
"""
import asyncio
import os
import random
import sys
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pyodbc
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.db.init_db import init_db  # noqa: E402
from app.db.sequences import ORDER_NUMBERS  # noqa: E402
from app.db.session import engine  # noqa: E402

TARGET_ORDER_DETAILS = 1_000_000
TARGET_RATINGS = 100_000
TARGET_WASTAGE = 50_000
ORDERS_PER_BATCH = 2000
AVG_LINES_PER_ORDER = 2.6
HISTORY_DAYS = 730

ORDER_TYPES = ["Dine-in", "Takeaway", "Delivery"]
PAYMENT_METHODS = ["Cash", "Card", "Wallet"]
STATUS_WEIGHTS = [("Completed", 8), ("Pending", 1), ("Cancelled", 1)]
STATUSES = [s for s, w in STATUS_WEIGHTS for _ in range(w)]

WASTAGE_REASONS = [
    "Spoilage - expired before use",
    "Overproduction - excess prepared",
    "Prep error - discarded",
    "Dropped or contaminated during prep",
    "Customer return - quality issue",
    "Power outage spoilage",
    "Over-portioned - trimmed off",
]

PROMOTIONS = [
    ("Weekday Lunch Deal", "15% off all lunch orders, Monday to Thursday", 15),
    ("Weekend Family Bundle", "Discount on family-size combo orders", 20),
    ("Happy Hour Drinks", "Discount on beverages, 4-6 PM daily", 10),
    ("New Customer Welcome", "First-order discount for new sign-ups", 25),
    ("Ramadan Iftar Special", "Discount on iftar deals during Ramadan", 18),
    ("Summer Cooldown", "Discount on cold beverages and desserts", 12),
    ("Winter Comfort Food", "Discount on soups and hot entrees", 10),
    ("Loyalty Member Exclusive", "Extra discount for loyalty-tier customers", 15),
    ("Delivery Free-for-All", "Discount offsetting delivery order totals", 8),
    ("Eid Celebration Offer", "Festive discount storewide", 20),
    ("Midweek Biryani Bonanza", "Discount on biryani and rice dishes", 22),
    ("Grand Opening Anniversary", "Storewide anniversary discount", 30),
    ("Student Discount Days", "Discount for student ID holders", 12),
    ("Late Night Cravings", "Discount on orders placed after 10 PM", 15),
    ("Combo Meal Saver", "Discount on any combo meal", 10),
    ("Flash Sale Friday", "One-day flash discount storewide", 25),
    ("Corporate Lunch Order", "Bulk order discount for offices", 18),
    ("Dessert Lovers Special", "Discount on dessert menu items", 10),
    ("Birthday Treat", "Discount for customers ordering on their birthday", 20),
    ("Rainy Day Delivery Discount", "Discount to encourage delivery on rainy days", 10),
]


def sql():
    return pyodbc.connect(
        f"Driver={{{os.getenv('DB_DRIVER', 'ODBC Driver 17 for SQL Server')}}};Server={os.getenv('DB_SERVER', '.')};"
        f"Database={os.getenv('DB_NAME', 'DineIQ')};UID={os.getenv('DB_USER', 'sa')};PWD={os.getenv('DB_PASSWORD', '')};"
        "TrustServerCertificate=yes",
        autocommit=False,
    )


def random_datetime(start: datetime, end: datetime) -> datetime:
    delta = end - start
    seconds = random.uniform(0, delta.total_seconds())
    return start + timedelta(seconds=seconds)


def scale_orders_and_lines(conn) -> None:
    cur = conn.cursor()
    cur.fast_executemany = True

    cur.execute("SELECT COUNT(*) FROM Order_Items")
    current = cur.fetchone()[0]
    if current >= TARGET_ORDER_DETAILS:
        print(f"Order_Items already at {current:,} (target {TARGET_ORDER_DETAILS:,}) - skipping", flush=True)
        return

    shortfall = TARGET_ORDER_DETAILS - current
    print(f"Order_Items at {current:,}, need {shortfall:,} more", flush=True)

    cur.execute("SELECT Id FROM Customers WHERE IsDeleted = 0")
    customer_ids = [r[0] for r in cur.fetchall()]
    cur.execute("SELECT Id FROM Restaurants WHERE IsDeleted = 0")
    branch_ids = [r[0] for r in cur.fetchall()]
    cur.execute("SELECT Id, Price, Cost FROM Menu_Items WHERE IsDeleted = 0")
    menu_items = cur.fetchall()
    cur.execute("SELECT COUNT(*) FROM Orders")
    order_count = cur.fetchone()[0]

    now = datetime.utcnow()
    history_start = now - timedelta(days=HISTORY_DAYS)

    order_counter = order_count
    lines_inserted = 0

    while lines_inserted < shortfall:
        orders_batch = []
        lines_by_order_index = []

        for _ in range(ORDERS_PER_BATCH):
            order_counter += 1
            order_date = random_datetime(history_start, now)
            n_lines = max(1, round(random.gauss(AVG_LINES_PER_ORDER, 1.2)))
            lines = []
            total = Decimal("0.00")
            for _ in range(n_lines):
                mi_id, price, cost = random.choice(menu_items)
                qty = random.randint(1, 4)
                unit_price = price
                unit_cost = cost
                line_total = unit_price * qty
                total += line_total
                lines.append((mi_id, qty, unit_price, unit_cost, line_total))
            discount = (total * Decimal(random.choice([0, 0, 0, 5, 10])) / 100).quantize(Decimal("0.01"))
            net = total - discount
            customer_id = random.choice(customer_ids) if random.random() < 0.95 else None
            branch_id = random.choice(branch_ids)
            order_number = f"ORD-{order_date.year}-{order_counter:06d}"

            orders_batch.append((
                customer_id, branch_id, random.randint(1, 6), order_number, order_date,
                random.choice(ORDER_TYPES), random.choice(PAYMENT_METHODS), random.choice(STATUSES),
                total, discount, net, order_date, order_date,
            ))
            lines_by_order_index.append(lines)

        cur.executemany(
            "INSERT INTO dbo.Orders "
            "(CustomerId, BranchId, GuestCount, OrderNumber, OrderDate, OrderType, PaymentMethod, Status, "
            "TotalAmount, Discount, NetAmount, CreatedAt, UpdatedAt) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            orders_batch,
        )

        # IDENT_CURRENT read *after* the insert: read before, IDENT_CURRENT returns the
        # seed value (not 0) on a table with no rows yet, which is off by one on the very
        # first batch and misassigns every Order_Items.OrderId in it (the last line ends
        # up pointing at an order ID that was never inserted, failing the FK constraint).
        cur.execute("SELECT IDENT_CURRENT('dbo.Orders')")
        last_id = int(cur.fetchone()[0])
        start_id = last_id - len(orders_batch)
        new_order_ids = list(range(start_id + 1, start_id + 1 + len(orders_batch)))

        detail_rows = []
        for order_id, lines in zip(new_order_ids, lines_by_order_index):
            for mi_id, qty, unit_price, unit_cost, line_total in lines:
                detail_rows.append((order_id, mi_id, qty, unit_price, line_total, unit_cost))

        cur.executemany(
            "INSERT INTO dbo.Order_Items (OrderId, MenuItemId, Quantity, UnitPrice, TotalPrice, UnitCost, CreatedAt, UpdatedAt) "
            "VALUES (?, ?, ?, ?, ?, ?, GETUTCDATE(), GETUTCDATE())",
            detail_rows,
        )
        conn.commit()

        lines_inserted += len(detail_rows)
        print(f"  +{len(orders_batch):,} orders / +{len(detail_rows):,} lines (total new lines: {lines_inserted:,} / {shortfall:,})", flush=True)

    print("Orders / Order_Items scale-up complete.", flush=True)


def scale_ratings(conn) -> None:
    cur = conn.cursor()
    cur.fast_executemany = True

    cur.execute("SELECT COUNT(*) FROM Ratings")
    current = cur.fetchone()[0]
    if current >= TARGET_RATINGS:
        print(f"Ratings already at {current:,} (target {TARGET_RATINGS:,}) - skipping", flush=True)
        return

    shortfall = TARGET_RATINGS - current
    print(f"Ratings at {current:,}, need {shortfall:,} more", flush=True)

    modulo = max(1, int(1000000 / (shortfall * 1.2)))
    cur.execute(
        "SELECT od.OrderId, od.MenuItemId, o.CustomerId, o.BranchId, o.OrderDate "
        "FROM dbo.Order_Items od "
        "JOIN dbo.Orders o ON o.Id = od.OrderId "
        "WHERE o.CustomerId IS NOT NULL AND od.Id % " + str(modulo) + " = 0"
    )
    candidates = cur.fetchall()
    random.shuffle(candidates)
    candidates = candidates[:shortfall]

    comments_positive = ["Great taste!", "Loved it, will order again.", "Fresh and delicious.", None, None, None]
    comments_negative = ["Was cold on arrival.", "Too salty for my taste.", "Portion was smaller than expected.", None]

    batch = []
    inserted = 0
    for order_id, menu_item_id, customer_id, branch_id, order_date in candidates:
        score = random.choices([5, 4, 3, 2, 1], weights=[45, 30, 15, 6, 4])[0]
        comment = random.choice(comments_positive) if score >= 4 else random.choice(comments_negative)
        rating_date = order_date + timedelta(days=random.randint(0, 5))
        batch.append((menu_item_id, customer_id, order_id, branch_id, score, comment, rating_date, rating_date))
        if len(batch) >= 5000:
            cur.executemany(
                "INSERT INTO dbo.Ratings (MenuItemId, CustomerId, OrderId, BranchId, Score, Comment, CreatedAt, UpdatedAt) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                batch,
            )
            conn.commit()
            inserted += len(batch)
            print(f"  +{inserted:,} / {shortfall:,} ratings", flush=True)
            batch = []
    if batch:
        cur.executemany(
            "INSERT INTO dbo.Ratings (MenuItemId, CustomerId, OrderId, BranchId, Score, Comment, CreatedAt, UpdatedAt) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            batch,
        )
        conn.commit()
        inserted += len(batch)

    print(f"Ratings scale-up complete: +{inserted:,} rows.", flush=True)


def scale_wastage(conn) -> None:
    cur = conn.cursor()
    cur.fast_executemany = True

    cur.execute("SELECT COUNT(*) FROM Wastage")
    current = cur.fetchone()[0]
    if current >= TARGET_WASTAGE:
        print(f"Wastage already at {current:,} (target {TARGET_WASTAGE:,}) - skipping", flush=True)
        return

    shortfall = TARGET_WASTAGE - current
    print(f"Wastage at {current:,}, need {shortfall:,} more", flush=True)

    cur.execute("SELECT Id FROM Inventory WHERE IsDeleted = 0")
    item_ids = [r[0] for r in cur.fetchall()]
    cur.execute("SELECT Id FROM Restaurants WHERE IsDeleted = 0")
    branch_ids = [r[0] for r in cur.fetchall()]

    now = datetime.utcnow()
    history_start = now - timedelta(days=HISTORY_DAYS)

    batch = []
    inserted = 0
    for _ in range(shortfall):
        item_id = random.choice(item_ids)
        quantity = round(random.uniform(0.5, 15), 3)
        event_date = random_datetime(history_start, now)
        batch.append((
            item_id, quantity, random.choice(WASTAGE_REASONS), random.choice(branch_ids), event_date, event_date,
        ))
        if len(batch) >= 5000:
            cur.executemany(
                "INSERT INTO dbo.Wastage (InventoryItemId, Quantity, Reason, BranchId, CreatedAt, UpdatedAt) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                batch,
            )
            conn.commit()
            inserted += len(batch)
            print(f"  +{inserted:,} / {shortfall:,} wastage records", flush=True)
            batch = []
    if batch:
        cur.executemany(
            "INSERT INTO dbo.Wastage (InventoryItemId, Quantity, Reason, BranchId, CreatedAt, UpdatedAt) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            batch,
        )
        conn.commit()
        inserted += len(batch)

    print(f"Wastage scale-up complete: +{inserted:,} rows.", flush=True)


def seed_promotions(conn) -> None:
    cur = conn.cursor()
    cur.fast_executemany = True

    cur.execute("SELECT COUNT(*) FROM Promotions")
    current = cur.fetchone()[0]
    if current > 0:
        print(f"Promotions already has {current:,} rows - skipping", flush=True)
        return

    cur.execute("SELECT Id FROM Menu_Items WHERE IsDeleted = 0")
    menu_item_ids = [r[0] for r in cur.fetchall()]
    cur.execute("SELECT Id FROM Restaurants WHERE IsDeleted = 0")
    branch_ids = [r[0] for r in cur.fetchall()]

    today = date.today()
    rows = []
    for index, (name, description, discount) in enumerate(PROMOTIONS, start=1):
        start_offset = random.randint(-365, 60)
        duration = random.randint(7, 45)
        start = today + timedelta(days=start_offset)
        end = start + timedelta(days=duration)
        menu_item_id = random.choice(menu_item_ids) if random.random() < 0.4 else None
        branch_id = random.choice(branch_ids) if random.random() < 0.3 else None
        # Redeemable voucher code for the customer self-checkout "Apply" box: initials of
        # the promotion name + its index, e.g. "Weekday Lunch Deal" -> WLD01. The index
        # guarantees uniqueness even for two promotions whose names share initials.
        initials = "".join(word[0] for word in name.upper().split() if word[0].isalpha())
        code = f"{initials}{index:02d}"
        rows.append((name, description, discount, start, end, menu_item_id, branch_id, code))

    cur.executemany(
        "INSERT INTO dbo.Promotions (Name, Description, DiscountPercent, StartDate, EndDate, MenuItemId, BranchId, Code) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        rows,
    )
    conn.commit()
    print(f"Promotions seeded: +{len(rows):,} campaigns.", flush=True)


async def _resync_order_number_sequence() -> None:
    # init_db() creates each year's SEQUENCE on the app's very first startup (typically
    # against an empty Orders table, seeding it at 1) and never re-syncs an existing one.
    # This script's bulk INSERT above writes OrderNumbers directly, bypassing that
    # SEQUENCE entirely -- so without this, the sequence stays stuck near 1 and the very
    # first order placed through the API after a scale-up collides with an already-used
    # OrderNumber (a UNIQUE constraint violation). See db/sequences.py's resync() docstring.
    async with engine.connect() as conn:
        await ORDER_NUMBERS.resync(conn, date.today().year)


def main() -> None:
    print("Ensuring schema is up to date (creates Promotions if missing)...", flush=True)
    asyncio.run(init_db())

    conn = sql()
    try:
        seed_promotions(conn)
        scale_orders_and_lines(conn)
        scale_ratings(conn)
        scale_wastage(conn)
    finally:
        conn.close()

    print("Resyncing the order-number sequence past the scaled-up data...", flush=True)
    asyncio.run(_resync_order_number_sequence())
    print("Phase 2 scale-up complete.", flush=True)


if __name__ == "__main__":
    main()
