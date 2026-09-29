-- PostgreSQL schema for DineIQ on Supabase
-- Tables created without FKs first, then FKs added via ALTER TABLE (avoids circular deps)

CREATE TABLE IF NOT EXISTS tbl_Role (
    Id BIGSERIAL PRIMARY KEY,
    Name TEXT NOT NULL UNIQUE,
    Description TEXT,
    CreatedBy BIGINT,
    UpdatedBy BIGINT,
    CreatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    UpdatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    IsDeleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS Customers (
    Id BIGSERIAL PRIMARY KEY,
    Name TEXT NOT NULL,
    Phone TEXT NOT NULL UNIQUE,
    Email TEXT,
    Address TEXT,
    LoyaltyPoints INTEGER NOT NULL DEFAULT 0,
    CreatedBy BIGINT,
    UpdatedBy BIGINT,
    CreatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    UpdatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    IsDeleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS Menu_Categories (
    Id BIGSERIAL PRIMARY KEY,
    Name TEXT NOT NULL,
    CreatedBy BIGINT,
    UpdatedBy BIGINT,
    CreatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    UpdatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    IsDeleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS Menu_Items (
    Id BIGSERIAL PRIMARY KEY,
    CategoryId BIGINT NOT NULL,
    Name TEXT NOT NULL,
    Description TEXT,
    Price NUMERIC(10,2) NOT NULL,
    Cost NUMERIC(10,2) NOT NULL DEFAULT 0,
    IsAvailable BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy BIGINT,
    UpdatedBy BIGINT,
    CreatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    UpdatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    IsDeleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS Restaurants (
    Id BIGSERIAL PRIMARY KEY,
    BranchName TEXT NOT NULL,
    Address TEXT NOT NULL,
    City TEXT NOT NULL,
    Phone TEXT NOT NULL,
    OperatingHours TEXT NOT NULL,
    ManagerId BIGINT,
    CreatedBy BIGINT,
    UpdatedBy BIGINT,
    CreatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    UpdatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    IsDeleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS tbl_Signup (
    Id BIGSERIAL PRIMARY KEY,
    FullName TEXT NOT NULL,
    Email TEXT NOT NULL UNIQUE,
    PhoneNumber TEXT,
    PasswordHash TEXT NOT NULL,
    RoleId BIGINT NOT NULL,
    CustomerId BIGINT,
    BranchId BIGINT,
    CanAccessInventory BOOLEAN NOT NULL DEFAULT FALSE,
    CanTriggerPipeline BOOLEAN NOT NULL DEFAULT FALSE,
    CanAccessMenuManagement BOOLEAN NOT NULL DEFAULT FALSE,
    CanAccessBranchAnalytics BOOLEAN NOT NULL DEFAULT FALSE,
    CreatedBy BIGINT,
    UpdatedBy BIGINT,
    CreatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    UpdatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    IsDeleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS tbl_DiningTable (
    Id BIGSERIAL PRIMARY KEY,
    TableNumber TEXT NOT NULL UNIQUE,
    Capacity INTEGER NOT NULL,
    Status TEXT NOT NULL DEFAULT 'AVAILABLE',
    CreatedBy BIGINT,
    UpdatedBy BIGINT,
    CreatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    UpdatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    IsDeleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS Inventory (
    Id BIGSERIAL PRIMARY KEY,
    ItemName TEXT NOT NULL,
    Unit TEXT NOT NULL,
    CurrentStock NUMERIC(12,3) NOT NULL DEFAULT 0,
    ReorderLevel NUMERIC(12,3) NOT NULL DEFAULT 0,
    UnitCost NUMERIC(10,2) NOT NULL DEFAULT 0,
    BranchId BIGINT,
    CreatedBy BIGINT,
    UpdatedBy BIGINT,
    CreatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    UpdatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    IsDeleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS Orders (
    Id BIGSERIAL PRIMARY KEY,
    CustomerId BIGINT,
    TableId BIGINT,
    BranchId BIGINT,
    GuestCount INTEGER NOT NULL DEFAULT 1,
    OrderNumber TEXT NOT NULL UNIQUE,
    OrderDate TIMESTAMP NOT NULL DEFAULT NOW(),
    OrderType TEXT NOT NULL,
    PaymentMethod TEXT NOT NULL,
    Status TEXT NOT NULL DEFAULT 'Pending',
    TotalAmount NUMERIC(10,2) NOT NULL,
    Discount NUMERIC(10,2) NOT NULL DEFAULT 0,
    NetAmount NUMERIC(10,2) NOT NULL,
    CreatedBy BIGINT,
    UpdatedBy BIGINT,
    CreatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    UpdatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    IsDeleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS Order_Items (
    Id BIGSERIAL PRIMARY KEY,
    OrderId BIGINT NOT NULL,
    MenuItemId BIGINT NOT NULL,
    Quantity INTEGER NOT NULL,
    UnitPrice NUMERIC(10,2) NOT NULL,
    TotalPrice NUMERIC(10,2) NOT NULL,
    UnitCost NUMERIC(10,2),
    CreatedBy BIGINT,
    UpdatedBy BIGINT,
    CreatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    UpdatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    IsDeleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS tbl_Payment (
    Id BIGSERIAL PRIMARY KEY,
    InvoiceNumber TEXT NOT NULL UNIQUE,
    OrderId BIGINT NOT NULL UNIQUE,
    CustomerId BIGINT,
    PaymentMethod TEXT NOT NULL,
    SubTotal NUMERIC(10,2) NOT NULL,
    OrderDiscount NUMERIC(10,2) NOT NULL DEFAULT 0,
    TierName TEXT,
    TierDiscountPercentage INTEGER NOT NULL DEFAULT 0,
    TierDiscount NUMERIC(10,2) NOT NULL DEFAULT 0,
    AmountDue NUMERIC(10,2) NOT NULL,
    PointsRedeemed INTEGER NOT NULL DEFAULT 0,
    PointsRedemptionAmount NUMERIC(10,2) NOT NULL DEFAULT 0,
    AmountPayable NUMERIC(10,2) NOT NULL,
    AmountTendered NUMERIC(10,2) NOT NULL,
    ChangeDue NUMERIC(10,2) NOT NULL DEFAULT 0,
    PointsEarned INTEGER NOT NULL DEFAULT 0,
    PaidAt TIMESTAMP NOT NULL DEFAULT NOW(),
    CreatedBy BIGINT,
    UpdatedBy BIGINT,
    CreatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    UpdatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    IsDeleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS Pricing_History (
    Id BIGSERIAL PRIMARY KEY,
    MenuItemId BIGINT NOT NULL,
    OldPrice NUMERIC(10,2),
    NewPrice NUMERIC(10,2) NOT NULL,
    ChangedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    CreatedBy BIGINT,
    UpdatedBy BIGINT,
    CreatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    UpdatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    IsDeleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS Promotions (
    Id BIGSERIAL PRIMARY KEY,
    Name TEXT NOT NULL,
    Description TEXT,
    DiscountPercent INTEGER NOT NULL,
    StartDate DATE NOT NULL,
    EndDate DATE NOT NULL,
    MenuItemId BIGINT,
    BranchId BIGINT,
    Code TEXT,
    CreatedBy BIGINT,
    UpdatedBy BIGINT,
    CreatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    UpdatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    IsDeleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS Ratings (
    Id BIGSERIAL PRIMARY KEY,
    MenuItemId BIGINT NOT NULL,
    CustomerId BIGINT NOT NULL,
    OrderId BIGINT,
    BranchId BIGINT,
    Score INTEGER NOT NULL,
    Comment TEXT,
    CreatedBy BIGINT,
    UpdatedBy BIGINT,
    CreatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    UpdatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    IsDeleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS Wastage (
    Id BIGSERIAL PRIMARY KEY,
    InventoryItemId BIGINT NOT NULL,
    BranchId BIGINT,
    Quantity NUMERIC(12,3) NOT NULL,
    Reason TEXT,
    CreatedBy BIGINT,
    UpdatedBy BIGINT,
    CreatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    UpdatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    IsDeleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS tbl_StockMovementLog (
    Id BIGSERIAL PRIMARY KEY,
    InventoryItemId BIGINT NOT NULL,
    MovementType TEXT NOT NULL,
    QuantityChange NUMERIC(12,3) NOT NULL,
    StockAfter NUMERIC(12,3) NOT NULL,
    OrderId BIGINT,
    Reason TEXT,
    BranchId BIGINT,
    CreatedBy BIGINT,
    UpdatedBy BIGINT,
    CreatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    UpdatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    IsDeleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS tbl_Recipe (
    Id BIGSERIAL PRIMARY KEY,
    MenuItemId BIGINT NOT NULL,
    InventoryItemId BIGINT NOT NULL,
    QuantityRequired NUMERIC(12,3) NOT NULL,
    CreatedBy BIGINT,
    UpdatedBy BIGINT,
    CreatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    UpdatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    IsDeleted BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(MenuItemId, InventoryItemId)
);

CREATE TABLE IF NOT EXISTS Customer_Favorites (
    Id BIGSERIAL PRIMARY KEY,
    CustomerId BIGINT NOT NULL,
    MenuItemId BIGINT NOT NULL,
    CreatedBy BIGINT,
    UpdatedBy BIGINT,
    CreatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    UpdatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    IsDeleted BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(CustomerId, MenuItemId)
);

CREATE TABLE IF NOT EXISTS tbl_Login (
    Id BIGSERIAL PRIMARY KEY,
    SignupId BIGINT NOT NULL,
    Email TEXT NOT NULL,
    LoginTime TIMESTAMP NOT NULL DEFAULT NOW(),
    LogoutTime TIMESTAMP,
    IpAddress TEXT,
    IsSuccess BOOLEAN NOT NULL DEFAULT TRUE,
    CreatedBy BIGINT,
    UpdatedBy BIGINT,
    CreatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    UpdatedAt TIMESTAMP NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE,
    IsDeleted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS tbl_AuditLog (
    Id BIGSERIAL PRIMARY KEY,
    UserId BIGINT,
    Action TEXT NOT NULL,
    EntityName TEXT NOT NULL,
    EntityId TEXT,
    OldValues TEXT,
    NewValues TEXT,
    IpAddress TEXT,
    Timestamp TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Foreign keys (added after all tables exist)
DO $$ BEGIN
    ALTER TABLE Restaurants ADD CONSTRAINT fk_restaurants_manager FOREIGN KEY (ManagerId) REFERENCES tbl_Signup(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE Menu_Items ADD CONSTRAINT fk_menu_items_category FOREIGN KEY (CategoryId) REFERENCES Menu_Categories(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE tbl_Signup ADD CONSTRAINT fk_signup_role FOREIGN KEY (RoleId) REFERENCES tbl_Role(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE tbl_Signup ADD CONSTRAINT fk_signup_customer FOREIGN KEY (CustomerId) REFERENCES Customers(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE tbl_Signup ADD CONSTRAINT fk_signup_branch FOREIGN KEY (BranchId) REFERENCES Restaurants(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE Orders ADD CONSTRAINT fk_orders_customer FOREIGN KEY (CustomerId) REFERENCES Customers(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE Orders ADD CONSTRAINT fk_orders_table FOREIGN KEY (TableId) REFERENCES tbl_DiningTable(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE Orders ADD CONSTRAINT fk_orders_branch FOREIGN KEY (BranchId) REFERENCES Restaurants(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE Order_Items ADD CONSTRAINT fk_order_items_order FOREIGN KEY (OrderId) REFERENCES Orders(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE Order_Items ADD CONSTRAINT fk_order_items_menu FOREIGN KEY (MenuItemId) REFERENCES Menu_Items(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE tbl_Payment ADD CONSTRAINT fk_payment_order FOREIGN KEY (OrderId) REFERENCES Orders(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE tbl_Payment ADD CONSTRAINT fk_payment_customer FOREIGN KEY (CustomerId) REFERENCES Customers(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE Pricing_History ADD CONSTRAINT fk_pricing_menu FOREIGN KEY (MenuItemId) REFERENCES Menu_Items(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE Promotions ADD CONSTRAINT fk_promotions_menu FOREIGN KEY (MenuItemId) REFERENCES Menu_Items(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE Promotions ADD CONSTRAINT fk_promotions_branch FOREIGN KEY (BranchId) REFERENCES Restaurants(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE Ratings ADD CONSTRAINT fk_ratings_menu FOREIGN KEY (MenuItemId) REFERENCES Menu_Items(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE Ratings ADD CONSTRAINT fk_ratings_customer FOREIGN KEY (CustomerId) REFERENCES Customers(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE Ratings ADD CONSTRAINT fk_ratings_order FOREIGN KEY (OrderId) REFERENCES Orders(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE Ratings ADD CONSTRAINT fk_ratings_branch FOREIGN KEY (BranchId) REFERENCES Restaurants(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE Wastage ADD CONSTRAINT fk_wastage_inventory FOREIGN KEY (InventoryItemId) REFERENCES Inventory(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE Wastage ADD CONSTRAINT fk_wastage_branch FOREIGN KEY (BranchId) REFERENCES Restaurants(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE tbl_StockMovementLog ADD CONSTRAINT fk_stock_inventory FOREIGN KEY (InventoryItemId) REFERENCES Inventory(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE tbl_StockMovementLog ADD CONSTRAINT fk_stock_order FOREIGN KEY (OrderId) REFERENCES Orders(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE tbl_StockMovementLog ADD CONSTRAINT fk_stock_branch FOREIGN KEY (BranchId) REFERENCES Restaurants(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE tbl_Recipe ADD CONSTRAINT fk_recipe_menu FOREIGN KEY (MenuItemId) REFERENCES Menu_Items(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE tbl_Recipe ADD CONSTRAINT fk_recipe_inventory FOREIGN KEY (InventoryItemId) REFERENCES Inventory(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE Customer_Favorites ADD CONSTRAINT fk_favorites_customer FOREIGN KEY (CustomerId) REFERENCES Customers(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE Customer_Favorites ADD CONSTRAINT fk_favorites_menu FOREIGN KEY (MenuItemId) REFERENCES Menu_Items(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE tbl_Login ADD CONSTRAINT fk_login_signup FOREIGN KEY (SignupId) REFERENCES tbl_Signup(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE tbl_AuditLog ADD CONSTRAINT fk_audit_user FOREIGN KEY (UserId) REFERENCES tbl_Signup(Id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS ix_Orders_OrderDate ON Orders(OrderDate);
CREATE INDEX IF NOT EXISTS ix_Orders_Status ON Orders(Status);
CREATE INDEX IF NOT EXISTS ix_Orders_BranchId ON Orders(BranchId);
CREATE INDEX IF NOT EXISTS ix_Orders_CustomerId ON Orders(CustomerId);
CREATE INDEX IF NOT EXISTS ix_OrderItems_OrderId ON Order_Items(OrderId);
CREATE INDEX IF NOT EXISTS ix_OrderItems_MenuItemId ON Order_Items(MenuItemId);
CREATE INDEX IF NOT EXISTS ix_Ratings_MenuItemId ON Ratings(MenuItemId);
CREATE INDEX IF NOT EXISTS ix_Ratings_CustomerId ON Ratings(CustomerId);
CREATE INDEX IF NOT EXISTS ix_Customers_Phone ON Customers(Phone);
CREATE INDEX IF NOT EXISTS ix_MenuItems_CategoryId ON Menu_Items(CategoryId);
CREATE INDEX IF NOT EXISTS ix_Inventory_ItemName ON Inventory(ItemName);
CREATE INDEX IF NOT EXISTS ix_Wastage_InventoryItemId ON Wastage(InventoryItemId);
CREATE INDEX IF NOT EXISTS ix_PricingHistory_MenuItemId ON Pricing_History(MenuItemId);
CREATE INDEX IF NOT EXISTS ix_Signup_Email ON tbl_Signup(Email);
CREATE INDEX IF NOT EXISTS ix_AuditLog_Timestamp ON tbl_AuditLog(Timestamp);
CREATE INDEX IF NOT EXISTS ix_DiningTable_Status ON tbl_DiningTable(Status);
CREATE INDEX IF NOT EXISTS ix_Login_SignupId ON tbl_Login(SignupId);
CREATE INDEX IF NOT EXISTS ix_StockMovement_ItemId ON tbl_StockMovementLog(InventoryItemId);
CREATE INDEX IF NOT EXISTS ix_StockMovement_OrderId ON tbl_StockMovementLog(OrderId);
CREATE INDEX IF NOT EXISTS ix_Recipe_MenuItemId ON tbl_Recipe(MenuItemId);
CREATE INDEX IF NOT EXISTS ix_CustomerFavorites_CustomerId ON Customer_Favorites(CustomerId);
CREATE INDEX IF NOT EXISTS ix_Promotions_MenuItemId ON Promotions(MenuItemId);
CREATE INDEX IF NOT EXISTS ix_Promotions_BranchId ON Promotions(BranchId);
CREATE INDEX IF NOT EXISTS ix_Ratings_BranchId ON Ratings(BranchId);
CREATE INDEX IF NOT EXISTS ix_Wastage_BranchId ON Wastage(BranchId);
CREATE INDEX IF NOT EXISTS ix_StockMovement_BranchId ON tbl_StockMovementLog(BranchId);
CREATE INDEX IF NOT EXISTS ix_Orders_Status_OrderDate ON Orders(Status, OrderDate);
CREATE INDEX IF NOT EXISTS ix_Customers_CreatedAt ON Customers(CreatedAt);
CREATE INDEX IF NOT EXISTS ix_MenuItems_Name ON Menu_Items(Name);
CREATE INDEX IF NOT EXISTS ix_Ratings_CreatedAt ON Ratings(CreatedAt);
CREATE INDEX IF NOT EXISTS ix_Wastage_CreatedAt ON Wastage(CreatedAt);
CREATE INDEX IF NOT EXISTS ix_AuditLog_Entity ON tbl_AuditLog(EntityName, EntityId);
CREATE INDEX IF NOT EXISTS ix_AuditLog_UserId ON tbl_AuditLog(UserId);

-- Seed roles
INSERT INTO tbl_Role (Id, Name, Description) VALUES
(1, 'SUPER_ADMIN', 'Full system access'),
(2, 'ADMIN', 'Restaurant admin access'),
(3, 'INVENTORY_MANAGER', 'Inventory management access'),
(4, 'CASHIER', 'POS and payment access'),
(5, 'CUSTOMER', 'Customer portal access'),
(6, 'RESTAURANT_MANAGER', 'Restaurant manager access')
ON CONFLICT (Id) DO NOTHING;
