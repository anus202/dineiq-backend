"""Schema changes to tables that already exist.

Base.metadata.create_all() only creates missing tables; it never adds columns to an
existing one. Each step here checks first, so running on every startup is safe, and a
fresh database (where create_all already built the full table) skips them all.

Each statement runs on its own: SQL Server compiles a batch up front, so a statement
using a column added earlier in the same batch would fail.
"""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

# Old table name -> the SRS's name for it. sp_rename is metadata-only (no data copy), so
# this is safe to run against a live, populated table. MUST run before
# Base.metadata.create_all(): the ORM models below already declare the NEW names, so
# create_all would otherwise see them as missing and create brand-new EMPTY tables
# alongside the old, still-populated ones instead of renaming in place.
TABLE_RENAMES = [
    ("tbl_Customer", "Customers"),
    ("tbl_Orders", "Orders"),
    ("tbl_OrderDetails", "Order_Items"),
    ("tbl_MenuItem", "Menu_Items"),
    ("tbl_Category", "Menu_Categories"),
    ("tbl_RestaurantBranch", "Restaurants"),
    ("tbl_PricingHistory", "Pricing_History"),
    ("tbl_Promotion", "Promotions"),
    ("tbl_Rating", "Ratings"),
    ("tbl_InventoryItem", "Inventory"),
]


async def rename_legacy_tables(conn: AsyncConnection) -> list[str]:
    """Call before Base.metadata.create_all(). Renames each old-named table to its new
    name if the old one still exists and the new one doesn't yet -- a no-op on a fresh
    database (neither exists) and on every startup after the first (only the new name
    exists)."""
    renamed = []
    for old, new in TABLE_RENAMES:
        check = await conn.execute(
            text(f"SELECT 1 WHERE OBJECT_ID('dbo.{old}') IS NOT NULL AND OBJECT_ID('dbo.{new}') IS NULL")
        )
        if check.first() is not None:
            await conn.execute(text(f"EXEC sp_rename 'dbo.{old}', '{new}'"))
            renamed.append(f"{old} -> {new}")
    return renamed


