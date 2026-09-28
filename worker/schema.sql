-- D1 (SQLite) Schema for DineIQ
-- Converted from SQL Server schema

-- ============================================
-- CORE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS tbl_Role (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL UNIQUE,
    Description TEXT,
    CreatedBy INTEGER,
    UpdatedBy INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    IsActive INTEGER NOT NULL DEFAULT 1,
    IsDeleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tbl_Signup (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    FullName TEXT NOT NULL,
    Email TEXT NOT NULL UNIQUE,
    PhoneNumber TEXT,
    PasswordHash TEXT NOT NULL,
    RoleId INTEGER NOT NULL,
    CustomerId INTEGER,
    BranchId INTEGER,
    CanAccessInventory INTEGER NOT NULL DEFAULT 0,
    CanTriggerPipeline INTEGER NOT NULL DEFAULT 0,
    CanAccessMenuManagement INTEGER NOT NULL DEFAULT 0,
    CanAccessBranchAnalytics INTEGER NOT NULL DEFAULT 0,
    CreatedBy INTEGER,
    UpdatedBy INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    IsActive INTEGER NOT NULL DEFAULT 1,
    IsDeleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (RoleId) REFERENCES tbl_Role(Id),
    FOREIGN KEY (CustomerId) REFERENCES Customers(Id),
    FOREIGN KEY (BranchId) REFERENCES Restaurants(Id)
);

CREATE TABLE IF NOT EXISTS tbl_Login (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    SignupId INTEGER NOT NULL,
    Email TEXT NOT NULL,
    LoginTime TEXT NOT NULL DEFAULT (datetime('now')),
    LogoutTime TEXT,
    IpAddress TEXT,
    IsSuccess INTEGER NOT NULL DEFAULT 1,
    CreatedBy INTEGER,
    UpdatedBy INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    IsActive INTEGER NOT NULL DEFAULT 1,
    IsDeleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (SignupId) REFERENCES tbl_Signup(Id)
);

CREATE TABLE IF NOT EXISTS Restaurants (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    BranchName TEXT NOT NULL,
    Address TEXT NOT NULL,
    City TEXT NOT NULL,
    Phone TEXT NOT NULL,
    OperatingHours TEXT NOT NULL,
    ManagerId INTEGER,
    CreatedBy INTEGER,
    UpdatedBy INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    IsActive INTEGER NOT NULL DEFAULT 1,
    IsDeleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (ManagerId) REFERENCES tbl_Signup(Id)
);

CREATE TABLE IF NOT EXISTS Customers (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL,
    Phone TEXT NOT NULL UNIQUE,
    Email TEXT,
    Address TEXT,
    LoyaltyPoints INTEGER NOT NULL DEFAULT 0,
    CreatedBy INTEGER,
    UpdatedBy INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    IsActive INTEGER NOT NULL DEFAULT 1,
    IsDeleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS Menu_Categories (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL,
    CreatedBy INTEGER,
    UpdatedBy INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    IsActive INTEGER NOT NULL DEFAULT 1,
    IsDeleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS Menu_Items (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    CategoryId INTEGER NOT NULL,
    Name TEXT NOT NULL,
    Description TEXT,
    Price REAL NOT NULL,
    Cost REAL NOT NULL DEFAULT 0,
    IsAvailable INTEGER NOT NULL DEFAULT 1,
    CreatedBy INTEGER,
    UpdatedBy INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    IsActive INTEGER NOT NULL DEFAULT 1,
    IsDeleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (CategoryId) REFERENCES Menu_Categories(Id)
);

CREATE TABLE IF NOT EXISTS tbl_DiningTable (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    TableNumber TEXT NOT NULL UNIQUE,
    Capacity INTEGER NOT NULL,
    Status TEXT NOT NULL DEFAULT 'AVAILABLE',
    CreatedBy INTEGER,
    UpdatedBy INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    IsActive INTEGER NOT NULL DEFAULT 1,
    IsDeleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS Orders (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    CustomerId INTEGER,
    TableId INTEGER,
    BranchId INTEGER,
    GuestCount INTEGER NOT NULL DEFAULT 1,
    OrderNumber TEXT NOT NULL UNIQUE,
    OrderDate TEXT NOT NULL DEFAULT (datetime('now')),
    OrderType TEXT NOT NULL,
    PaymentMethod TEXT NOT NULL,
    Status TEXT NOT NULL DEFAULT 'Pending',
    TotalAmount REAL NOT NULL,
    Discount REAL NOT NULL DEFAULT 0,
    NetAmount REAL NOT NULL,
    CreatedBy INTEGER,
    UpdatedBy INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    IsActive INTEGER NOT NULL DEFAULT 1,
    IsDeleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (CustomerId) REFERENCES Customers(Id),
    FOREIGN KEY (TableId) REFERENCES tbl_DiningTable(Id),
    FOREIGN KEY (BranchId) REFERENCES Restaurants(Id)
);

CREATE TABLE IF NOT EXISTS Order_Items (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    OrderId INTEGER NOT NULL,
    MenuItemId INTEGER NOT NULL,
    Quantity INTEGER NOT NULL,
    UnitPrice REAL NOT NULL,
    TotalPrice REAL NOT NULL,
    UnitCost REAL,
    CreatedBy INTEGER,
    UpdatedBy INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    IsActive INTEGER NOT NULL DEFAULT 1,
    IsDeleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (OrderId) REFERENCES Orders(Id),
    FOREIGN KEY (MenuItemId) REFERENCES Menu_Items(Id)
);

CREATE TABLE IF NOT EXISTS tbl_Payment (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    InvoiceNumber TEXT NOT NULL UNIQUE,
    OrderId INTEGER NOT NULL UNIQUE,
    CustomerId INTEGER,
    PaymentMethod TEXT NOT NULL,
    SubTotal REAL NOT NULL,
    OrderDiscount REAL NOT NULL DEFAULT 0,
    TierName TEXT,
    TierDiscountPercentage INTEGER NOT NULL DEFAULT 0,
    TierDiscount REAL NOT NULL DEFAULT 0,
    AmountDue REAL NOT NULL,
    PointsRedeemed INTEGER NOT NULL DEFAULT 0,
    PointsRedemptionAmount REAL NOT NULL DEFAULT 0,
    AmountPayable REAL NOT NULL,
    AmountTendered REAL NOT NULL,
    ChangeDue REAL NOT NULL DEFAULT 0,
    PointsEarned INTEGER NOT NULL DEFAULT 0,
    PaidAt TEXT NOT NULL DEFAULT (datetime('now')),
    CreatedBy INTEGER,
    UpdatedBy INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    IsActive INTEGER NOT NULL DEFAULT 1,
    IsDeleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (OrderId) REFERENCES Orders(Id),
    FOREIGN KEY (CustomerId) REFERENCES Customers(Id)
);

CREATE TABLE IF NOT EXISTS Inventory (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    ItemName TEXT NOT NULL,
    Unit TEXT NOT NULL,
    CurrentStock REAL NOT NULL DEFAULT 0,
    ReorderLevel REAL NOT NULL DEFAULT 0,
    UnitCost REAL NOT NULL DEFAULT 0,
    BranchId INTEGER,
    CreatedBy INTEGER,
    UpdatedBy INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    IsActive INTEGER NOT NULL DEFAULT 1,
    IsDeleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (BranchId) REFERENCES Restaurants(Id)
);

CREATE TABLE IF NOT EXISTS tbl_Recipe (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    MenuItemId INTEGER NOT NULL,
    InventoryItemId INTEGER NOT NULL,
    QuantityRequired REAL NOT NULL,
    CreatedBy INTEGER,
    UpdatedBy INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    IsActive INTEGER NOT NULL DEFAULT 1,
    IsDeleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (MenuItemId) REFERENCES Menu_Items(Id),
    FOREIGN KEY (InventoryItemId) REFERENCES Inventory(Id),
    UNIQUE(MenuItemId, InventoryItemId)
);

CREATE TABLE IF NOT EXISTS Pricing_History (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    MenuItemId INTEGER NOT NULL,
    OldPrice REAL,
    NewPrice REAL NOT NULL,
    ChangedAt TEXT NOT NULL DEFAULT (datetime('now')),
    CreatedBy INTEGER,
    UpdatedBy INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    IsActive INTEGER NOT NULL DEFAULT 1,
    IsDeleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (MenuItemId) REFERENCES Menu_Items(Id)
);

CREATE TABLE IF NOT EXISTS Promotions (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Name TEXT NOT NULL,
    Description TEXT,
    DiscountPercent INTEGER NOT NULL,
    StartDate TEXT NOT NULL,
    EndDate TEXT NOT NULL,
    MenuItemId INTEGER,
    BranchId INTEGER,
    Code TEXT,
    CreatedBy INTEGER,
    UpdatedBy INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    IsActive INTEGER NOT NULL DEFAULT 1,
    IsDeleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (MenuItemId) REFERENCES Menu_Items(Id),
    FOREIGN KEY (BranchId) REFERENCES Restaurants(Id)
);

CREATE TABLE IF NOT EXISTS Ratings (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    MenuItemId INTEGER NOT NULL,
    CustomerId INTEGER NOT NULL,
    OrderId INTEGER,
    BranchId INTEGER,
    Score INTEGER NOT NULL,
    Comment TEXT,
    CreatedBy INTEGER,
    UpdatedBy INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    IsActive INTEGER NOT NULL DEFAULT 1,
    IsDeleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (MenuItemId) REFERENCES Menu_Items(Id),
    FOREIGN KEY (CustomerId) REFERENCES Customers(Id),
    FOREIGN KEY (OrderId) REFERENCES Orders(Id),
    FOREIGN KEY (BranchId) REFERENCES Restaurants(Id)
);

CREATE TABLE IF NOT EXISTS Wastage (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    InventoryItemId INTEGER NOT NULL,
    BranchId INTEGER,
    Quantity REAL NOT NULL,
    Reason TEXT,
    CreatedBy INTEGER,
    UpdatedBy INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    IsActive INTEGER NOT NULL DEFAULT 1,
    IsDeleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (InventoryItemId) REFERENCES Inventory(Id),
    FOREIGN KEY (BranchId) REFERENCES Restaurants(Id)
);

CREATE TABLE IF NOT EXISTS tbl_StockMovementLog (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    InventoryItemId INTEGER NOT NULL,
    MovementType TEXT NOT NULL,
    QuantityChange REAL NOT NULL,
    StockAfter REAL NOT NULL,
    OrderId INTEGER,
    Reason TEXT,
    BranchId INTEGER,
    CreatedBy INTEGER,
    UpdatedBy INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    IsActive INTEGER NOT NULL DEFAULT 1,
    IsDeleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (InventoryItemId) REFERENCES Inventory(Id),
    FOREIGN KEY (OrderId) REFERENCES Orders(Id),
    FOREIGN KEY (BranchId) REFERENCES Restaurants(Id)
);

CREATE TABLE IF NOT EXISTS Customer_Favorites (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    CustomerId INTEGER NOT NULL,
    MenuItemId INTEGER NOT NULL,
    CreatedBy INTEGER,
    UpdatedBy INTEGER,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    IsActive INTEGER NOT NULL DEFAULT 1,
    IsDeleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (CustomerId) REFERENCES Customers(Id),
    FOREIGN KEY (MenuItemId) REFERENCES Menu_Items(Id),
    UNIQUE(CustomerId, MenuItemId)
);

CREATE TABLE IF NOT EXISTS tbl_AuditLog (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    UserId INTEGER,
    Action TEXT NOT NULL,
    EntityName TEXT NOT NULL,
    EntityId TEXT,
    OldValues TEXT,
    NewValues TEXT,
    IpAddress TEXT,
    Timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (UserId) REFERENCES tbl_Signup(Id)
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS ix_Signup_Email ON tbl_Signup(Email);
CREATE INDEX IF NOT EXISTS ix_Signup_RoleId ON tbl_Signup(RoleId);
CREATE INDEX IF NOT EXISTS ix_Signup_CustomerId ON tbl_Signup(CustomerId);
CREATE INDEX IF NOT EXISTS ix_Signup_BranchId ON tbl_Signup(BranchId);
CREATE INDEX IF NOT EXISTS ix_Login_SignupId ON tbl_Login(SignupId);
CREATE INDEX IF NOT EXISTS ix_Customer_Phone ON Customers(Phone);
CREATE INDEX IF NOT EXISTS ix_Customer_CreatedAt ON Customers(CreatedAt);
CREATE INDEX IF NOT EXISTS ix_MenuItems_CategoryId ON Menu_Items(CategoryId);
CREATE INDEX IF NOT EXISTS ix_MenuItems_Name ON Menu_Items(Name);
CREATE INDEX IF NOT EXISTS ix_Orders_CustomerId ON Orders(CustomerId);
CREATE INDEX IF NOT EXISTS ix_Orders_TableId ON Orders(TableId);
CREATE INDEX IF NOT EXISTS ix_Orders_BranchId ON Orders(BranchId);
CREATE INDEX IF NOT EXISTS ix_Orders_Status_OrderDate ON Orders(Status, OrderDate);
CREATE INDEX IF NOT EXISTS ix_OrderItems_OrderId ON Order_Items(OrderId);
CREATE INDEX IF NOT EXISTS ix_OrderItems_MenuItemId ON Order_Items(MenuItemId);
CREATE INDEX IF NOT EXISTS ix_Payment_OrderId ON tbl_Payment(OrderId);
CREATE INDEX IF NOT EXISTS ix_Payment_CustomerId ON tbl_Payment(CustomerId);
CREATE INDEX IF NOT EXISTS ix_Inventory_ItemName ON Inventory(ItemName);
CREATE INDEX IF NOT EXISTS ix_Inventory_BranchId ON Inventory(BranchId);
CREATE INDEX IF NOT EXISTS ix_Recipe_MenuItemId ON tbl_Recipe(MenuItemId);
CREATE INDEX IF NOT EXISTS ix_Recipe_InventoryItemId ON tbl_Recipe(InventoryItemId);
CREATE INDEX IF NOT EXISTS ix_PricingHistory_MenuItemId ON Pricing_History(MenuItemId);
CREATE INDEX IF NOT EXISTS ix_Promotions_MenuItemId ON Promotions(MenuItemId);
CREATE INDEX IF NOT EXISTS ix_Promotions_BranchId ON Promotions(BranchId);
CREATE INDEX IF NOT EXISTS ix_Ratings_MenuItemId ON Ratings(MenuItemId);
CREATE INDEX IF NOT EXISTS ix_Ratings_CustomerId ON Ratings(CustomerId);
CREATE INDEX IF NOT EXISTS ix_Ratings_BranchId ON Ratings(BranchId);
CREATE INDEX IF NOT EXISTS ix_Wastage_InventoryItemId ON Wastage(InventoryItemId);
CREATE INDEX IF NOT EXISTS ix_Wastage_BranchId ON Wastage(BranchId);
CREATE INDEX IF NOT EXISTS ix_StockMovement_ItemId ON tbl_StockMovementLog(InventoryItemId);
CREATE INDEX IF NOT EXISTS ix_StockMovement_OrderId ON tbl_StockMovementLog(OrderId);
CREATE INDEX IF NOT EXISTS ix_StockMovement_BranchId ON tbl_StockMovementLog(BranchId);
CREATE INDEX IF NOT EXISTS ix_CustomerFavorites_CustomerId ON Customer_Favorites(CustomerId);
CREATE INDEX IF NOT EXISTS ix_AuditLog_Timestamp ON tbl_AuditLog(Timestamp);
CREATE INDEX IF NOT EXISTS ix_AuditLog_Entity ON tbl_AuditLog(EntityName, EntityId);
CREATE INDEX IF NOT EXISTS ix_AuditLog_UserId ON tbl_AuditLog(UserId);
CREATE INDEX IF NOT EXISTS ix_DiningTable_Status ON tbl_DiningTable(Status);

-- ============================================
-- SEED DATA
-- ============================================

INSERT OR IGNORE INTO tbl_Role (Id, Name, Description) VALUES
(1, 'SUPER_ADMIN', 'Full system access'),
(2, 'ADMIN', 'Restaurant admin access'),
(3, 'INVENTORY_MANAGER', 'Inventory management access'),
(4, 'CASHIER', 'POS and payment access'),
(5, 'CUSTOMER', 'Customer portal access');
