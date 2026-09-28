-- Seed demo accounts (password stored as plain text to match the Worker's
-- current comparison logic) and a default branch.

INSERT OR IGNORE INTO Restaurants (Id, BranchName, Address, City, Phone, OperatingHours)
VALUES (1, 'DineIQ Main Branch', 'Main Boulevard', 'Lahore', '0300-0000000', '10:00 - 23:00');

INSERT OR IGNORE INTO tbl_Signup (Id, FullName, Email, PhoneNumber, PasswordHash, RoleId, BranchId,
  CanAccessInventory, CanTriggerPipeline, CanAccessMenuManagement, CanAccessBranchAnalytics)
VALUES
  (1, 'Demo Admin', 'admin@dineiq.demo', '0300-1111111', 'Demo@12345',
     (SELECT Id FROM tbl_Role WHERE Name = 'ADMIN'), 1, 1, 1, 1, 1),
  (2, 'Demo Cashier', 'cashier@dineiq.demo', '0300-2222222', 'Demo@12345',
     (SELECT Id FROM tbl_Role WHERE Name = 'CASHIER'), 1, 0, 0, 0, 0),
  (3, 'Demo Inventory Manager', 'inventory@dineiq.demo', '0300-3333333', 'Demo@12345',
     (SELECT Id FROM tbl_Role WHERE Name = 'INVENTORY_MANAGER'), 1, 1, 0, 0, 0);

-- Basic menu data so dashboards/POS have something to show.
INSERT OR IGNORE INTO Menu_Categories (Id, Name) VALUES (1, 'Fast Food'), (2, 'Beverages');

INSERT OR IGNORE INTO Menu_Items (Id, CategoryId, Name, Description, Price, Cost, IsAvailable)
VALUES
  (1, 1, 'Zinger Burger', 'Crispy chicken burger', 550.00, 320.00, 1),
  (2, 1, 'Pizza Slice', 'Cheese pizza slice', 350.00, 180.00, 1),
  (3, 2, 'Cola 500ml', 'Chilled soft drink', 120.00, 60.00, 1);
