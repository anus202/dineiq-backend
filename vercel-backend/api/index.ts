import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { d1Query, d1Execute } from '../lib/d1';
import { signToken, getAuthUser } from '../lib/auth';

const app = new Hono();

// CORS
app.use('*', cors({
  origin: ['http://localhost:5173', 'https://frontend-c8y86zta5-software-engineer9.vercel.app'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// AUTH ROUTES
// ============================================

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

app.post('/api/auth/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');
  
  const result = await d1Query(
    'SELECT * FROM tbl_Signup WHERE Email = ? AND IsActive = 1 AND IsDeleted = 0',
    [email]
  );
  
  const user = result.results[0] as Record<string, unknown> | undefined;
  
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  
  // In production, use proper password hashing (bcrypt)
  const isValid = password === user.PasswordHash;
  
  if (!isValid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  
  const token = await signToken({
    userId: user.Id as number,
    email: user.Email as string,
    roleId: user.RoleId as number,
    customerId: user.CustomerId as number | undefined,
    branchId: user.BranchId as number | undefined,
  });
  
  return c.json({
    token,
    user: {
      id: user.Id,
      fullName: user.FullName,
      email: user.Email,
      roleId: user.RoleId,
      customerId: user.CustomerId,
      branchId: user.BranchId,
    },
  });
});

const signupSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phoneNumber: z.string().optional(),
  password: z.string().min(6),
  roleId: z.number().int().default(5),
});

app.post('/api/auth/signup', zValidator('json', signupSchema), async (c) => {
  const data = c.req.valid('json');
  
  const existing = await d1Query('SELECT Id FROM tbl_Signup WHERE Email = ?', [data.email]);
  
  if (existing.results.length > 0) {
    return c.json({ error: 'Email already exists' }, 400);
  }
  
  const result = await d1Execute(
    `INSERT INTO tbl_Signup (FullName, Email, PhoneNumber, PasswordHash, RoleId, CanAccessInventory, CanTriggerPipeline, CanAccessMenuManagement, CanAccessBranchAnalytics)
     VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0)`,
    [data.fullName, data.email, data.phoneNumber ?? null, data.password, data.roleId]
  );
  
  const token = await signToken({
    userId: result.meta.last_row_id,
    email: data.email,
    roleId: data.roleId,
  });
  
  return c.json({
    token,
    user: {
      id: result.meta.last_row_id,
      fullName: data.fullName,
      email: data.email,
      roleId: data.roleId,
    },
  });
});

app.get('/api/auth/me', async (c) => {
  const payload = await getAuthUser(c.req.raw);
  if (!payload) return c.json({ error: 'Unauthorized' }, 401);
  
  const result = await d1Query(
    'SELECT Id, FullName, Email, RoleId, CustomerId, BranchId FROM tbl_Signup WHERE Id = ?',
    [payload.userId]
  );
  
  const user = result.results[0];
  if (!user) return c.json({ error: 'User not found' }, 404);
  
  return c.json({ user });
});

app.get('/api/auth/roles', async (c) => {
  const result = await d1Query('SELECT * FROM tbl_Role WHERE IsActive = 1 AND IsDeleted = 0');
  return c.json({ roles: result.results });
});

// ============================================
// CATEGORIES
// ============================================

app.get('/api/categories', async (c) => {
  const result = await d1Query(
    'SELECT * FROM Menu_Categories WHERE IsActive = 1 AND IsDeleted = 0 ORDER BY Name'
  );
  return c.json({ categories: result.results });
});

const categorySchema = z.object({ name: z.string().min(1) });

app.post('/api/categories', zValidator('json', categorySchema), async (c) => {
  const { name } = c.req.valid('json');
  const result = await d1Execute('INSERT INTO Menu_Categories (Name) VALUES (?)', [name]);
  return c.json({ id: result.meta.last_row_id, name });
});

app.put('/api/categories/:id', async (c) => {
  const id = c.req.param('id');
  const { name } = await c.req.json();
  await d1Execute('UPDATE Menu_Categories SET Name = ? WHERE Id = ?', [name, id]);
  return c.json({ success: true });
});

app.delete('/api/categories/:id', async (c) => {
  const id = c.req.param('id');
  await d1Execute('UPDATE Menu_Categories SET IsDeleted = 1 WHERE Id = ?', [id]);
  return c.json({ success: true });
});

// ============================================
// MENU ITEMS
// ============================================

app.get('/api/menu-items', async (c) => {
  const result = await d1Query(
    `SELECT mi.*, c.Name as CategoryName 
     FROM Menu_Items mi 
     LEFT JOIN Menu_Categories c ON mi.CategoryId = c.Id 
     WHERE mi.IsActive = 1 AND mi.IsDeleted = 0 
     ORDER BY mi.Name`
  );
  return c.json({ items: result.results });
});

const menuItemSchema = z.object({
  categoryId: z.number().int(),
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  cost: z.number().default(0),
  isAvailable: z.boolean().default(true),
});

app.post('/api/menu-items', zValidator('json', menuItemSchema), async (c) => {
  const data = c.req.valid('json');
  const result = await d1Execute(
    `INSERT INTO Menu_Items (CategoryId, Name, Description, Price, Cost, IsAvailable)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.categoryId, data.name, data.description ?? null, data.price, data.cost, data.isAvailable ? 1 : 0]
  );
  return c.json({ id: result.meta.last_row_id });
});

app.put('/api/menu-items/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  await d1Execute(
    `UPDATE Menu_Items SET CategoryId = ?, Name = ?, Description = ?, Price = ?, Cost = ?, IsAvailable = ?
     WHERE Id = ?`,
    [data.categoryId, data.name, data.description ?? null, data.price, data.cost, data.isAvailable ? 1 : 0, id]
  );
  return c.json({ success: true });
});

app.delete('/api/menu-items/:id', async (c) => {
  const id = c.req.param('id');
  await d1Execute('UPDATE Menu_Items SET IsDeleted = 1 WHERE Id = ?', [id]);
  return c.json({ success: true });
});

// ============================================
// ORDERS
// ============================================

app.get('/api/orders', async (c) => {
  const result = await d1Query(
    `SELECT o.*, c.Name as CustomerName, t.TableNumber, b.BranchName
     FROM Orders o
     LEFT JOIN Customers c ON o.CustomerId = c.Id
     LEFT JOIN tbl_DiningTable t ON o.TableId = t.Id
     LEFT JOIN Restaurants b ON o.BranchId = b.Id
     WHERE o.IsActive = 1 AND o.IsDeleted = 0
     ORDER BY o.OrderDate DESC
     LIMIT 100`
  );
  return c.json({ orders: result.results });
});

const orderSchema = z.object({
  customerId: z.number().int().optional(),
  tableId: z.number().int().optional(),
  branchId: z.number().int().optional(),
  guestCount: z.number().int().default(1),
  orderType: z.string(),
  paymentMethod: z.string(),
  items: z.array(z.object({
    menuItemId: z.number().int(),
    quantity: z.number().int(),
    unitPrice: z.number(),
  })),
});

app.post('/api/orders', zValidator('json', orderSchema), async (c) => {
  const data = c.req.valid('json');
  const payload = await getAuthUser(c.req.raw);
  
  const orderNumber = `ORD-${Date.now()}`;
  let totalAmount = 0;
  for (const item of data.items) {
    totalAmount += item.quantity * item.unitPrice;
  }
  
  const result = await d1Execute(
    `INSERT INTO Orders (CustomerId, TableId, BranchId, GuestCount, OrderNumber, OrderType, PaymentMethod, Status, TotalAmount, Discount, NetAmount)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?, 0, ?)`,
    [data.customerId ?? null, data.tableId ?? null, data.branchId ?? payload?.branchId ?? null, 
     data.guestCount, orderNumber, data.orderType, data.paymentMethod, totalAmount, totalAmount]
  );
  
  const orderId = result.meta.last_row_id;
  
  for (const item of data.items) {
    const totalPrice = item.quantity * item.unitPrice;
    await d1Execute(
      `INSERT INTO Order_Items (OrderId, MenuItemId, Quantity, UnitPrice, TotalPrice)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, item.menuItemId, item.quantity, item.unitPrice, totalPrice]
    );
  }
  
  return c.json({ id: orderId, orderNumber });
});

