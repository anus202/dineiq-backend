"""Create demo accounts, dining tables, inventory and recipes for reviewing the UI.

Safe to run repeatedly: anything that already exists is left alone.

    cd backend
    .venv\\Scripts\\python scripts\\seed_demo_data.py            # API at http://localhost:8000

The first ADMIN has to be bootstrapped in SQL (a fresh system has no admin to create
one through the API); everything else goes through the API, so it is validated,
audited and stock-logged like real use.
"""
import os
import sys
from pathlib import Path

import httpx
import pyodbc
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
API = os.getenv("SEED_API_URL", "http://localhost:8000/api/v1")
PASSWORD = os.getenv("DEMO_PASSWORD", "Demo@12345")

ADMIN = {"FullName": "Demo Admin", "Email": "admin@dineiq.demo"}
STAFF = [
    {"FullName": "Demo Branch Manager", "Email": "manager@dineiq.demo", "Role": "RESTAURANT_MANAGER"},
    {"FullName": "Demo Inventory Manager", "Email": "inventory@dineiq.demo", "Role": "INVENTORY_MANAGER"},
    {"FullName": "Demo Cashier", "Email": "cashier@dineiq.demo", "Role": "CASHIER"},
]
# A customer from the dataset with order history; signing up with the same phone and
# email links the login to that profile.
CUSTOMER_ID = 36542

TABLES = [(f"T-{n:02d}", cap) for n, cap in enumerate([2, 2, 4, 4, 4, 4, 6, 6, 8, 2, 4, 10], start=1)]

# (name, unit, current stock, reorder level, unit cost PKR). A few start low / out of
# stock so every stock-health colour appears on the dashboard.
INVENTORY = [
    ("Basmati Rice", "kg", 120, 30, 320),
    ("Chicken (boneless)", "kg", 60, 20, 950),
    ("Chicken Wings", "kg", 18, 15, 780),
    ("Mutton", "kg", 8, 10, 2400),
    ("Cooking Oil", "liters", 45, 15, 560),
    ("Yogurt", "kg", 12, 8, 280),
    ("Onions", "kg", 40, 15, 140),
    ("Tomatoes", "kg", 6, 10, 180),
    ("Potatoes", "kg", 70, 20, 110),
    ("Garlic Bread Loaf", "pcs", 25, 20, 90),
    ("Mozzarella Cheese", "kg", 0, 5, 2100),
    ("Biryani Masala", "kg", 3, 2, 1600),
]
# menu item id -> [(inventory item name, quantity per serving)]
RECIPES = {
    27: [("Basmati Rice", 0.25), ("Chicken (boneless)", 0.2), ("Cooking Oil", 0.03), ("Yogurt", 0.05), ("Onions", 0.06), ("Biryani Masala", 0.01)],
    31: [("Basmati Rice", 0.25), ("Mutton", 0.22), ("Cooking Oil", 0.03), ("Yogurt", 0.05), ("Onions", 0.06), ("Biryani Masala", 0.012)],
    25: [("Chicken (boneless)", 0.9), ("Tomatoes", 0.4), ("Cooking Oil", 0.1), ("Onions", 0.15)],
    5: [("Chicken Wings", 0.35), ("Cooking Oil", 0.08)],
    11: [("Potatoes", 0.3), ("Cooking Oil", 0.05)],
    6: [("Garlic Bread Loaf", 1), ("Mozzarella Cheese", 0.05)],
}


def sql():
    return pyodbc.connect(
        f"Driver={{{os.getenv('DB_DRIVER', 'ODBC Driver 17 for SQL Server')}}};Server={os.getenv('DB_SERVER', '.')};"
        f"Database={os.getenv('DB_NAME', 'DineIQ')};UID={os.getenv('DB_USER', 'sa')};PWD={os.getenv('DB_PASSWORD', '')};"
        "TrustServerCertificate=yes",
        autocommit=True,
    )


def login(client: httpx.Client, email: str) -> dict:
    r = client.post(f"{API}/auth/login", json={"Email": email, "Password": PASSWORD})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['Token']}"}