# (description, "already applied?" query returning a row if so, statement)
MIGRATIONS = [
    (
        "tbl_Orders.CustomerId",
        "SELECT 1 WHERE COL_LENGTH('dbo.Orders', 'CustomerId') IS NOT NULL",
        "ALTER TABLE dbo.Orders ADD CustomerId INT NULL "
        "CONSTRAINT FK_tbl_Orders_CustomerId REFERENCES dbo.Customers (Id)",
    ),
    (
        "index on tbl_Orders.CustomerId",
        "SELECT 1 FROM sys.indexes WHERE name = 'ix_tbl_Orders_CustomerId' AND object_id = OBJECT_ID('dbo.Orders')",
        "CREATE INDEX ix_tbl_Orders_CustomerId ON dbo.Orders (CustomerId)",
    ),
    (
        "tbl_Orders.GuestCount",
        "SELECT 1 WHERE COL_LENGTH('dbo.Orders', 'GuestCount') IS NOT NULL",
        # NOT NULL + DEFAULT fills existing orders with 1.
        "ALTER TABLE dbo.Orders ADD GuestCount INT NOT NULL "
        "CONSTRAINT DF_tbl_Orders_GuestCount DEFAULT 1 "
        "CONSTRAINT CK_tbl_Orders_GuestCount CHECK (GuestCount > 0)",
    ),
    (
        "tbl_OrderDetails.UnitCost",
        "SELECT 1 WHERE COL_LENGTH('dbo.Order_Items', 'UnitCost') IS NOT NULL",
        "ALTER TABLE dbo.Order_Items ADD UnitCost DECIMAL(10, 2) NULL",
    ),
    (
        "analytics index on tbl_Orders (Status, OrderDate)",
        "SELECT 1 FROM sys.indexes WHERE name = 'ix_tbl_Orders_Status_OrderDate' AND object_id = OBJECT_ID('dbo.Orders')",
        "CREATE INDEX ix_tbl_Orders_Status_OrderDate ON dbo.Orders (Status, OrderDate) "
        "INCLUDE (CustomerId, GuestCount, TotalAmount, Discount, NetAmount, IsDeleted)",
    ),
    (
        "index on tbl_Customer.CreatedAt",
        "SELECT 1 FROM sys.indexes WHERE name = 'ix_tbl_Customer_CreatedAt' AND object_id = OBJECT_ID('dbo.Customers')",
        "CREATE INDEX ix_tbl_Customer_CreatedAt ON dbo.Customers (CreatedAt)",
    ),
    # --- RBAC: every account gets a role -------------------------------------------------
    (
        "tbl_Signup.RoleId",
        "SELECT 1 WHERE COL_LENGTH('dbo.tbl_Signup', 'RoleId') IS NOT NULL",
        "ALTER TABLE dbo.tbl_Signup ADD RoleId INT NULL CONSTRAINT FK_tbl_Signup_RoleId REFERENCES dbo.tbl_Role (Id)",
    ),
    (
        # Accounts from before RBAC were all created by the restaurant's own staff (there was
        # no customer login), so they keep full access. Runs once: new accounts always get a role.
        "existing accounts -> SUPER_ADMIN",
        "SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM dbo.tbl_Signup WHERE RoleId IS NULL)",
        "UPDATE dbo.tbl_Signup SET RoleId = (SELECT Id FROM dbo.tbl_Role WHERE Name = 'SUPER_ADMIN') WHERE RoleId IS NULL",
    ),
    (
        "tbl_Signup.RoleId NOT NULL",
        "SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.tbl_Signup') AND name = 'RoleId' AND is_nullable = 0",
        "ALTER TABLE dbo.tbl_Signup ALTER COLUMN RoleId INT NOT NULL",
    ),
    (
        "tbl_Signup.CustomerId",
        "SELECT 1 WHERE COL_LENGTH('dbo.tbl_Signup', 'CustomerId') IS NOT NULL",
        "ALTER TABLE dbo.tbl_Signup ADD CustomerId INT NULL "
        "CONSTRAINT FK_tbl_Signup_CustomerId REFERENCES dbo.Customers (Id)",
    ),
    (
        "unique index on tbl_Signup.CustomerId",
        "SELECT 1 FROM sys.indexes WHERE name = 'UX_tbl_Signup_CustomerId' AND object_id = OBJECT_ID('dbo.tbl_Signup')",
        "CREATE UNIQUE INDEX UX_tbl_Signup_CustomerId ON dbo.tbl_Signup (CustomerId) WHERE CustomerId IS NOT NULL",
    ),
    # --- Inventory valuation and table seating -------------------------------------------
    (
        "tbl_InventoryItem.UnitCost",
        "SELECT 1 WHERE COL_LENGTH('dbo.Inventory', 'UnitCost') IS NOT NULL",
        "ALTER TABLE dbo.Inventory ADD UnitCost DECIMAL(10, 2) NOT NULL "
        "CONSTRAINT DF_tbl_InventoryItem_UnitCost DEFAULT 0",
    ),
    (
        "tbl_Orders.TableId",
        "SELECT 1 WHERE COL_LENGTH('dbo.Orders', 'TableId') IS NOT NULL",
        "ALTER TABLE dbo.Orders ADD TableId INT NULL "
        "CONSTRAINT FK_tbl_Orders_TableId REFERENCES dbo.tbl_DiningTable (Id)",
    ),
    (
        "index on tbl_Orders.TableId",
        "SELECT 1 FROM sys.indexes WHERE name = 'ix_tbl_Orders_TableId' AND object_id = OBJECT_ID('dbo.Orders')",
        "CREATE INDEX ix_tbl_Orders_TableId ON dbo.Orders (TableId)",
    ),
    # --- Restaurant branches and per-account branch/permission scoping --------------------
    # tbl_RestaurantBranch itself is a brand-new table, so Base.metadata.create_all() creates
    # it directly; only columns ADDED to already-existing tables need a migration here.
    (
        "tbl_Signup.BranchId",
        "SELECT 1 WHERE COL_LENGTH('dbo.tbl_Signup', 'BranchId') IS NOT NULL",
        "ALTER TABLE dbo.tbl_Signup ADD BranchId INT NULL "
        "CONSTRAINT FK_tbl_Signup_BranchId REFERENCES dbo.Restaurants (Id)",
    ),
    (
        "tbl_Signup.CanAccessInventory",
        "SELECT 1 WHERE COL_LENGTH('dbo.tbl_Signup', 'CanAccessInventory') IS NOT NULL",
        "ALTER TABLE dbo.tbl_Signup ADD CanAccessInventory BIT NOT NULL "
        "CONSTRAINT DF_tbl_Signup_CanAccessInventory DEFAULT 0",
    ),
    (
        "tbl_Signup.CanTriggerPipeline",
        "SELECT 1 WHERE COL_LENGTH('dbo.tbl_Signup', 'CanTriggerPipeline') IS NOT NULL",
        "ALTER TABLE dbo.tbl_Signup ADD CanTriggerPipeline BIT NOT NULL "
        "CONSTRAINT DF_tbl_Signup_CanTriggerPipeline DEFAULT 0",
    ),
    (
        "tbl_Signup.CanAccessMenuManagement",
        "SELECT 1 WHERE COL_LENGTH('dbo.tbl_Signup', 'CanAccessMenuManagement') IS NOT NULL",
        "ALTER TABLE dbo.tbl_Signup ADD CanAccessMenuManagement BIT NOT NULL "
        "CONSTRAINT DF_tbl_Signup_CanAccessMenuManagement DEFAULT 0",
    ),
    (
        "tbl_Signup.CanAccessBranchAnalytics",
        "SELECT 1 WHERE COL_LENGTH('dbo.tbl_Signup', 'CanAccessBranchAnalytics') IS NOT NULL",
        "ALTER TABLE dbo.tbl_Signup ADD CanAccessBranchAnalytics BIT NOT NULL "
        "CONSTRAINT DF_tbl_Signup_CanAccessBranchAnalytics DEFAULT 0",
    ),
    (
        "tbl_Orders.BranchId",
        "SELECT 1 WHERE COL_LENGTH('dbo.Orders', 'BranchId') IS NOT NULL",
        "ALTER TABLE dbo.Orders ADD BranchId INT NULL "
        "CONSTRAINT FK_tbl_Orders_BranchId REFERENCES dbo.Restaurants (Id)",
    ),
    (
        # NULL = shared across every branch; left NULL for all existing items (see the model
        # docstring) rather than fabricating a per-branch split with no real data behind it.
        "tbl_InventoryItem.BranchId",
        "SELECT 1 WHERE COL_LENGTH('dbo.Inventory', 'BranchId') IS NOT NULL",
        "ALTER TABLE dbo.Inventory ADD BranchId INT NULL "
        "CONSTRAINT FK_tbl_InventoryItem_BranchId REFERENCES dbo.Restaurants (Id)",
    ),
    (
        "index on tbl_Orders.BranchId",
        "SELECT 1 FROM sys.indexes WHERE name = 'ix_tbl_Orders_BranchId' AND object_id = OBJECT_ID('dbo.Orders')",
        "CREATE INDEX ix_tbl_Orders_BranchId ON dbo.Orders (BranchId)",
    ),
    # --- Branch-scoped RBAC rollout: backfill historical rows so every branch dashboard ---
    # --- shows real numbers immediately, instead of being empty until new data accrues. ---
    (
        # Round-robin by Order.Id across every active branch. One-time: once every order has
        # a BranchId, the "still NULL" check below never matches again, so this never re-runs.
        # (Orders created after this point are stamped with a branch at creation time.)
        "backfill tbl_Orders.BranchId across active branches",
        "SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM dbo.Orders WHERE BranchId IS NULL)",
        """
        ;WITH Branches AS (
            SELECT Id, ROW_NUMBER() OVER (ORDER BY Id) AS rn
            FROM dbo.Restaurants WHERE IsDeleted = 0
        ),
        BranchCount AS (SELECT COUNT(*) AS cnt FROM Branches)
        UPDATE O SET BranchId = B.Id
        FROM dbo.Orders O
        CROSS JOIN BranchCount BC
        JOIN Branches B ON B.rn = ((O.Id % BC.cnt) + 1)
        WHERE O.BranchId IS NULL AND BC.cnt > 0
        """,
    ),
    (
        "tbl_StockMovementLog.BranchId",
        "SELECT 1 WHERE COL_LENGTH('dbo.tbl_StockMovementLog', 'BranchId') IS NOT NULL",
        "ALTER TABLE dbo.tbl_StockMovementLog ADD BranchId INT NULL "
        "CONSTRAINT FK_tbl_StockMovementLog_BranchId REFERENCES dbo.Restaurants (Id)",
    ),
    (
        "index on tbl_StockMovementLog.BranchId",
        "SELECT 1 FROM sys.indexes WHERE name = 'ix_tbl_StockMovementLog_BranchId' AND object_id = OBJECT_ID('dbo.tbl_StockMovementLog')",
        "CREATE INDEX ix_tbl_StockMovementLog_BranchId ON dbo.tbl_StockMovementLog (BranchId)",
    ),
    (
        # ORDER_CONSUMPTION rows inherit their branch from the order that caused them
        # (now backfilled above); other movement types (manual adjustments, initial stock)
        # are spread round-robin by Id, same approach as the orders backfill.
        "backfill tbl_StockMovementLog.BranchId from linked orders",
        "SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM dbo.tbl_StockMovementLog WHERE BranchId IS NULL AND OrderId IS NOT NULL)",
        """
        UPDATE L SET BranchId = O.BranchId
        FROM dbo.tbl_StockMovementLog L
        JOIN dbo.Orders O ON O.Id = L.OrderId
        WHERE L.BranchId IS NULL AND L.OrderId IS NOT NULL
        """,
    ),
    (
        "backfill tbl_StockMovementLog.BranchId for non-order movements",
        "SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM dbo.tbl_StockMovementLog WHERE BranchId IS NULL)",
        """
        ;WITH Branches AS (
            SELECT Id, ROW_NUMBER() OVER (ORDER BY Id) AS rn
            FROM dbo.Restaurants WHERE IsDeleted = 0
        ),
        BranchCount AS (SELECT COUNT(*) AS cnt FROM Branches)
        UPDATE L SET BranchId = B.Id
        FROM dbo.tbl_StockMovementLog L
        CROSS JOIN BranchCount BC
        JOIN Branches B ON B.rn = ((L.Id % BC.cnt) + 1)
        WHERE L.BranchId IS NULL AND BC.cnt > 0
        """,
    ),
    # --- Performance: covering indexes for the analytics/dashboard read path -----------
    # Added once the operational tables reached Big-Data scale (1M+ tbl_OrderDetails,
    # 380k+ tbl_Orders). Each one is shaped around a real query pattern already in the
    # codebase (see _order_filters in analytics_service.py, and the wastage/rating-anomaly
    # queries in branch_analytics_service.py / ml_analytics_service.py) rather than a
    # guess: leading column(s) match the equality filters, range filter last, and every
    # column the query selects afterward is in INCLUDE so the engine never needs a key
    # lookup back to the base table.
    (
        "covering index: tbl_Orders (BranchId, Status, OrderDate)",
        "SELECT 1 FROM sys.indexes WHERE name = 'ix_tbl_Orders_BranchId_Status_OrderDate' AND object_id = OBJECT_ID('dbo.Orders')",
        "CREATE INDEX ix_tbl_Orders_BranchId_Status_OrderDate ON dbo.Orders (BranchId, Status, OrderDate) "
        "INCLUDE (CustomerId, NetAmount, TotalAmount, Discount, IsDeleted)",
    ),
    (
        # Covers the RFM / churn-risk aggregation (GROUP BY CustomerId across all branches).
        "covering index: tbl_Orders (CustomerId) for RFM/churn",
        "SELECT 1 FROM sys.indexes WHERE name = 'ix_tbl_Orders_CustomerId_Covering' AND object_id = OBJECT_ID('dbo.Orders')",
        "CREATE INDEX ix_tbl_Orders_CustomerId_Covering ON dbo.Orders (CustomerId) "
        "INCLUDE (OrderDate, NetAmount, Status, IsDeleted)",
    ),
    (
        # The single highest-impact index in the app: every menu/branch/ML analytics query
        # joins tbl_OrderDetails to tbl_Orders on OrderId and needs these exact columns.
        "covering index: tbl_OrderDetails (OrderId)",
        "SELECT 1 FROM sys.indexes WHERE name = 'ix_tbl_OrderDetails_OrderId_Covering' AND object_id = OBJECT_ID('dbo.Order_Items')",
        "CREATE INDEX ix_tbl_OrderDetails_OrderId_Covering ON dbo.Order_Items (OrderId) "
        "INCLUDE (MenuItemId, Quantity, UnitPrice, UnitCost, TotalPrice, IsDeleted)",
    ),
    (
        "covering index: tbl_Rating (MenuItemId, CreatedAt)",
        "SELECT 1 FROM sys.indexes WHERE name = 'ix_tbl_Rating_MenuItemId_CreatedAt' AND object_id = OBJECT_ID('dbo.Ratings')",
        "CREATE INDEX ix_tbl_Rating_MenuItemId_CreatedAt ON dbo.Ratings (MenuItemId, CreatedAt) "
        "INCLUDE (Score, IsDeleted)",
    ),
    (
        "covering index: tbl_StockMovementLog (BranchId, MovementType, CreatedAt)",
        "SELECT 1 FROM sys.indexes WHERE name = 'ix_tbl_StockMovementLog_BranchId_Type_CreatedAt' AND object_id = OBJECT_ID('dbo.tbl_StockMovementLog')",
        "CREATE INDEX ix_tbl_StockMovementLog_BranchId_Type_CreatedAt ON dbo.tbl_StockMovementLog (BranchId, MovementType, CreatedAt) "
        "INCLUDE (QuantityChange, Reason, InventoryItemId, IsDeleted)",
    ),
    (
        # Wastage split: dbo.Wastage is created directly by Base.metadata.create_all()
        # (it is a brand-new table, same as tbl_RestaurantBranch once was) before this runs.
        # One-time bulk copy of every historical MANUAL_DEDUCTION row -- "Wastage already
        # has rows" is used as the one-time marker rather than re-diffing row by row.
        "copy MANUAL_DEDUCTION rows from tbl_StockMovementLog into Wastage",
        "SELECT 1 WHERE EXISTS (SELECT 1 FROM dbo.Wastage)",
        "INSERT INTO dbo.Wastage (InventoryItemId, BranchId, Quantity, Reason, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt, IsActive, IsDeleted) "
        "SELECT InventoryItemId, BranchId, -QuantityChange, Reason, CreatedBy, UpdatedBy, CreatedAt, UpdatedAt, IsActive, IsDeleted "
        "FROM dbo.tbl_StockMovementLog WHERE MovementType = 'MANUAL_DEDUCTION'",
    ),
    (
        # Runs after the copy above; removes the now-duplicated rows so wastage lives in
        # exactly one place. Safe to re-run: once none remain, this is a no-op forever.
        "remove migrated MANUAL_DEDUCTION rows from tbl_StockMovementLog",
        "SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM dbo.tbl_StockMovementLog WHERE MovementType = 'MANUAL_DEDUCTION')",
        "DELETE FROM dbo.tbl_StockMovementLog WHERE MovementType = 'MANUAL_DEDUCTION'",
    ),
    # --- Customer self-checkout: redeemable promo codes ------------------------------------
    (
        "tbl_Promotion.Code",
        "SELECT 1 WHERE COL_LENGTH('dbo.Promotions', 'Code') IS NOT NULL",
        "ALTER TABLE dbo.Promotions ADD Code NVARCHAR(40) NULL",
    ),
    (
        "unique index on tbl_Promotion.Code",
        "SELECT 1 FROM sys.indexes WHERE name = 'UX_tbl_Promotion_Code' AND object_id = OBJECT_ID('dbo.Promotions')",
        "CREATE UNIQUE INDEX UX_tbl_Promotion_Code ON dbo.Promotions (Code) WHERE Code IS NOT NULL",
    ),
]


async def run_migrations(conn: AsyncConnection) -> list[str]:
    """Apply any pending steps; returns the descriptions of those applied."""
    applied = []
    for description, check_sql, apply_sql in MIGRATIONS:
        if (await conn.execute(text(check_sql))).first() is None:
            await conn.execute(text(apply_sql))
            await conn.commit()
            applied.append(description)
    return applied