app.get('/api/orders/:id', async (c) => {
  const id = c.req.param('id');
  const order = await d1Query(
    `SELECT o.*, c.Name as CustomerName, t.TableNumber, b.BranchName
     FROM Orders o
     LEFT JOIN Customers c ON o.CustomerId = c.Id
     LEFT JOIN tbl_DiningTable t ON o.TableId = t.Id
     LEFT JOIN Restaurants b ON o.BranchId = b.Id
     WHERE o.Id = ?`,
    [id]
  );
  
  if (order.results.length === 0) {
    return c.json({ error: 'Order not found' }, 404);
  }
  
  const items = await d1Query(
    `SELECT oi.*, mi.Name as ItemName
     FROM Order_Items oi
     LEFT JOIN Menu_Items mi ON oi.MenuItemId = mi.Id
     WHERE oi.OrderId = ?`,
    [id]
  );
  
  return c.json({ order: order.results[0], items: items.results });
});

app.put('/api/orders/:id/status', async (c) => {
  const id = c.req.param('id');
  const { status } = await c.req.json();
  await d1Execute('UPDATE Orders SET Status = ? WHERE Id = ?', [status, id]);
  return c.json({ success: true });
});

// ============================================
// CUSTOMERS
// ============================================

app.get('/api/customers', async (c) => {
  const result = await d1Query(
    'SELECT * FROM Customers WHERE IsActive = 1 AND IsDeleted = 0 ORDER BY Name LIMIT 100'
  );
  return c.json({ customers: result.results });
});

const customerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  address: z.string().optional(),
});

app.post('/api/customers', zValidator('json', customerSchema), async (c) => {
  const data = c.req.valid('json');
  const result = await d1Execute(
    'INSERT INTO Customers (Name, Phone, Email, Address) VALUES (?, ?, ?, ?)',
    [data.name, data.phone, data.email ?? null, data.address ?? null]
  );
  return c.json({ id: result.meta.last_row_id });
});

app.put('/api/customers/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  await d1Execute(
    'UPDATE Customers SET Name = ?, Phone = ?, Email = ?, Address = ? WHERE Id = ?',
    [data.name, data.phone, data.email ?? null, data.address ?? null, id]
  );
  return c.json({ success: true });
});

// ============================================
// INVENTORY
// ============================================

app.get('/api/inventory/items', async (c) => {
  const result = await d1Query(
    `SELECT i.*, b.BranchName
     FROM Inventory i
     LEFT JOIN Restaurants b ON i.BranchId = b.Id
     WHERE i.IsActive = 1 AND i.IsDeleted = 0
     ORDER BY i.ItemName`
  );
  return c.json({ items: result.results });
});

const inventorySchema = z.object({
  itemName: z.string().min(1),
  unit: z.string().min(1),
  currentStock: z.number().default(0),
  reorderLevel: z.number().default(0),
  unitCost: z.number().default(0),
  branchId: z.number().int().optional(),
});

