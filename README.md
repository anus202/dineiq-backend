# DineIQ — Restaurant Management & Analytics Platform

DineIQ is a full-stack restaurant operations system: point-of-sale, table seating,
inventory & recipes, customer loyalty, and a role-specific set of live dashboards, all
sitting on one FastAPI backend and SQL Server database. Every write is audited
automatically, and every number on a dashboard is computed live from the same
transactional data the POS writes — nothing is precomputed or faked.

This is a monorepo:

```
backend/              FastAPI + SQLAlchemy (async) + Microsoft SQL Server (the operational app)
frontend/             React 19 + TypeScript + Vite + Tailwind CSS + Recharts + Framer Motion
analytics-pipeline/   Separate Big Data / Spark MLlib / Python-XGBoost dual-pipeline project
                      + its own React (JSX) dashboard — see analytics-pipeline/ANALYTICS_README.md
```

> **Scope note:** `backend/` and `frontend/` are the operational restaurant management
> system (POS, inventory, RBAC, branch-scoped dashboards, loyalty) — fully built and
> tested against a real SQL Server database. `analytics-pipeline/` is a **separate**
> Big Data / Data Science project (its own SRS, its own database read-only against the
> same MSSQL instance, its own React app) — its code is written but has not yet been
> executed end-to-end (no trained models or Parquet output exist yet). See
> `analytics-pipeline/ANALYTICS_README.md` for its own setup and status.

---

## Table of contents