def ok(r: httpx.Response, *expected_errors: int) -> bool:
    if r.status_code < 300:
        return True
    if r.status_code in expected_errors:
        return False
    sys.exit(f"{r.request.method} {r.request.url} -> {r.status_code} {r.text}")


def main() -> None:
    client = httpx.Client(timeout=300)
    db = sql()

    # 1. Admin (bootstrap: sign up, then promote in SQL once).
    ok(client.post(f"{API}/auth/signup", json={**ADMIN, "Password": PASSWORD}), 400)
    db.execute(
        "UPDATE tbl_Signup SET RoleId = (SELECT Id FROM tbl_Role WHERE Name = 'ADMIN') "
        "WHERE Email = ? AND RoleId = (SELECT Id FROM tbl_Role WHERE Name = 'CUSTOMER')",
        ADMIN["Email"],
    )
    admin = login(client, ADMIN["Email"])
    print("admin ready:", ADMIN["Email"])

    # 2. Staff, created by the admin through the API.
    for member in STAFF:
        created = ok(client.post(f"{API}/users", headers=admin, json={**member, "Password": PASSWORD}), 400)
        print(f"{'created' if created else 'exists '} {member['Role']:18} {member['Email']}")

    # RESTAURANT_MANAGER and INVENTORY_MANAGER are branch-scoped roles (see
    # BRANCH_SCOPED_ROLES) -- without an assigned branch, every branch-scoped endpoint
    # they call 400s. Assign the first active branch so the demo accounts actually work,
    # whether they were just created above or already existed without one.
    demo_branch = db.execute("SELECT TOP 1 Id, BranchName FROM Restaurants WHERE IsActive = 1 ORDER BY Id").fetchone()
    if demo_branch:
        for member in STAFF:
            if member["Role"] in ("RESTAURANT_MANAGER", "INVENTORY_MANAGER"):
                db.execute("UPDATE tbl_Signup SET BranchId = ? WHERE Email = ? AND BranchId IS NULL", demo_branch.Id, member["Email"])
        print(f"branch-scoped demo staff assigned to: {demo_branch.BranchName} (#{demo_branch.Id})")

    # 3. Customer login linked to a dataset customer (same phone + email).
    customer = db.execute("SELECT Name, Phone, Email FROM Customers WHERE Id = ?", CUSTOMER_ID).fetchone()
    created = ok(
        client.post(
            f"{API}/auth/signup",
            json={"FullName": customer.Name, "Email": customer.Email, "PhoneNumber": customer.Phone, "Password": PASSWORD},
        ),
        400,
    )
    print(f"{'created' if created else 'exists '} CUSTOMER           {customer.Email} (customer #{CUSTOMER_ID})")

    # 4. Dining tables.
    for number, capacity in TABLES:
        ok(client.post(f"{API}/tables", headers=admin, json={"TableNumber": number, "Capacity": capacity}), 409)
    print(f"tables: {len(TABLES)} ensured")

    # 5. Inventory and recipes (as the inventory manager).
    inventory = login(client, "inventory@dineiq.demo")
    existing = {i["ItemName"]: i["Id"] for i in client.get(f"{API}/inventory/items?limit=200", headers=inventory).json()["Items"]}
    for name, unit, stock, reorder, cost in INVENTORY:
        if name not in existing:
            r = client.post(
                f"{API}/inventory/items",
                headers=inventory,
                json={"ItemName": name, "Unit": unit, "CurrentStock": stock, "ReorderLevel": reorder, "UnitCost": cost},
            )
            ok(r)
            existing[name] = r.json()["Id"]
    print(f"inventory items: {len(INVENTORY)} ensured")
    for menu_item_id, lines in RECIPES.items():
        current = client.get(f"{API}/inventory/recipes/{menu_item_id}", headers=inventory).json()
        if not current["Lines"]:
            ok(
                client.put(
                    f"{API}/inventory/recipes/{menu_item_id}",
                    headers=inventory,
                    json={"Lines": [{"InventoryItemId": existing[n], "QuantityRequired": q} for n, q in lines]},
                )
            )
    print(f"recipes: {len(RECIPES)} ensured")
    print(f"\nAll demo accounts use the password: {PASSWORD}")


if __name__ == "__main__":
    main()
