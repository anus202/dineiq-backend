-- Performance indexes for the migrated 2M-row dataset.
-- These reduce "rows read" (the D1 free-tier limiting factor) on hot query paths.
CREATE INDEX IF NOT EXISTS ix_Orders_OrderDate ON Orders(OrderDate);
CREATE INDEX IF NOT EXISTS ix_Orders_Status ON Orders(Status);
CREATE INDEX IF NOT EXISTS ix_Orders_BranchId ON Orders(BranchId);
CREATE INDEX IF NOT EXISTS ix_Orders_CustomerId ON Orders(CustomerId);
CREATE INDEX IF NOT EXISTS ix_Orders_Status_OrderDate ON Orders(Status, OrderDate);
CREATE INDEX IF NOT EXISTS ix_OrderItems_OrderId ON Order_Items(OrderId);
CREATE INDEX IF NOT EXISTS ix_OrderItems_MenuItemId ON Order_Items(MenuItemId);
CREATE INDEX IF NOT EXISTS ix_Ratings_MenuItemId ON Ratings(MenuItemId);
CREATE INDEX IF NOT EXISTS ix_Ratings_CustomerId ON Ratings(CustomerId);
CREATE INDEX IF NOT EXISTS ix_Ratings_CreatedAt ON Ratings(CreatedAt);
CREATE INDEX IF NOT EXISTS ix_Customers_Phone ON Customers(Phone);
CREATE INDEX IF NOT EXISTS ix_Customers_CreatedAt ON Customers(CreatedAt);
CREATE INDEX IF NOT EXISTS ix_MenuItems_CategoryId ON Menu_Items(CategoryId);
CREATE INDEX IF NOT EXISTS ix_Inventory_ItemName ON Inventory(ItemName);
CREATE INDEX IF NOT EXISTS ix_Wastage_InventoryItemId ON Wastage(InventoryItemId);
CREATE INDEX IF NOT EXISTS ix_Wastage_CreatedAt ON Wastage(CreatedAt);
CREATE INDEX IF NOT EXISTS ix_PricingHistory_MenuItemId ON Pricing_History(MenuItemId);
CREATE INDEX IF NOT EXISTS ix_Signup_Email ON tbl_Signup(Email);
CREATE INDEX IF NOT EXISTS ix_AuditLog_Timestamp ON tbl_AuditLog(Timestamp);
