import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

// Types
interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

// App
const app = new Hono<{ Bindings: Env }>();

// CORS
app.use('*', cors({
  origin: [
    'http://localhost:5173',
    'https://dineiq.vercel.app',
    'https://frontend-rosy-nine-90.vercel.app',
    'https://frontend-3887dhs23-software-engineer9.vercel.app',
    'https://frontend-2dhlxow62-software-engineer9.vercel.app',
    'https://frontend-3sqzt3r5x-software-engineer9.vercel.app',
    'https://frontend-c8y86zta5-software-engineer9.vercel.app',
    'https://frontend-3tk8qa7lg-software-engineer9.vercel.app',
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
  credentials: true,
}));

// JWT Middleware
app.use('/api/*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  const token = authHeader.substring(7);
  try {
    const payload = await jwt.verify(token, c.env.JWT_SECRET);
    c.set('jwtPayload', payload);
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
  await next();
});

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
  
  const user = await c.env.DB.prepare(
    'SELECT * FROM tbl_Signup WHERE Email = ? AND IsActive = 1 AND IsDeleted = 0'
  ).bind(email).first();
  
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  
  // In production, use proper password hashing (bcrypt)
  // For now, simple comparison
  const isValid = password === user.PasswordHash; // TODO: Use bcrypt
  
  if (!isValid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  
  const token = await jwt.sign({
    userId: user.Id,
    email: user.Email,
    roleId: user.RoleId,
    customerId: user.CustomerId,
    branchId: user.BranchId,
  }, c.env.JWT_SECRET);
  
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
  
  const existing = await c.env.DB.prepare(
    'SELECT Id FROM tbl_Signup WHERE Email = ?'
  ).bind(data.email).first();
  
  if (existing) {
    return c.json({ error: 'Email already exists' }, 400);
  }
  
  const result = await c.env.DB.prepare(
    `INSERT INTO tbl_Signup (FullName, Email, PhoneNumber, PasswordHash, RoleId, CanAccessInventory, CanTriggerPipeline, CanAccessMenuManagement, CanAccessBranchAnalytics)
     VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0)`
  ).bind(data.fullName, data.email, data.phoneNumber || null, data.password, data.roleId).run();
  
  const token = await jwt.sign({
    userId: result.meta.last_row_id,
    email: data.email,
    roleId: data.roleId,
  }, c.env.JWT_SECRET);
  
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
  const payload = c.get('jwtPayload');
  const user = await c.env.DB.prepare(
    'SELECT Id, FullName, Email, RoleId, CustomerId, BranchId FROM tbl_Signup WHERE Id = ?'
  ).bind(payload.userId).first();
  
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }
  
  return c.json({ user });
});

// ============================================
// CATEGORIES
// ============================================

app.get('/api/categories', async (c) => {
  const categories = await c.env.DB.prepare(
    'SELECT * FROM Menu_Categories WHERE IsActive = 1 AND IsDeleted = 0 ORDER BY Name'
  ).all();
  return c.json({ categories: categories.results });
});

const categorySchema = z.object({
  name: z.string().min(1),
});

app.post('/api/categories', zValidator('json', categorySchema), async (c) => {
  const { name } = c.req.valid('json');
  const result = await c.env.DB.prepare(
    'INSERT INTO Menu_Categories (Name) VALUES (?)'
  ).bind(name).run();
  
  return c.json({ id: result.meta.last_row_id, name });
});

app.put('/api/categories/:id', async (c) => {
  const id = c.req.param('id');
  const { name } = await c.req.json();
  
  await c.env.DB.prepare(
    'UPDATE Menu_Categories SET Name = ? WHERE Id = ?'
  ).bind(name, id).run();
  
  return c.json({ success: true });
});

app.delete('/api/categories/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(
    'UPDATE Menu_Categories SET IsDeleted = 1 WHERE Id = ?'
  ).bind(id).run();
  return c.json({ success: true });
});

// ============================================
// MENU ITEMS
// ============================================