app.post('/api/inventory/items', zValidator('json', inventorySchema), async (c) => {
  const data = c.req.valid('json');
  const result = await d1Execute(
    `INSERT INTO Inventory (ItemName, Unit, CurrentStock, ReorderLevel, UnitCost, BranchId)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [data.itemName, data.unit, data.currentStock, data.reorderLevel, data.unitCost, data.branchId ?? null]
  );
  return c.json({ id: result.meta.last_row_id });
});

app.put('/api/inventory/items/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  await d1Execute(
    `UPDATE Inventory SET ItemName = ?, Unit = ?, CurrentStock = ?, ReorderLevel = ?, UnitCost = ?, BranchId = ?
     WHERE Id = ?`,
    [data.itemName, data.unit, data.currentStock, data.reorderLevel, data.unitCost, data.branchId ?? null, id]
  );
  return c.json({ success: true });
});

app.delete('/api/inventory/items/:id', async (c) => {
  const id = c.req.param('id');
  await d1Execute('UPDATE Inventory SET IsDeleted = 1 WHERE Id = ?', [id]);
  return c.json({ success: true });
});

// ============================================
// TABLES
// ============================================

app.get('/api/tables', async (c) => {
  const result = await d1Query(
    'SELECT * FROM tbl_DiningTable WHERE IsActive = 1 AND IsDeleted = 0 ORDER BY TableNumber'
  );
  return c.json({ tables: result.results });
});

const tableSchema = z.object({
  tableNumber: z.string().min(1),
  capacity: z.number().int().positive(),
});

app.post('/api/tables', zValidator('json', tableSchema), async (c) => {
  const data = c.req.valid('json');
  const result = await d1Execute(
    'INSERT INTO tbl_DiningTable (TableNumber, Capacity) VALUES (?, ?)',
    [data.tableNumber, data.capacity]
  );
  return c.json({ id: result.meta.last_row_id });
});

app.put('/api/tables/:id/status', async (c) => {
  const id = c.req.param('id');
  const { status } = await c.req.json();
  await d1Execute('UPDATE tbl_DiningTable SET Status = ? WHERE Id = ?', [status, id]);
  return c.json({ success: true });
});

// ============================================
// PAYMENTS
// ============================================

const paymentSchema = z.object({
  orderId: z.number().int(),
  customerId: z.number().int().optional(),
  paymentMethod: z.string(),
  amountTendered: z.number(),
  pointsRedeemed: z.number().default(0),
});

app.post('/api/payments/settle', zValidator('json', paymentSchema), async (c) => {
  const data = c.req.valid('json');
  
  const orderResult = await d1Query('SELECT * FROM Orders WHERE Id = ?', [data.orderId]);
  const order = orderResult.results[0] as Record<string, unknown> | undefined;
  
  if (!order) {
    return c.json({ error: 'Order not found' }, 404);
  }
  
  const invoiceNumber = `INV-${Date.now()}`;
  const amountPayable = order.NetAmount as number;
  const changeDue = data.amountTendered - amountPayable;
  
  const result = await d1Execute(
    `INSERT INTO tbl_Payment (InvoiceNumber, OrderId, CustomerId, PaymentMethod, SubTotal, OrderDiscount, TierName, TierDiscountPercentage, TierDiscount, AmountDue, PointsRedeemed, PointsRedemptionAmount, AmountPayable, AmountTendered, ChangeDue, PointsEarned)
     VALUES (?, ?, ?, ?, ?, 0, NULL, 0, 0, ?, ?, 0, ?, ?, ?, 0)`,
    [invoiceNumber, data.orderId, data.customerId ?? null, data.paymentMethod, 
     order.TotalAmount as number, amountPayable, data.pointsRedeemed, amountPayable, data.amountTendered, changeDue]
  );
  
  await d1Execute("UPDATE Orders SET Status = 'Paid' WHERE Id = ?", [data.orderId]);
  
  return c.json({ id: result.meta.last_row_id, invoiceNumber });
});

app.get('/api/payments/invoices/:invoiceNumber', async (c) => {
  const invoiceNumber = c.req.param('invoiceNumber');
  const result = await d1Query(
    `SELECT p.*, o.OrderNumber, c.Name as CustomerName
     FROM tbl_Payment p
     LEFT JOIN Orders o ON p.OrderId = o.Id
     LEFT JOIN Customers c ON p.CustomerId = c.Id
     WHERE p.InvoiceNumber = ?`,
    [invoiceNumber]
  );
  
  if (result.results.length === 0) {
    return c.json({ error: 'Invoice not found' }, 404);
  }
  
  return c.json({ payment: result.results[0] });
});

// ============================================
// DASHBOARD
// ============================================

app.get('/api/dashboard/admin/summary', async (c) => {
  const [totalOrders, totalRevenue, totalCustomers, lowStockItems] = await Promise.all([
    d1Query("SELECT COUNT(*) as count FROM Orders WHERE IsActive = 1 AND IsDeleted = 0"),
    d1Query("SELECT COALESCE(SUM(NetAmount), 0) as total FROM Orders WHERE Status = 'Paid' AND IsActive = 1"),
    d1Query("SELECT COUNT(*) as count FROM Customers WHERE IsActive = 1 AND IsDeleted = 0"),
    d1Query("SELECT COUNT(*) as count FROM Inventory WHERE CurrentStock <= ReorderLevel AND IsActive = 1"),
  ]);
  
  return c.json({
    totalOrders: (totalOrders.results[0] as Record<string, unknown>)?.count || 0,
    totalRevenue: (totalRevenue.results[0] as Record<string, unknown>)?.total || 0,
    totalCustomers: (totalCustomers.results[0] as Record<string, unknown>)?.count || 0,
    lowStockItems: (lowStockItems.results[0] as Record<string, unknown>)?.count || 0,
  });
});

app.get('/api/dashboard/admin/revenue-chart', async (c) => {
  const result = await d1Query(
    `SELECT date(OrderDate) as date, SUM(NetAmount) as total
     FROM Orders
     WHERE Status = 'Paid' AND IsActive = 1
     GROUP BY date(OrderDate)
     ORDER BY date DESC
     LIMIT 30`
  );
  return c.json({ revenue: result.results });
});

// ============================================
// ANALYTICS
// ============================================

app.get('/api/analytics/overview', async (c) => {
  const [todayOrders, todayRevenue, topItems, recentOrders] = await Promise.all([
    d1Query("SELECT COUNT(*) as count FROM Orders WHERE date(OrderDate) = date('now')"),
    d1Query("SELECT COALESCE(SUM(NetAmount), 0) as total FROM Orders WHERE date(OrderDate) = date('now') AND Status = 'Paid'"),
    d1Query(
      `SELECT mi.Name, SUM(oi.Quantity) as totalQuantity, SUM(oi.TotalPrice) as totalRevenue
       FROM Order_Items oi
       LEFT JOIN Menu_Items mi ON oi.MenuItemId = mi.Id
       GROUP BY mi.Name
       ORDER BY totalQuantity DESC
       LIMIT 10`
    ),
    d1Query(
      `SELECT o.*, c.Name as CustomerName
       FROM Orders o
       LEFT JOIN Customers c ON o.CustomerId = c.Id
       ORDER BY o.OrderDate DESC
       LIMIT 10`
    ),
  ]);
  
  return c.json({
    todayOrders: (todayOrders.results[0] as Record<string, unknown>)?.count || 0,
    todayRevenue: (todayRevenue.results[0] as Record<string, unknown>)?.total || 0,
    topItems: topItems.results,
    recentOrders: recentOrders.results,
  });
});

// ============================================
// BRANCHES
// ============================================

app.get('/api/restaurants/branches', async (c) => {
  const result = await d1Query(
    'SELECT * FROM Restaurants WHERE IsActive = 1 AND IsDeleted = 0 ORDER BY BranchName'
  );
  return c.json({ branches: result.results });
});

const branchSchema = z.object({
  branchName: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  phone: z.string().min(1),
  operatingHours: z.string().min(1),
  managerId: z.number().int().optional(),
});

app.post('/api/restaurants/branches', zValidator('json', branchSchema), async (c) => {
  const data = c.req.valid('json');
  const result = await d1Execute(
    'INSERT INTO Restaurants (BranchName, Address, City, Phone, OperatingHours, ManagerId) VALUES (?, ?, ?, ?, ?, ?)',
    [data.branchName, data.address, data.city, data.phone, data.operatingHours, data.managerId || null]
  );
  return c.json({ id: result.meta.last_row_id });
});

// ============================================
// RATINGS
// ============================================

app.get('/api/ratings', async (c) => {
  const result = await d1Query(
    `SELECT r.*, mi.Name as ItemName, c.Name as CustomerName
     FROM Ratings r
     LEFT JOIN Menu_Items mi ON r.MenuItemId = mi.Id
     LEFT JOIN Customers c ON r.CustomerId = c.Id
     WHERE r.IsActive = 1 AND r.IsDeleted = 0
     ORDER BY r.CreatedAt DESC
     LIMIT 100`
  );
  return c.json({ ratings: result.results });
});

const ratingSchema = z.object({
  menuItemId: z.number().int(),
  customerId: z.number().int(),
  orderId: z.number().int().optional(),
  branchId: z.number().int().optional(),
  score: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

app.post('/api/ratings', zValidator('json', ratingSchema), async (c) => {
  const data = c.req.valid('json');
  const result = await d1Execute(
    'INSERT INTO Ratings (MenuItemId, CustomerId, OrderId, BranchId, Score, Comment) VALUES (?, ?, ?, ?, ?, ?)',
    [data.menuItemId, data.customerId, data.orderId ?? null, data.branchId ?? null, data.score, data.comment ?? null]
  );
  return c.json({ id: result.meta.last_row_id });
});

// ============================================
// PROMOTIONS
// ============================================

app.get('/api/promotions', async (c) => {
  const result = await d1Query(
    `SELECT p.*, mi.Name as ItemName, b.BranchName
     FROM Promotions p
     LEFT JOIN Menu_Items mi ON p.MenuItemId = mi.Id
     LEFT JOIN Restaurants b ON p.BranchId = b.Id
     WHERE p.IsActive = 1 AND p.IsDeleted = 0
     ORDER BY p.StartDate DESC`
  );
  return c.json({ promotions: result.results });
});

const promotionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  discountPercent: z.number().int().min(1).max(100),
  startDate: z.string(),
  endDate: z.string(),
  menuItemId: z.number().int().optional(),
  branchId: z.number().int().optional(),
  code: z.string().optional(),
});

app.post('/api/promotions', zValidator('json', promotionSchema), async (c) => {
  const data = c.req.valid('json');
  const result = await d1Execute(
    `INSERT INTO Promotions (Name, Description, DiscountPercent, StartDate, EndDate, MenuItemId, BranchId, Code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.name, data.description ?? null, data.discountPercent, data.startDate, data.endDate, 
     data.menuItemId ?? null, data.branchId ?? null, data.code ?? null]
  );
  return c.json({ id: result.meta.last_row_id });
});