1. [Tech stack](#tech-stack)
2. [Project structure](#project-structure)
3. [Roles & permissions](#roles--permissions)
4. [Database schema (15 tables)](#database-schema-15-tables)
5. [Business rules that aren't obvious from the schema](#business-rules-that-arent-obvious-from-the-schema)
6. [API reference (60 endpoints)](#api-reference-60-endpoints)
7. [Frontend pages](#frontend-pages)
8. [Setup & running it](#setup--running-it)
9. [Demo accounts](#demo-accounts)
10. [Testing](#testing)
11. [Environment variables](#environment-variables)
12. [Known limitations](#known-limitations)

---

## Tech stack

**Backend** (`backend/requirements.txt`)

| Package | Version | Role |
|---|---|---|
| FastAPI | 0.141.1 | Web framework |
| SQLAlchemy | 2.0.54 | Async ORM |
| aioodbc | 0.5.0 | Async SQL Server driver (wraps pyodbc) |
| pyodbc | 5.3.0 | ODBC driver for SQL Server |
| PyJWT | 2.15.0 | JWT signing/verification |
| pwdlib[bcrypt] | 0.3.1 | Password hashing |
| pydantic | 2.13.5 | Request/response validation |
| python-multipart | 0.0.32 | Required for the OAuth2 form login used by Swagger's Authorize button |
| uvicorn | 0.53.0 | ASGI server |

Database: **Microsoft SQL Server** (tested against SQL Server 2025 / ODBC Driver 17).

**Frontend** (`frontend/package.json`)

| Package | Version | Role |
|---|---|---|
| React | 19.3 | UI |
| TypeScript | 7.0 | Types |
| Vite | 8.3 | Dev server & build |
| Tailwind CSS | 4.3 | Styling (via `@tailwindcss/vite`) |
| React Router | 7.18 | Routing + role-based route guards |
| Axios | 1.20 | HTTP client with a JWT interceptor |
| Recharts | 3.10 | Revenue trend / top-items charts |
| Framer Motion | 13.4 | Animation (modals, drawers, page transitions) |
| Playwright | 1.63 | End-to-end tests (dev dependency) |

---

## Project structure

```
backend/
  app/
    controllers/     FastAPI routers — HTTP only (parse request, call a service, shape the response)
    services/        Business logic + all database queries
    models/          SQLAlchemy ORM tables
    schemas/         Pydantic request/response models
    core/            config.py, security.py (JWT + password hashing), roles.py, dependencies.py
                      (get_current_user / require_roles), audit.py (audit-log engine)
    db/              session.py (async engine), init_db.py (startup: create DB, tables, roles,
                      migrations, sequences), migrations.py, sequences.py
    main.py          FastAPI app, CORS, middleware, router registration
  scripts/
    seed_demo_data.py  Creates the 4 demo staff/customer accounts + sample tables/inventory/recipes
  requirements.txt
  .env.example

frontend/
  src/
    pages/            One page per dashboard (AdminDashboard, InventoryDashboard, PosDashboard,
                       CustomerPortal, LoginPage, RegisterPage)
    components/
      ui/             Generic components: Button, Modal, Drawer, DataTable<T>, StatsCard, Badge,
                       ShimmerSkeleton, Toast, FormField, ConfirmDialog, EmptyState
      layout/         AppLayout (sidebar + header), ProtectedRoute (role guard), Tabs
      charts/         RevenueTrendChart, HourlyHeatmap, RFMMatrix, TopItemsChart
      admin/          CategoryManager, MenuItemMapper, CustomerSearch, AuditLogTable
      inventory/      StockStatusMatrix, InventoryItemFormModal, StockAdjustmentForm,
                       RecipeBuilderModal, MovementLogTable
      pos/            FloorPlan, OrderBuilder, SettlementDrawer, InvoiceReceipt
      customer/       LoyaltyProgress, OrderTracker, Recommendations
    services/         api.ts (Axios instance + JWT storage), endpoints.ts (typed API calls)
    types/api.ts      TypeScript types mirroring every backend Pydantic schema
    context/          AuthContext (session state, login/logout, auto-logout on 401)
    hooks/useApi.ts   Generic data-fetching hook (loading/error/reload, optional polling)
  e2e/                Playwright test suite (see Testing)
```

**Architecture pattern (backend):** strict 4-layer separation per feature —
`controller → service → model`, with `schema` used at the controller boundary for
input/output. Controllers never touch SQLAlchemy directly; services never touch
`Request`/`HTTPException` wiring beyond raising typed exceptions the controller maps to
HTTP status codes.

---

## Roles & permissions

Defined in `backend/app/core/roles.py`. Every endpoint is protected by
`require_roles([...])`, a FastAPI dependency that returns **401** if there's no valid
token and **403** if the token's role isn't in the allowed list. **`SUPER_ADMIN` passes
every staff-only check automatically** (it's added to every `require_roles` list except
the customer portal's).

| Role | Can do |
|---|---|
| **SUPER_ADMIN** | Everything `ADMIN` can, plus: create other `ADMIN`/`SUPER_ADMIN` accounts and change any account's role. The only role that can grant admin-level access. |
| **ADMIN** | Executive Dashboard (KPIs, revenue chart, heatmap, RFM matrix, top items), category & menu CRUD, customer search + RFM, audit log, user management (except creating/demoting admins), everything CASHIER and INVENTORY_MANAGER can do. |
| **INVENTORY_MANAGER** | Inventory Dashboard: stock status, stock movement log, manual stock adjustment (reason required), recipe builder. Read access to menu/categories. |
| **CASHIER** | POS & Tables: floor plan, seat/reserve/free tables, build & place orders, settle bills (Cash/Card/Loyalty Points), print invoices, customer lookup. |
| **CUSTOMER** | Customer Portal only: own profile, loyalty tier & points, live order tracking, personalised recommendations. Cannot reach any staff dashboard even by typing the URL directly (both the frontend route guard and every backend endpoint reject it). |

A public visitor (no token) can only reach `POST /api/v1/auth/signup` and
`POST /api/v1/auth/login` — every other endpoint returns 401.

**Self-registration** (`POST /api/v1/auth/signup`) always creates a `CUSTOMER` account.
Staff accounts (`ADMIN`, `INVENTORY_MANAGER`, `CASHIER`) can only be created by an
existing `ADMIN`/`SUPER_ADMIN` via `POST /api/v1/users`.

If a phone number is given at signup, it either creates a new `tbl_Customer` profile or
links to an *existing* one — but only if that profile's phone **and** email both match
what was submitted. Otherwise the signup is refused with `409 Conflict`, so nobody can
claim someone else's order history and loyalty points by guessing their phone number.

---

## Database schema (15 tables)

Every table (except `tbl_AuditLog`, which is append-only) has the standard audit columns
`CreatedBy`, `UpdatedBy`, `CreatedAt`, `UpdatedAt`, `IsActive`, `IsDeleted` from a shared
`CommonFields` base class. Deletes are **soft deletes** (`IsDeleted = 1`) everywhere
except stock/audit log rows, which are never deleted.

| Table | Purpose |
|---|---|
| `tbl_Role` | The 5 roles, seeded automatically on startup. |
| `tbl_Signup` | Login accounts (staff and customers). Has `RoleId` and an optional `CustomerId` link. |
| `tbl_Login` | One row per login attempt (success or failure), with IP address. |
| `tbl_Category` | Menu categories. |
| `tbl_MenuItem` | Dishes: price, cost, availability, category. |
| `tbl_PricingHistory` | One row per price a menu item has ever had (initial price + every change). |
| `tbl_Customer` | Customer profiles: name, phone (unique), email, address, `LoyaltyPoints` balance. |
| `tbl_DiningTable` | Physical tables: number, capacity, status (`AVAILABLE` / `OCCUPIED` / `RESERVED`). |
| `tbl_Orders` | Order header: number, type (Dine-in/Takeaway/Delivery), status, totals, discount, optional customer & table. |
| `tbl_OrderDetails` | Order line items: menu item, quantity, unit price *and unit cost at the time of the order* (so later menu-price changes don't rewrite historical profit). |
| `tbl_InventoryItem` | Raw materials: name, unit (kg/liters/pcs), current stock, reorder level, unit cost. |
| `tbl_Recipe` | How much of each inventory item one serving of a menu item uses. |
| `tbl_StockMovementLog` | Every stock change: opening stock, manual addition/deduction (with a mandatory reason), or automatic deduction when an order completes. |
| `tbl_Payment` | One row per settled bill: subtotal, order discount, loyalty-tier discount, points redeemed/earned, amount tendered, change due — everything needed to reprint the invoice. |
| `tbl_AuditLog` | Automatic trail of every create/update/delete on the tables above, plus logins, status changes, stock adjustments, table assignments and points changes — who, what, old value, new value, IP, when. |

**Order & invoice numbers** (`ORD-2026-000001`, `INV-2026-000001`) come from a SQL
Server `SEQUENCE`, one per document type per year — chosen specifically because a
`SEQUENCE` hands out the next number without holding a lock, so concurrent orders never
block each other or collide.

---

## Business rules that aren't obvious from the schema

**Loyalty tiers** (`backend/app/services/loyalty_service.py`, tunable via `.env`):

| Tier | Points balance | Discount on every bill |
|---|---|---|
| Silver | 0+ | 0% |
| Gold | 200+ | 5% |
| Platinum | 400+ | 10% |

Customers earn **1 point per 100 PKR** paid by Cash or Card (not on the portion paid by
points). 1 point redeems for **1 PKR** off a bill. Tier is based on the *current* points
balance, so spending points can drop you back a tier.

**Settling a bill** (`POST /api/v1/payments/settle`) applies discounts in this order:
1. The order's own discount (set when the order was created).
2. The customer's loyalty-tier discount, on what's left.
3. Loyalty points redemption, up to the remaining amount due.

Then, in one database transaction: the order is marked `Completed`, its ingredients are
deducted from stock (via each menu item's recipe), its table is freed, the customer's
points balance is updated, and the invoice is recorded. If any step fails, everything
rolls back — a bill is never half-settled.

**Order status** can only move `Pending → Completed` or `Pending → Cancelled`.
`Completed` and `Cancelled` are final.

**Stock deduction** happens automatically and only when an order is completed (not when
it's placed) — one set-based SQL `UPDATE` subtracts `recipe quantity × ordered quantity`
for every ingredient at once, so two orders completing at the same instant can't lose
each other's deductions. A menu item with no recipe simply uses no stock.

**RFM segmentation** (`GET /api/v1/analytics/rfm-segmentation`) scores every customer
with at least one completed order on Recency, Frequency and Monetary value (1–5 each,
relative to all purchasing customers) and buckets them into segments — *VIP High
Spenders, Loyal Regulars, At Risk, New Customers, Hibernating, Needs Attention*. All
scoring happens in SQL Server (window functions), not in Python.

**All monetary/date aggregation happens in the database.** Analytics endpoints never
pull raw rows into Python and sum them there — every KPI, chart point, and heatmap cell
is a `SUM`/`COUNT`/`GROUP BY` computed by SQL Server, so the numbers scale to the full
dataset (this project's dev database has 500,000 customers and 50,000 orders) without
loading them into memory.

**Audit logging is automatic**, not something each endpoint has to remember to call. A
SQLAlchemy `after_flush` hook (`backend/app/core/audit.py`) inspects every row created,
changed or soft-deleted in that request and writes a matching `tbl_AuditLog` row with the
old and new values (passwords are masked as `"***"`). Changes made through raw
conditional `UPDATE` statements (status changes, stock adjustments, table assignment,
points changes — used specifically to avoid race conditions) aren't visible to that
hook, so those call `audit.record(...)` explicitly instead.

---

## API reference (60 endpoints)

Base URL: `http://localhost:8000/api/v1`. Interactive docs (Swagger UI) at
`http://localhost:8000/docs` — every request/response shape shown there is generated
from the same Pydantic schemas the API actually uses. All timestamps are UTC.

Legend: **401** = no/invalid token, **403** = wrong role for the endpoint.

### Authentication & Roles

| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/auth/signup` | Public | Register as a customer. Optionally links/creates a `tbl_Customer` profile from the phone number. |
| POST | `/auth/login` | Public | JSON login → `{Token, Data}`. |
| POST | `/auth/token` | Public | OAuth2 password-flow login (form fields `username`/`password`) — this is what Swagger's **Authorize** button calls. |
| GET | `/auth/me` | Any logged-in user | The current account and its role. |
| GET | `/auth/roles` | ADMIN | List all 5 roles. |
| GET | `/users` | ADMIN | List/search accounts, filterable by role. |
| POST | `/users` | ADMIN | Create a staff account with a chosen role (only SUPER_ADMIN can create ADMIN/SUPER_ADMIN). |
| PUT | `/users/{id}/role` | ADMIN | Change an account's role (can't change your own; only SUPER_ADMIN can touch admin-level roles). |

### Categories

| Method | Path | Access |
|---|---|---|
| GET | `/categories` | Any logged-in user |
| POST | `/categories` | ADMIN |
| GET | `/categories/{id}` | Any logged-in user |
| PUT | `/categories/{id}` | ADMIN |
| DELETE | `/categories/{id}` | ADMIN (soft delete) |

### Menu Management

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/menu-items` | ADMIN | Records the initial price in `tbl_PricingHistory`. |
| GET | `/menu-items` | Any logged-in user | Paginated; filter by category, availability, name search. |
| GET | `/menu-items/{id}` | Any logged-in user | |
| PUT | `/menu-items/{id}` | ADMIN | Full or partial update; a price change is logged to `tbl_PricingHistory`. |
| DELETE | `/menu-items/{id}` | ADMIN | Soft delete. |

### Orders & Sales

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/orders` | ADMIN, CASHIER | Prices always come from the current menu (never trusts client-sent prices). |
| GET | `/orders` | ADMIN, CASHIER | Paginated; filter by status, type, customer, date range. |
| GET | `/orders/{id}` | ADMIN, CASHIER | Full order with line items. |
| PUT | `/orders/{id}/status` | ADMIN, CASHIER | `Pending → Completed` or `Pending → Cancelled` only. |

### Customers

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/customers` | ADMIN, CASHIER | Phone must be unique. |
| GET | `/customers` | ADMIN, CASHIER | Server-paged search over the full customer table by name or phone. |
| GET | `/customers/{id}` | ADMIN, CASHIER | Profile + lifetime stats + recent orders. |
| PUT | `/customers/{id}` | ADMIN, CASHIER | Partial update. |
| GET | `/customers/{id}/analytics` | ADMIN | Individual RFM score and segment. |

### Inventory

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/inventory/items` | ADMIN, INVENTORY_MANAGER | |
| GET | `/inventory/items` | ADMIN, INVENTORY_MANAGER | Search, low-stock-only filter. |
| GET | `/inventory/alerts/low-stock` | ADMIN, INVENTORY_MANAGER | Items at/below their reorder level. |
| GET | `/inventory/items/{id}` | ADMIN, INVENTORY_MANAGER | |
| PUT | `/inventory/items/{id}` | ADMIN, INVENTORY_MANAGER | Name/unit/reorder level/cost — **not** the stock quantity. |
| DELETE | `/inventory/items/{id}` | ADMIN, INVENTORY_MANAGER | Soft delete; refused while any recipe still uses the item. |
| GET | `/inventory/recipes/{menu_item_id}` | ADMIN, INVENTORY_MANAGER | |
| PUT | `/inventory/recipes/{menu_item_id}` | ADMIN, INVENTORY_MANAGER | Replaces the whole recipe. |
| POST | `/inventory/adjust` | ADMIN, INVENTORY_MANAGER | Manual stock change; **reason is mandatory** and logged. |

### Table Management

| Method | Path | Access | Notes |
|---|---|---|---|
| GET | `/tables` | ADMIN, CASHIER | Every table's status and, if occupied, its seated order. |
| POST | `/tables` | ADMIN | Add a table. |
| POST | `/tables/assign` | ADMIN, CASHIER | Seat a Pending Dine-in order at an available/reserved table; sets Pax. Race-safe (two cashiers can't seat two parties at one table). |
| PUT | `/tables/{id}/status` | ADMIN, CASHIER | Reserve or free a table (an occupied table can only be freed by settling/cancelling its order). |

### Payments & Invoices

| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/payments/preview` | ADMIN, CASHIER | Computes the bill (discounts, points, change) without saving anything. |
| POST | `/payments/settle` | ADMIN, CASHIER | Pays the bill (Cash/Card/Loyalty Points), completes the order, deducts stock, frees the table, updates points, returns the invoice. |
| GET | `/payments/invoices/{invoice_number}` | ADMIN, CASHIER | Reprint. |

### Sales Analytics (ADMIN only)

| Method | Path | Description |
|---|---|---|
| GET | `/analytics/overview` | Revenue, profit, AOV, ASPG (Average Spend Per Guest) for completed orders in a date range. |
| GET | `/analytics/peak-hours` | Orders grouped by hour of day. |
| GET | `/analytics/hourly-heatmap` | Orders grouped by weekday × hour (168 cells) — powers the dashboard heatmap. |
| GET | `/analytics/top-performing-items` | Top dishes by quantity sold and by revenue. |
| GET | `/analytics/rfm-segmentation` | Customer segments (see [RFM segmentation](#business-rules-that-arent-obvious-from-the-schema) above). |
| GET | `/analytics/rfm-matrix` | Customer counts per Recency×Frequency and Recency×Monetary score cell. |

### Admin Dashboard (ADMIN only)

| Method | Path | Description |
|---|---|---|
| GET | `/dashboard/admin/summary` | Today's sales, orders, active tables, low-stock count, pending orders. |
| GET | `/dashboard/admin/revenue-chart` | Daily + monthly revenue points for the trend chart. |
| GET | `/dashboard/admin/top-performing` | Top 5 dishes + top-spending customer segments, in one call. |

### Inventory Dashboard (ADMIN, INVENTORY_MANAGER)

| Method | Path | Description |
|---|---|---|
| GET | `/dashboard/inventory/stock-status` | Low-stock / out-of-stock lists and total stock valuation. |
| GET | `/dashboard/inventory/movement-logs` | The stock movement audit trail, filterable. |
| POST | `/inventory/adjust` | Manual stock change (reason mandatory, logged). Its path stays under `/inventory` since it acts on an inventory item, but Swagger tags it "Inventory Dashboard" — it isn't listed again under the Inventory table above. |

### Customer Dashboard (CUSTOMER only)

| Method | Path | Description |
|---|---|---|
| GET | `/dashboard/customer/me` | Own profile, points balance, tier, lifetime stats. |
| GET | `/dashboard/customer/my-orders` | Own orders with a live tracking status (`Order received` → `Being served at table X` / `Preparing for delivery` → `Completed & paid`). |
| GET | `/dashboard/customer/recommendations` | Dishes recommended from order history (repeat dishes first, then favourite-category best-sellers, then overall best-sellers for new customers). |

### Audit Logs (ADMIN only)

| Method | Path | Description |
|---|---|---|
| GET | `/audit-logs` | The full trail, filterable by user, action, entity, entity ID, date range. |
| GET | `/audit-logs/filters` | The distinct action/entity values present, to populate filter dropdowns. |

---

## Frontend pages

| Route | Who sees it | What's on it |
|---|---|---|
| `/login`, `/register` | Public | Sign in; self-registration (always creates a CUSTOMER). |
| `/admin` | ADMIN, SUPER_ADMIN | Tabs: **Overview** (KPI cards, revenue trend, hourly heatmap, RFM matrix, top performers), **Categories** (CRUD), **Menu Item Mapper** (CRUD with margin shown live), **Customer Search** (server-paged over the full customer table, opens a profile with RFM), **Audit Logs** (filterable, expandable old/new values). |
| `/inventory` | ADMIN, INVENTORY_MANAGER, SUPER_ADMIN | Stock status matrix (green/yellow/red health tiles), manual stock adjustment form (mandatory reason), recipe builder, stock movement log. |
| `/pos` | ADMIN, CASHIER, SUPER_ADMIN | Seating floor plan, order builder (dish picker + cart + customer lookup), settlement drawer (Cash/Card/Points with live bill preview), printable invoice. |
| `/customer` | CUSTOMER | Loyalty progress bar (Silver→Gold→Platinum), live order tracker, personalised recommendations. |

Route guards (`ProtectedRoute.tsx`) redirect a signed-in user with the wrong role to
*their own* dashboard rather than showing an error — matching what the backend would do
anyway (403), but without a round trip. Each dashboard is its own lazy-loaded chunk, so
(for example) a cashier's browser never downloads the admin charting library.

---

## Setup & running it

### Prerequisites
- Python (developed and run on 3.14) and a SQL Server instance reachable with the ODBC
  Driver 17 for SQL Server installed.
- Node.js (developed and run on 24.x).

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows; use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
copy .env.example .env        # then fill in DB_PASSWORD and JWT_SECRET_KEY
python -m uvicorn app.main:app --reload
```

On startup the app **automatically**: creates the `DineIQ` database if missing, creates
every table, seeds the 5 roles, runs any pending schema migrations (adding columns to
tables from earlier versions), and creates this year's order/invoice number sequences.
No manual migration step is needed.

Optional: seed demo accounts, tables, inventory and recipes (safe to re-run):

```bash
python scripts/seed_demo_data.py
```

### Frontend

```bash
cd frontend
npm install
copy .env.example .env        # VITE_API_BASE_URL, default http://localhost:8000/api/v1
npm run dev
```

Open **http://localhost:5173**. Interactive API docs: **http://localhost:8000/docs**.

---

## Demo accounts

Created by `backend/scripts/seed_demo_data.py`. Password for all of them: **`Demo@12345`**
(configurable via `DEMO_PASSWORD` in the script's environment).

| Role | Email |
|---|---|
| ADMIN | `admin@dineiq.demo` |
| RESTAURANT_MANAGER | `manager@dineiq.demo` |
| INVENTORY_MANAGER | `inventory@dineiq.demo` |
| CASHIER | `cashier@dineiq.demo` |
| CUSTOMER | linked to an existing seeded customer profile |

There is no seeded `SUPER_ADMIN`. In a fresh database, `POST /auth/signup` always
creates a `CUSTOMER` account (there's no admin yet who could create a staff account
through the API) — so `seed_demo_data.py` signs up its `admin@dineiq.demo` account
normally and then promotes *that one account* to `ADMIN` with a direct SQL update
(`UPDATE tbl_Signup SET RoleId = (SELECT Id FROM tbl_Role WHERE Name = 'ADMIN') WHERE
Email = 'admin@dineiq.demo'`). Every other account after that — `RESTAURANT_MANAGER`,
`INVENTORY_MANAGER`, `CASHIER`, and any further `ADMIN` — is created normally through `POST /api/v1/users`
once logged in as that first admin. To get a `SUPER_ADMIN`, promote an account to
`SUPER_ADMIN` the same way (by direct SQL update), since no endpoint can create one from
scratch.

---

## Testing

End-to-end tests (`frontend/e2e/`, Playwright) cover all five roles against the real
running backend and database — not mocks:

| File | Covers |
|---|---|
| `01-auth.spec.ts` | Login for every role, wrong password, role-based redirects, sign out. |
| `02-admin.spec.ts` | KPI cards/charts, category CRUD, menu item CRUD, customer search + RFM, audit log. |
| `03-inventory.spec.ts` | Stock health matrix, item CRUD, stock adjustment (with reason validation), recipe builder. |
| `04-pos.spec.ts` | Floor plan, seating a dine-in order, cash/card settlement, invoice contents. |
| `05-customer.spec.ts` | Loyalty progress, live order tracking, recommendations, portal access restriction. |

```bash
cd frontend
npx playwright test
```

A `globalSetup` step warms the heaviest analytics/search queries once before the suite
runs, since the dev database (500k customers, 50k orders) can be slow on a cold cache.

---

## Environment variables

**Backend** (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_DRIVER` | — | SQL Server connection. |
| `JWT_SECRET_KEY` | — (required) | Signs access tokens. |
| `JWT_ALGORITHM` | `HS256` | |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | |
| `BUSINESS_UTC_OFFSET_MINUTES` | `300` (Pakistan Standard Time) | Business-day/hour boundary for "today", the revenue chart and the heatmap. |
| `RESTAURANT_NAME` | `DineIQ Restaurant` | Printed on invoices. |
| `LOYALTY_POINTS_PER_100` | `1` | Points earned per 100 PKR paid by cash/card. |
| `LOYALTY_POINT_VALUE_PKR` | `1` | PKR value of 1 redeemed point. |
| `TIER_GOLD_MIN_POINTS` / `TIER_PLATINUM_MIN_POINTS` | `200` / `400` | Points balance needed for each tier. |
| `TIER_SILVER_DISCOUNT_PERCENT` / `..._GOLD_..` / `..._PLATINUM_..` | `0` / `5` / `10` | Bill discount per tier. |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Browser origins allowed to call the API. |

**Frontend** (`frontend/.env`)

| Variable | Default |
|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` |

---

## Known limitations

- No tax/GST line on invoices — not specified, so not implemented.
- No password-reset flow (forgot-password) yet.
- `uvicorn --reload` has been observed to occasionally leave a stale worker process
  running on Windows after editing a file; if code changes don't seem to take effect,
  stop and restart the server rather than relying on the auto-reloader.
- The dev/test SQL Server instance used while building this can be memory-constrained;
  the very first analytics query after a cold start can take noticeably longer than
  subsequent ones (SQL Server's buffer pool has to warm up).