app.get('/api/menu-items', async (c) => {
  const items = await c.env.DB.prepare(
    `SELECT mi.*, c.Name as CategoryName 
     FROM Menu_Items mi 
     LEFT JOIN Menu_Categories c ON mi.CategoryId = c.Id 
     WHERE mi.IsActive = 1 AND mi.IsDeleted = 0 
     ORDER BY mi.Name`
  ).all();
  return c.json({ items: items.results });
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
  const result = await c.env.DB.prepare(
    `INSERT INTO Menu_Items (CategoryId, Name, Description, Price, Cost, IsAvailable)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(data.categoryId, data.name, data.description || null, data.price, data.cost, data.isAvailable ? 1 : 0).run();
  
  return c.json({ id: result.meta.last_row_id });
});

app.put('/api/menu-items/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  
  await c.env.DB.prepare(
    `UPDATE Menu_Items SET CategoryId = ?, Name = ?, Description = ?, Price = ?, Cost = ?, IsAvailable = ?
     WHERE Id = ?`
  ).bind(data.categoryId, data.name, data.description || null, data.price, data.cost, data.isAvailable ? 1 : 0, id).run();
  
  return c.json({ success: true });
});

app.delete('/api/menu-items/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(
    'UPDATE Menu_Items SET IsDeleted = 1 WHERE Id = ?'
  ).bind(id).run();
  return c.json({ success: true });
});

// ============================================
// ORDERS
// ============================================

app.get('/api/orders', async (c) => {
  const orders = await c.env.DB.prepare(
    `SELECT o.*, c.Name as CustomerName, t.TableNumber, b.BranchName
     FROM Orders o
     LEFT JOIN Customers c ON o.CustomerId = c.Id
     LEFT JOIN tbl_DiningTable t ON o.TableId = t.Id
     LEFT JOIN Restaurants b ON o.BranchId = b.Id
     WHERE o.IsActive = 1 AND o.IsDeleted = 0
     ORDER BY o.OrderDate DESC
     LIMIT 100`
  ).all();
  return c.json({ orders: orders.results });
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
  const payload = c.get('jwtPayload');
  
  // Generate order number
  const orderNumber = `ORD-${Date.now()}`;
  
  // Calculate totals
  let totalAmount = 0;
  for (const item of data.items) {
    totalAmount += item.quantity * item.unitPrice;
  }
  
  const result = await c.env.DB.prepare(
    `INSERT INTO Orders (CustomerId, TableId, BranchId, GuestCount, OrderNumber, OrderType, PaymentMethod, Status, TotalAmount, Discount, NetAmount)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?, 0, ?)`
  ).bind(data.customerId || null, data.tableId || null, data.branchId || payload.branchId || null, 
        data.guestCount, orderNumber, data.orderType, data.paymentMethod, totalAmount, totalAmount).run();
  
  const orderId = result.meta.last_row_id;
  
  // Insert order items
  for (const item of data.items) {
    const totalPrice = item.quantity * item.unitPrice;
    await c.env.DB.prepare(
      `INSERT INTO Order_Items (OrderId, MenuItemId, Quantity, UnitPrice, TotalPrice)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(orderId, item.menuItemId, item.quantity, item.unitPrice, totalPrice).run();
  }
  
  return c.json({ id: orderId, orderNumber });
});

app.get('/api/orders/:id', async (c) => {
  const id = c.req.param('id');
  const order = await c.env.DB.prepare(
    `SELECT o.*, c.Name as CustomerName, t.TableNumber, b.BranchName
     FROM Orders o
     LEFT JOIN Customers c ON o.CustomerId = c.Id
     LEFT JOIN tbl_DiningTable t ON o.TableId = t.Id
     LEFT JOIN Restaurants b ON o.BranchId = b.Id
     WHERE o.Id = ?`
  ).bind(id).first();
  
  if (!order) {
    return c.json({ error: 'Order not found' }, 404);
  }
  
  const items = await c.env.DB.prepare(
    `SELECT oi.*, mi.Name as ItemName
     FROM Order_Items oi
     LEFT JOIN Menu_Items mi ON oi.MenuItemId = mi.Id
     WHERE oi.OrderId = ?`
  ).bind(id).all();
  
  return c.json({ order, items: items.results });
});

app.put('/api/orders/:id/status', async (c) => {
  const id = c.req.param('id');
  const { status } = await c.req.json();
  
  await c.env.DB.prepare(
    'UPDATE Orders SET Status = ? WHERE Id = ?'
  ).bind(status, id).run();
  
  return c.json({ success: true });
});

// ============================================
// CUSTOMERS
// ============================================

app.get('/api/customers', async (c) => {
  const customers = await c.env.DB.prepare(
    'SELECT * FROM Customers WHERE IsActive = 1 AND IsDeleted = 0 ORDER BY Name LIMIT 100'
  ).all();
  return c.json({ customers: customers.results });
});

const customerSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  address: z.string().optional(),
});

app.post('/api/customers', zValidator('json', customerSchema), async (c) => {
  const data = c.req.valid('json');
  const result = await c.env.DB.prepare(
    'INSERT INTO Customers (Name, Phone, Email, Address) VALUES (?, ?, ?, ?)'
  ).bind(data.name, data.phone, data.email || null, data.address || null).run();
  
  return c.json({ id: result.meta.last_row_id });
});

app.put('/api/customers/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  
  await c.env.DB.prepare(
    'UPDATE Customers SET Name = ?, Phone = ?, Email = ?, Address = ? WHERE Id = ?'
  ).bind(data.name, data.phone, data.email || null, data.address || null, id).run();
  
  return c.json({ success: true });
});

// ============================================
// INVENTORY
// ============================================

app.get('/api/inventory/items', async (c) => {
  const items = await c.env.DB.prepare(
    `SELECT i.*, b.BranchName
     FROM Inventory i
     LEFT JOIN Restaurants b ON i.BranchId = b.Id
     WHERE i.IsActive = 1 AND i.IsDeleted = 0
     ORDER BY i.ItemName`
  ).all();
  return c.json({ items: items.results });
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
  const result = await c.env.DB.prepare(
    `INSERT INTO Inventory (ItemName, Unit, CurrentStock, ReorderLevel, UnitCost, BranchId)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(data.itemName, data.unit, data.currentStock, data.reorderLevel, data.unitCost, data.branchId || null).run();
  
  return c.json({ id: result.meta.last_row_id });
});

app.put('/api/inventory/items/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  
  await c.env.DB.prepare(
    `UPDATE Inventory SET ItemName = ?, Unit = ?, CurrentStock = ?, ReorderLevel = ?, UnitCost = ?, BranchId = ?
     WHERE Id = ?`
  ).bind(data.itemName, data.unit, data.currentStock, data.reorderLevel, data.unitCost, data.branchId || null, id).run();
  
  return c.json({ success: true });
});

app.delete('/api/inventory/items/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(
    'UPDATE Inventory SET IsDeleted = 1 WHERE Id = ?'
  ).bind(id).run();
  return c.json({ success: true });
});

// ============================================
// TABLES
// ============================================

app.get('/api/tables', async (c) => {
  const tables = await c.env.DB.prepare(
    'SELECT * FROM tbl_DiningTable WHERE IsActive = 1 AND IsDeleted = 0 ORDER BY TableNumber'
  ).all();
  return c.json({ tables: tables.results });
});

const tableSchema = z.object({
  tableNumber: z.string().min(1),
  capacity: z.number().int().positive(),
});

app.post('/api/tables', zValidator('json', tableSchema), async (c) => {
  const data = c.req.valid('json');
  const result = await c.env.DB.prepare(
    'INSERT INTO tbl_DiningTable (TableNumber, Capacity) VALUES (?, ?)'
  ).bind(data.tableNumber, data.capacity).run();
  
  return c.json({ id: result.meta.last_row_id });
});

app.put('/api/tables/:id/status', async (c) => {
  const id = c.req.param('id');
  const { status } = await c.req.json();
  
  await c.env.DB.prepare(
    'UPDATE tbl_DiningTable SET Status = ? WHERE Id = ?'
  ).bind(status, id).run();
  
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
  const payload = c.get('jwtPayload');
  
  const order = await c.env.DB.prepare(
    'SELECT * FROM Orders WHERE Id = ?'
  ).bind(data.orderId).first();
  
  if (!order) {
    return c.json({ error: 'Order not found' }, 404);
  }
  
  const invoiceNumber = `INV-${Date.now()}`;
  const amountPayable = order.NetAmount;
  const changeDue = data.amountTendered - amountPayable;
  
  const result = await c.env.DB.prepare(
    `INSERT INTO tbl_Payment (InvoiceNumber, OrderId, CustomerId, PaymentMethod, SubTotal, OrderDiscount, TierName, TierDiscountPercentage, TierDiscount, AmountDue, PointsRedeemed, PointsRedemptionAmount, AmountPayable, AmountTendered, ChangeDue, PointsEarned)
     VALUES (?, ?, ?, ?, ?, 0, NULL, 0, 0, ?, ?, 0, ?, ?, ?, 0)`
  ).bind(invoiceNumber, data.orderId, data.customerId || null, data.paymentMethod, 
        order.TotalAmount, amountPayable, data.pointsRedeemed, amountPayable, data.amountTendered, changeDue).run();
  
  // Update order status
  await c.env.DB.prepare(
    "UPDATE Orders SET Status = 'Paid' WHERE Id = ?"
  ).bind(data.orderId).run();
  
  return c.json({ id: result.meta.last_row_id, invoiceNumber });
});

app.get('/api/payments/invoices/:invoiceNumber', async (c) => {
  const invoiceNumber = c.req.param('invoiceNumber');
  const payment = await c.env.DB.prepare(
    `SELECT p.*, o.OrderNumber, c.Name as CustomerName
     FROM tbl_Payment p
     LEFT JOIN Orders o ON p.OrderId = o.Id
     LEFT JOIN Customers c ON p.CustomerId = c.Id
     WHERE p.InvoiceNumber = ?`
  ).bind(invoiceNumber).first();
  
  if (!payment) {
    return c.json({ error: 'Invoice not found' }, 404);
  }
  
  return c.json({ payment });
});

// ============================================
// DASHBOARD
// ============================================

app.get('/api/dashboard/admin/summary', async (c) => {
  const payload = c.get('jwtPayload');
  
  const [totalOrders, totalRevenue, totalCustomers, lowStockItems] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) as count FROM Orders WHERE IsActive = 1 AND IsDeleted = 0").first(),
    c.env.DB.prepare("SELECT COALESCE(SUM(NetAmount), 0) as total FROM Orders WHERE Status = 'Paid' AND IsActive = 1").first(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM Customers WHERE IsActive = 1 AND IsDeleted = 0").first(),
    c.env.DB.prepare("SELECT COUNT(*) as count FROM Inventory WHERE CurrentStock <= ReorderLevel AND IsActive = 1").first(),
  ]);
  
  return c.json({
    totalOrders: totalOrders?.count || 0,
    totalRevenue: totalRevenue?.total || 0,
    totalCustomers: totalCustomers?.count || 0,
    lowStockItems: lowStockItems?.count || 0,
  });
});

app.get('/api/dashboard/admin/revenue-chart', async (c) => {
  const revenue = await c.env.DB.prepare(
    `SELECT date(OrderDate) as date, SUM(NetAmount) as total
     FROM Orders
     WHERE Status = 'Paid' AND IsActive = 1
     GROUP BY date(OrderDate)
     ORDER BY date DESC
     LIMIT 30`
  ).all();
  
  return c.json({ revenue: revenue.results });
});

// ============================================
// ANALYTICS
// ============================================

app.get('/api/analytics/overview', async (c) => {
  const [todayOrders, todayRevenue, topItems, recentOrders] = await Promise.all([
    c.env.DB.prepare("SELECT COUNT(*) as count FROM Orders WHERE date(OrderDate) = date('now')").first(),
    c.env.DB.prepare("SELECT COALESCE(SUM(NetAmount), 0) as total FROM Orders WHERE date(OrderDate) = date('now') AND Status = 'Paid'").first(),
    c.env.DB.prepare(
      `SELECT mi.Name, SUM(oi.Quantity) as totalQuantity, SUM(oi.TotalPrice) as totalRevenue
       FROM Order_Items oi
       LEFT JOIN Menu_Items mi ON oi.MenuItemId = mi.Id
       GROUP BY mi.Name
       ORDER BY totalQuantity DESC
       LIMIT 10`
    ).all(),
    c.env.DB.prepare(
      `SELECT o.*, c.Name as CustomerName
       FROM Orders o
       LEFT JOIN Customers c ON o.CustomerId = c.Id
       ORDER BY o.OrderDate DESC
       LIMIT 10`
    ).all(),
  ]);
  
  return c.json({
    todayOrders: todayOrders?.count || 0,
    todayRevenue: todayRevenue?.total || 0,
    topItems: topItems.results,
    recentOrders: recentOrders.results,
  });
});

// ============================================
// BRANCHES
// ============================================

app.get('/api/restaurants/branches', async (c) => {
  const branches = await c.env.DB.prepare(
    'SELECT * FROM Restaurants WHERE IsActive = 1 AND IsDeleted = 0 ORDER BY BranchName'
  ).all();
  return c.json({ branches: branches.results });
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
  const result = await c.env.DB.prepare(
    'INSERT INTO Restaurants (BranchName, Address, City, Phone, OperatingHours, ManagerId) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(data.branchName, data.address, data.city, data.phone, data.operatingHours, data.managerId || null).run();
  
  return c.json({ id: result.meta.last_row_id });
});

// ============================================
// RATINGS
// ============================================

app.get('/api/ratings', async (c) => {
  const ratings = await c.env.DB.prepare(
    `SELECT r.*, mi.Name as ItemName, c.Name as CustomerName
     FROM Ratings r
     LEFT JOIN Menu_Items mi ON r.MenuItemId = mi.Id
     LEFT JOIN Customers c ON r.CustomerId = c.Id
     WHERE r.IsActive = 1 AND r.IsDeleted = 0
     ORDER BY r.CreatedAt DESC
     LIMIT 100`
  ).all();
  return c.json({ ratings: ratings.results });
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
  const result = await c.env.DB.prepare(
    'INSERT INTO Ratings (MenuItemId, CustomerId, OrderId, BranchId, Score, Comment) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(data.menuItemId, data.customerId, data.orderId || null, data.branchId || null, data.score, data.comment || null).run();
  
  return c.json({ id: result.meta.last_row_id });
});

// ============================================
// PROMOTIONS
// ============================================

app.get('/api/promotions', async (c) => {
  const promotions = await c.env.DB.prepare(
    `SELECT p.*, mi.Name as ItemName, b.BranchName
     FROM Promotions p
     LEFT JOIN Menu_Items mi ON p.MenuItemId = mi.Id
     LEFT JOIN Restaurants b ON p.BranchId = b.Id
     WHERE p.IsActive = 1 AND p.IsDeleted = 0
     ORDER BY p.StartDate DESC`
  ).all();
  return c.json({ promotions: promotions.results });
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
  const result = await c.env.DB.prepare(
    `INSERT INTO Promotions (Name, Description, DiscountPercent, StartDate, EndDate, MenuItemId, BranchId, Code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(data.name, data.description || null, data.discountPercent, data.startDate, data.endDate, 
        data.menuItemId || null, data.branchId || null, data.code || null).run();
  
  return c.json({ id: result.meta.last_row_id });
});

// ============================================
// FAVORITES
// ============================================

app.get('/api/favorites', async (c) => {
  const payload = c.get('jwtPayload');
  const favorites = await c.env.DB.prepare(
    `SELECT f.*, mi.Name as ItemName, mi.Price, mi.Description
     FROM Customer_Favorites f
     LEFT JOIN Menu_Items mi ON f.MenuItemId = mi.Id
     WHERE f.CustomerId = ? AND f.IsActive = 1 AND f.IsDeleted = 0`
  ).bind(payload.customerId).all();
  return c.json({ favorites: favorites.results });
});

app.post('/api/favorites', async (c) => {
  const payload = c.get('jwtPayload');
  const { menuItemId } = await c.req.json();
  
  const existing = await c.env.DB.prepare(
    'SELECT Id FROM Customer_Favorites WHERE CustomerId = ? AND MenuItemId = ?'
  ).bind(payload.customerId, menuItemId).first();
  
  if (existing) {
    await c.env.DB.prepare(
      'UPDATE Customer_Favorites SET IsActive = 1 WHERE Id = ?'
    ).bind(existing.Id).run();
    return c.json({ id: existing.Id });
  }
  
  const result = await c.env.DB.prepare(
    'INSERT INTO Customer_Favorites (CustomerId, MenuItemId) VALUES (?, ?)'
  ).bind(payload.customerId, menuItemId).run();
  
  return c.json({ id: result.meta.last_row_id });
});

app.delete('/api/favorites/:id', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(
    'UPDATE Customer_Favorites SET IsActive = 0 WHERE Id = ?'
  ).bind(id).run();
  return c.json({ success: true });
});

// ============================================
// AUDIT LOGS
// ============================================

app.get('/api/audit-logs', async (c) => {
  const logs = await c.env.DB.prepare(
    `SELECT a.*, u.FullName as UserName
     FROM tbl_AuditLog a
     LEFT JOIN tbl_Signup u ON a.UserId = u.Id
     ORDER BY a.Timestamp DESC
     LIMIT 100`
  ).all();
  return c.json({ logs: logs.results });
});

// ============================================
// ROLES
// ============================================

app.get('/api/auth/roles', async (c) => {
  const roles = await c.env.DB.prepare(
    'SELECT * FROM tbl_Role WHERE IsActive = 1 AND IsDeleted = 0'
  ).all();
  return c.json({ roles: roles.results });
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