// ============================================
// FAVORITES
// ============================================

app.get('/api/favorites', async (c) => {
  const payload = await getAuthUser(c.req.raw);
  if (!payload) return c.json({ error: 'Unauthorized' }, 401);
  
  const result = await d1Query(
    `SELECT f.*, mi.Name as ItemName, mi.Price, mi.Description
     FROM Customer_Favorites f
     LEFT JOIN Menu_Items mi ON f.MenuItemId = mi.Id
     WHERE f.CustomerId = ? AND f.IsActive = 1 AND f.IsDeleted = 0`,
    [payload.customerId ?? null]
  );
  return c.json({ favorites: result.results });
});

app.post('/api/favorites', async (c) => {
  const payload = await getAuthUser(c.req.raw);
  if (!payload) return c.json({ error: 'Unauthorized' }, 401);
  
  const { menuItemId } = await c.req.json();
  
  const existing = await d1Query(
    'SELECT Id FROM Customer_Favorites WHERE CustomerId = ? AND MenuItemId = ?',
    [payload.customerId, menuItemId]
  );
  
  if (existing.results.length > 0) {
    const existingId = (existing.results[0] as Record<string, unknown>).Id as number;
    await d1Execute('UPDATE Customer_Favorites SET IsActive = 1 WHERE Id = ?', [existingId]);
    return c.json({ id: existingId });
  }
  
  const result = await d1Execute(
    'INSERT INTO Customer_Favorites (CustomerId, MenuItemId) VALUES (?, ?)',
    [payload.customerId, menuItemId]
  );
  return c.json({ id: result.meta.last_row_id });
});

app.delete('/api/favorites/:id', async (c) => {
  const id = c.req.param('id');
  await d1Execute('UPDATE Customer_Favorites SET IsActive = 0 WHERE Id = ?', [id]);
  return c.json({ success: true });
});

// ============================================
// AUDIT LOGS
// ============================================

app.get('/api/audit-logs', async (c) => {
  const result = await d1Query(
    `SELECT a.*, u.FullName as UserName
     FROM tbl_AuditLog a
     LEFT JOIN tbl_Signup u ON a.UserId = u.Id
     ORDER BY a.Timestamp DESC
     LIMIT 100`
  );
  return c.json({ logs: result.results });
});

// ============================================
// 404 Handler
// ============================================

app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// ============================================
// Error Handler
// ============================================

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Internal server error' }, 500);
});

export default app;
