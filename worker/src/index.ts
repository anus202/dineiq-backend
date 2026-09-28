import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { sign as jwtSign, verify as jwtVerify } from 'hono/jwt';

interface Env { DB: D1Database; JWT_SECRET: string; }

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({
  origin: [
    'http://localhost:5173',
    'https://dineiq.vercel.app',
    'https://frontend-rosy-nine-90.vercel.app',
    'https://frontend-glxqoyg1u-software-engineer9.vercel.app',
    'https://frontend-2dhlxow62-software-engineer9.vercel.app',
    'https://frontend-3887dhs23-software-engineer9.vercel.app',
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
  credentials: true,
}));

// API responses must never be cached by the edge.
app.use('/api/*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate');
});

app.get('/api/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

const PUBLIC = new Set(['/api/health', '/api/auth/login', '/api/auth/signup']);
app.use('/api/*', async (c, next) => {
  if (PUBLIC.has(c.req.path)) return next();
  const h = c.req.header('Authorization');
  if (!h || !h.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401);
  try {
    c.set('jwtPayload', await jwtVerify(h.substring(7), c.env.JWT_SECRET, 'HS256'));
  } catch { return c.json({ error: 'Invalid token' }, 401); }
  await next();
});

// ---------- helpers ----------
type Any = Record<string, any>;
const all = async (db: D1Database, sql: string, ...p: any[]): Promise<Any[]> => (await db.prepare(sql).bind(...p).all()).results as Any[];
const one = async (db: D1Database, sql: string, ...p: any[]): Promise<Any | null> => (await db.prepare(sql).bind(...p).first()) as Any | null;
const run = async (db: D1Database, sql: string, ...p: any[]) => await db.prepare(sql).bind(...p).run();
const num = (v: any): number => (v === null || v === undefined ? 0 : Number(v));
const bool = (v: any): boolean => !!Number(v);
const qInt = (c: any, k: string, d: number): number => { const v = Number(c.req.query(k)); return Number.isFinite(v) && v !== 0 ? v : (c.req.query(k) === '0' ? 0 : d); };
const nowIso = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const today = () => new Date().toISOString().slice(0, 10);
const pageOf = (c: any, items: Any[], total: number) => ({ Total: total, Skip: qInt(c, 'skip', 0), Limit: qInt(c, 'limit', items.length || 100), Items: items });

async function loadUser(db: D1Database, userId: number) {
  const row = await one(db,
    `SELECT s.Id, s.FullName, s.Email, s.PhoneNumber, s.CustomerId, s.BranchId,
            s.CanAccessInventory, s.CanTriggerPipeline, s.CanAccessMenuManagement,
            s.CanAccessBranchAnalytics, s.IsActive, s.CreatedAt,
            r.Name AS RoleName, b.BranchName AS BranchName
     FROM tbl_Signup s LEFT JOIN tbl_Role r ON s.RoleId = r.Id
     LEFT JOIN Restaurants b ON s.BranchId = b.Id WHERE s.Id = ?`, userId);
  if (!row) return null;
  return {
    Id: row.Id, FullName: row.FullName, Email: row.Email, PhoneNumber: row.PhoneNumber ?? null,
    Role: row.RoleName ?? 'CUSTOMER', CustomerId: row.CustomerId ?? null, BranchId: row.BranchId ?? null,
    BranchName: row.BranchName ?? null, CanAccessInventory: bool(row.CanAccessInventory),
    CanTriggerPipeline: bool(row.CanTriggerPipeline), CanAccessMenuManagement: bool(row.CanAccessMenuManagement),
    CanAccessBranchAnalytics: bool(row.CanAccessBranchAnalytics), IsActive: bool(row.IsActive), CreatedAt: row.CreatedAt,
  };
}

// ---------- AUTH ----------
app.post('/api/auth/login', async (c) => {
  const { Email, Password } = await c.req.json();
  const user = await one(c.env.DB, 'SELECT * FROM tbl_Signup WHERE Email = ? AND IsActive = 1 AND IsDeleted = 0', Email);
  if (!user || Password !== user.PasswordHash) {
    return c.json({ Success: false, Message: 'Invalid credentials', Token: null, TokenType: null, Data: null }, 401);
  }
  const token = await jwtSign({ userId: user.Id, roleId: user.RoleId, customerId: user.CustomerId, branchId: user.BranchId, exp: Math.floor(Date.now() / 1000) + 86400 }, c.env.JWT_SECRET);
  return c.json({ Success: true, Message: 'Login successful', Token: token, TokenType: 'Bearer', Data: await loadUser(c.env.DB, user.Id) });
});

app.post('/api/auth/signup', async (c) => {
  const d = await c.req.json();
  const exists = await one(c.env.DB, 'SELECT Id FROM tbl_Signup WHERE Email = ?', d.Email);
  if (exists) return c.json({ Success: false, Message: 'Email already exists', Token: null, TokenType: null, Data: null }, 400);
  const role = await one(c.env.DB, "SELECT Id FROM tbl_Role WHERE Name = 'CUSTOMER'");
  const res = await run(c.env.DB,
    `INSERT INTO tbl_Signup (FullName, Email, PhoneNumber, PasswordHash, RoleId) VALUES (?, ?, ?, ?, ?)`,
    d.FullName, d.Email, d.PhoneNumber ?? null, d.Password, role?.Id ?? 5);
  const id = Number(res.meta.last_row_id);
  const token = await jwtSign({ userId: id, roleId: role?.Id ?? 5, exp: Math.floor(Date.now() / 1000) + 86400 }, c.env.JWT_SECRET);
  return c.json({ Success: true, Message: 'Signup successful', Token: token, TokenType: 'Bearer', Data: await loadUser(c.env.DB, id) });
});

app.get('/api/auth/me', async (c) => {
  const u = await loadUser(c.env.DB, c.get('jwtPayload').userId);
  return u ? c.json(u) : c.json({ error: 'User not found' }, 404);
});

// ---------- CATEGORIES ----------
app.get('/api/categories', async (c) => {
  const rows = await all(c.env.DB, 'SELECT * FROM Menu_Categories WHERE IsActive = 1 AND IsDeleted = 0 ORDER BY Name');
  return c.json(rows.map((r) => ({ Id: r.Id, Name: r.Name, IsActive: bool(r.IsActive), CreatedBy: r.CreatedBy ?? null, UpdatedBy: r.UpdatedBy ?? null, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt })));
});

app.post('/api/categories', async (c) => {
  const { Name } = await c.req.json();
  const res = await run(c.env.DB, 'INSERT INTO Menu_Categories (Name) VALUES (?)', Name);
  const r = await one(c.env.DB, 'SELECT * FROM Menu_Categories WHERE Id = ?', res.meta.last_row_id);
  return c.json({ Id: r!.Id, Name: r!.Name, IsActive: true, CreatedBy: null, UpdatedBy: null, CreatedAt: r!.CreatedAt, UpdatedAt: r!.UpdatedAt });
});

app.put('/api/categories/:id', async (c) => {
  const { Name } = await c.req.json();
  await run(c.env.DB, 'UPDATE Menu_Categories SET Name = ?, UpdatedAt = ? WHERE Id = ?', Name, nowIso(), c.req.param('id'));
  const r = await one(c.env.DB, 'SELECT * FROM Menu_Categories WHERE Id = ?', c.req.param('id'));
  return c.json({ Id: r!.Id, Name: r!.Name, IsActive: bool(r!.IsActive), CreatedBy: r!.CreatedBy ?? null, UpdatedBy: r!.UpdatedBy ?? null, CreatedAt: r!.CreatedAt, UpdatedAt: r!.UpdatedAt });
});

app.delete('/api/categories/:id', async (c) => {
  await run(c.env.DB, 'UPDATE Menu_Categories SET IsDeleted = 1, IsActive = 0 WHERE Id = ?', c.req.param('id'));
  return c.body(null, 204);
});

// ---------- MENU ITEMS ----------
function mapMenu(r: Any) {
  return {
    Id: r.Id, CategoryId: r.CategoryId, Name: r.Name, Description: r.Description ?? null,
    Price: num(r.Price), Cost: num(r.Cost), IsAvailable: bool(r.IsAvailable), IsActive: bool(r.IsActive),
    Category: { CategoryId: r.CategoryId, CategoryName: r.CategoryName ?? '' },
    CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
    ContributionMargin: num(r.Price) - num(r.Cost),
    ProfitMarginPercentage: num(r.Price) > 0 ? ((num(r.Price) - num(r.Cost)) / num(r.Price)) * 100 : 0,
  };
}

app.get('/api/menu-items', async (c) => {
  const search = c.req.query('search');
  const cat = c.req.query('category_id');
  const onlyAvail = c.req.query('is_available') === 'true';
  let sql = `SELECT mi.*, mc.Name AS CategoryName FROM Menu_Items mi LEFT JOIN Menu_Categories mc ON mi.CategoryId = mc.Id WHERE mi.IsDeleted = 0`;
  const p: any[] = [];
  if (search) { sql += ' AND mi.Name LIKE ?'; p.push(`%${search}%`); }
  if (cat) { sql += ' AND mi.CategoryId = ?'; p.push(cat); }
  if (onlyAvail) sql += ' AND mi.IsAvailable = 1';
  sql += ' ORDER BY mi.Name LIMIT ? OFFSET ?';
  const limit = qInt(c, 'limit', 100), skip = qInt(c, 'skip', 0);
  const rows = await all(c.env.DB, sql, ...p, limit, skip);
  let countSql = 'SELECT COUNT(*) AS n FROM Menu_Items mi WHERE mi.IsDeleted = 0';
  const cp: any[] = [];
  if (search) { countSql += ' AND mi.Name LIKE ?'; cp.push(`%${search}%`); }
  if (cat) { countSql += ' AND mi.CategoryId = ?'; cp.push(cat); }
  if (onlyAvail) countSql += ' AND mi.IsAvailable = 1';
  const total = num((await one(c.env.DB, countSql, ...cp))?.n);
  return c.json(pageOf(c, rows.map(mapMenu), total));
});

async function fetchMenu(db: D1Database, id: any) {
  const r = await one(db, `SELECT mi.*, mc.Name AS CategoryName FROM Menu_Items mi LEFT JOIN Menu_Categories mc ON mi.CategoryId = mc.Id WHERE mi.Id = ?`, id);
  return r ? mapMenu(r) : null;
}

app.post('/api/menu-items', async (c) => {
  const d = await c.req.json();
  const res = await run(c.env.DB, `INSERT INTO Menu_Items (CategoryId, Name, Description, Price, Cost, IsAvailable) VALUES (?,?,?,?,?,?)`,
    d.CategoryId, d.Name, d.Description ?? null, d.Price, d.Cost ?? 0, d.IsAvailable ? 1 : 0);
  return c.json(await fetchMenu(c.env.DB, res.meta.last_row_id));
});

app.put('/api/menu-items/:id', async (c) => {
  const d = await c.req.json();
  const cur = await one(c.env.DB, 'SELECT * FROM Menu_Items WHERE Id = ?', c.req.param('id'));
  if (!cur) return c.json({ error: 'Not found' }, 404);
  const next = {
    CategoryId: d.CategoryId ?? cur.CategoryId, Name: d.Name ?? cur.Name,
    Description: d.Description ?? cur.Description, Price: d.Price ?? cur.Price,
    Cost: d.Cost ?? cur.Cost, IsAvailable: d.IsAvailable === undefined ? cur.IsAvailable : (d.IsAvailable ? 1 : 0),
  };
  if (d.Price !== undefined && num(d.Price) !== num(cur.Price)) {
    await run(c.env.DB, 'INSERT INTO Pricing_History (MenuItemId, OldPrice, NewPrice) VALUES (?,?,?)', cur.Id, cur.Price, d.Price);
  }
  await run(c.env.DB, `UPDATE Menu_Items SET CategoryId=?, Name=?, Description=?, Price=?, Cost=?, IsAvailable=?, UpdatedAt=? WHERE Id=?`,
    next.CategoryId, next.Name, next.Description, next.Price, next.Cost, next.IsAvailable, nowIso(), c.req.param('id'));
  return c.json(await fetchMenu(c.env.DB, c.req.param('id')));
});

app.delete('/api/menu-items/:id', async (c) => {
  await run(c.env.DB, 'UPDATE Menu_Items SET IsDeleted = 1, IsActive = 0 WHERE Id = ?', c.req.param('id'));
  return c.body(null, 204);
});

// ---------- CUSTOMERS ----------
app.get('/api/customers', async (c) => {
  const search = c.req.query('search');
  let sql = 'SELECT * FROM Customers WHERE IsDeleted = 0';
  const p: any[] = [];
  if (search) { sql += ' AND (Name LIKE ? OR Phone LIKE ?)'; p.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY Name LIMIT ? OFFSET ?';
  const rows = await all(c.env.DB, sql, ...p, qInt(c, 'limit', 50), qInt(c, 'skip', 0));
  const total = num((await one(c.env.DB, search ? 'SELECT COUNT(*) n FROM Customers WHERE IsDeleted=0 AND (Name LIKE ? OR Phone LIKE ?)' : 'SELECT COUNT(*) n FROM Customers WHERE IsDeleted=0', ...(search ? [`%${search}%`, `%${search}%`] : [])))?.n);
  return c.json(pageOf(c, rows.map((r) => ({ Id: r.Id, Name: r.Name, Phone: r.Phone, Email: r.Email ?? null, Address: r.Address ?? null, LoyaltyPoints: num(r.LoyaltyPoints), IsActive: bool(r.IsActive), CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt })), total));
});

app.get('/api/customers/:id', async (c) => {
  const id = c.req.param('id');
  const r = await one(c.env.DB, 'SELECT * FROM Customers WHERE Id = ?', id);
  if (!r) return c.json({ error: 'Not found' }, 404);
  const agg = await one(c.env.DB, `SELECT COUNT(*) c, COALESCE(SUM(NetAmount),0) s, COALESCE(SUM(GuestCount),0) g, MAX(OrderDate) last FROM Orders WHERE CustomerId = ? AND IsDeleted = 0`, id);
  const recent = await all(c.env.DB, `SELECT Id, OrderNumber, OrderDate, OrderType, Status, GuestCount, TotalAmount, NetAmount FROM Orders WHERE CustomerId = ? AND IsDeleted = 0 ORDER BY OrderDate DESC LIMIT 10`, id);
  const totalOrders = num(agg?.c), totalSpent = num(agg?.s), totalGuests = num(agg?.g);
  return c.json({
    Id: r.Id, Name: r.Name, Phone: r.Phone, Email: r.Email ?? null, Address: r.Address ?? null,
    LoyaltyPoints: num(r.LoyaltyPoints), IsActive: bool(r.IsActive), CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
    Stats: {
      TotalOrders: totalOrders, TotalSpent: totalSpent, TotalGuests: totalGuests, LastOrderDate: agg?.last ?? null,
      AverageOrderValue: totalOrders ? totalSpent / totalOrders : 0,
      AverageSpendPerGuest: totalGuests ? totalSpent / totalGuests : 0,
    },
    RecentOrders: recent.map((o) => ({ Id: o.Id, OrderNumber: o.OrderNumber, OrderDate: o.OrderDate, OrderType: o.OrderType, Status: o.Status, GuestCount: num(o.GuestCount), TotalAmount: num(o.TotalAmount), NetAmount: num(o.NetAmount) })),
  });
});

app.get('/api/customers/:id/analytics', async (c) => {
  const id = c.req.param('id');
  const r = await one(c.env.DB, 'SELECT * FROM Customers WHERE Id = ?', id);
  const agg = await one(c.env.DB, `SELECT COUNT(*) c, COALESCE(SUM(NetAmount),0) s, MAX(OrderDate) last FROM Orders WHERE CustomerId = ? AND IsDeleted = 0`, id);
  const last = agg?.last ?? null;
  const recency = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
  return c.json({
    CustomerId: Number(id), CustomerName: r?.Name ?? '', LastOrderDate: last, RecencyDays: recency,
    Frequency: num(agg?.c), MonetaryValue: num(agg?.s), RScore: null, FScore: null, MScore: null,
    RFMScore: null, Segment: 'New', LoyaltyPoints: num(r?.LoyaltyPoints),
  });
});

// ---------- AUDIT LOGS ----------
app.get('/api/audit-logs', async (c) => {
  const rows = await all(c.env.DB, `SELECT a.*, u.FullName UserName, u.Email UserEmail FROM tbl_AuditLog a LEFT JOIN tbl_Signup u ON a.UserId = u.Id ORDER BY a.Timestamp DESC LIMIT ? OFFSET ?`, qInt(c, 'limit', 50), qInt(c, 'skip', 0));
  const total = num((await one(c.env.DB, 'SELECT COUNT(*) n FROM tbl_AuditLog'))?.n);
  return c.json(pageOf(c, rows.map((r) => ({
    Id: r.Id, UserId: r.UserId ?? null, UserName: r.UserName ?? null, UserEmail: r.UserEmail ?? null,
    Action: r.Action, EntityName: r.EntityName, EntityId: r.EntityId ?? null,
    OldValues: r.OldValues ? JSON.parse(r.OldValues) : null, NewValues: r.NewValues ? JSON.parse(r.NewValues) : null,
    IPAddress: r.IPAddress ?? null, Timestamp: r.Timestamp,
  })), total));
});

app.get('/api/audit-logs/filters', async (c) => {
  const actions = await all(c.env.DB, 'SELECT DISTINCT Action FROM tbl_AuditLog');
  const entities = await all(c.env.DB, 'SELECT DISTINCT EntityName FROM tbl_AuditLog');
  return c.json({ Actions: actions.map((a) => a.Action), Entities: entities.map((e) => e.EntityName) });
});

// ---------- BRANCHES ----------
app.get('/api/restaurants/branches', async (c) => {
  const search = c.req.query('search');
  let sql = `SELECT b.*, u.FullName ManagerName, (SELECT COALESCE(SUM(NetAmount),0) FROM Orders o WHERE o.BranchId = b.Id AND o.IsDeleted = 0) TotalRevenue
             FROM Restaurants b LEFT JOIN tbl_Signup u ON b.ManagerId = u.Id WHERE b.IsDeleted = 0`;
  const p: any[] = [];
  if (search) { sql += ' AND (b.BranchName LIKE ? OR b.City LIKE ?)'; p.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY b.BranchName';
  const rows = await all(c.env.DB, sql, ...p);
  return c.json(rows.map((r) => ({
    Id: r.Id, BranchName: r.BranchName, Address: r.Address, City: r.City, Phone: r.Phone,
    OperatingHours: r.OperatingHours, ManagerId: r.ManagerId ?? null, ManagerName: r.ManagerName ?? null,
    IsActive: bool(r.IsActive), TotalRevenue: num(r.TotalRevenue), CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
  })));
});

async function fetchBranch(db: D1Database, id: any) {
  const r = await one(db, `SELECT b.*, u.FullName ManagerName, 0 TotalRevenue FROM Restaurants b LEFT JOIN tbl_Signup u ON b.ManagerId = u.Id WHERE b.Id = ?`, id);
  return r ? { Id: r.Id, BranchName: r.BranchName, Address: r.Address, City: r.City, Phone: r.Phone, OperatingHours: r.OperatingHours, ManagerId: r.ManagerId ?? null, ManagerName: r.ManagerName ?? null, IsActive: bool(r.IsActive), TotalRevenue: num(r.TotalRevenue), CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt } : null;
}

app.post('/api/restaurants/branch', async (c) => {
  const d = await c.req.json();
  const res = await run(c.env.DB, 'INSERT INTO Restaurants (BranchName, Address, City, Phone, OperatingHours, ManagerId, IsActive) VALUES (?,?,?,?,?,?,?)',
    d.BranchName, d.Address, d.City, d.Phone, d.OperatingHours, d.ManagerId ?? null, d.IsActive ? 1 : 0);
  return c.json(await fetchBranch(c.env.DB, res.meta.last_row_id));
});

app.put('/api/restaurants/branch/:id', async (c) => {
  const d = await c.req.json();
  await run(c.env.DB, 'UPDATE Restaurants SET BranchName=?, Address=?, City=?, Phone=?, OperatingHours=?, ManagerId=?, IsActive=?, UpdatedAt=? WHERE Id=?',
    d.BranchName, d.Address, d.City, d.Phone, d.OperatingHours, d.ManagerId ?? null, d.IsActive ? 1 : 0, nowIso(), c.req.param('id'));
  return c.json(await fetchBranch(c.env.DB, c.req.param('id')));
});

app.delete('/api/restaurants/branch/:id', async (c) => {
  await run(c.env.DB, 'UPDATE Restaurants SET IsDeleted = 1, IsActive = 0 WHERE Id = ?', c.req.param('id'));
  return c.body(null, 204);
});

// ---------- USERS ----------
app.get('/api/users', async (c) => {
  const role = c.req.query('role'), branch = c.req.query('branch_id'), search = c.req.query('search');
  let sql = `SELECT s.Id FROM tbl_Signup s LEFT JOIN tbl_Role r ON s.RoleId = r.Id WHERE s.IsDeleted = 0`;
  const p: any[] = [];
  if (role) { sql += ' AND r.Name = ?'; p.push(role); }
  if (branch) { sql += ' AND s.BranchId = ?'; p.push(branch); }
  if (search) { sql += ' AND (s.FullName LIKE ? OR s.Email LIKE ?)'; p.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY s.FullName LIMIT ? OFFSET ?';
  const rows = await all(c.env.DB, sql, ...p, qInt(c, 'limit', 50), qInt(c, 'skip', 0));
  const items = (await Promise.all(rows.map((r) => loadUser(c.env.DB, r.Id)))).filter(Boolean) as Any[];
  let countSql = 'SELECT COUNT(*) n FROM tbl_Signup s LEFT JOIN tbl_Role r ON s.RoleId = r.Id WHERE s.IsDeleted = 0';
  const cp: any[] = [];
  if (role) { countSql += ' AND r.Name = ?'; cp.push(role); }
  if (branch) { countSql += ' AND s.BranchId = ?'; cp.push(branch); }
  if (search) { countSql += ' AND (s.FullName LIKE ? OR s.Email LIKE ?)'; cp.push(`%${search}%`, `%${search}%`); }
  return c.json(pageOf(c, items, num((await one(c.env.DB, countSql, ...cp))?.n)));
});

app.post('/api/users', async (c) => {
  const d = await c.req.json();
  const role = await one(c.env.DB, 'SELECT Id FROM tbl_Role WHERE Name = ?', d.Role);
  const res = await run(c.env.DB,
    `INSERT INTO tbl_Signup (FullName, Email, PhoneNumber, PasswordHash, RoleId, BranchId, CanAccessInventory, CanTriggerPipeline, CanAccessMenuManagement, CanAccessBranchAnalytics) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    d.FullName, d.Email, d.PhoneNumber ?? null, d.Password, role?.Id ?? 5, d.BranchId ?? null,
    d.CanAccessInventory ? 1 : 0, d.CanTriggerPipeline ? 1 : 0, d.CanAccessMenuManagement ? 1 : 0, d.CanAccessBranchAnalytics ? 1 : 0);
  return c.json(await loadUser(c.env.DB, Number(res.meta.last_row_id)));
});

app.put('/api/users/:id/role', async (c) => {
  const { Role } = await c.req.json();
  const role = await one(c.env.DB, 'SELECT Id FROM tbl_Role WHERE Name = ?', Role);
  await run(c.env.DB, 'UPDATE tbl_Signup SET RoleId = ?, UpdatedAt = ? WHERE Id = ?', role?.Id ?? 5, nowIso(), c.req.param('id'));
  return c.json(await loadUser(c.env.DB, Number(c.req.param('id'))));
});

app.delete('/api/users/:id', async (c) => {
  await run(c.env.DB, 'UPDATE tbl_Signup SET IsDeleted = 1, IsActive = 0 WHERE Id = ?', c.req.param('id'));
  return c.body(null, 204);
});

// ---------- INVENTORY ----------
function mapInv(r: Any) {
  return { Id: r.Id, ItemName: r.ItemName, Unit: r.Unit, CurrentStock: num(r.CurrentStock), ReorderLevel: num(r.ReorderLevel), UnitCost: num(r.UnitCost), IsActive: bool(r.IsActive), CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt, IsLowStock: num(r.CurrentStock) <= num(r.ReorderLevel) };
}

app.get('/api/inventory/items', async (c) => {
  const search = c.req.query('search'), low = c.req.query('low_stock_only') === 'true';
  let sql = 'SELECT * FROM Inventory WHERE IsDeleted = 0';
  const p: any[] = [];
  if (search) { sql += ' AND ItemName LIKE ?'; p.push(`%${search}%`); }
  if (low) sql += ' AND CurrentStock <= ReorderLevel';
  sql += ' ORDER BY ItemName LIMIT ? OFFSET ?';
  const rows = await all(c.env.DB, sql, ...p, qInt(c, 'limit', 50), qInt(c, 'skip', 0));
  const total = num((await one(c.env.DB, 'SELECT COUNT(*) n FROM Inventory WHERE IsDeleted = 0'))?.n);
  return c.json(pageOf(c, rows.map(mapInv), total));
});

async function fetchInv(db: D1Database, id: any) { const r = await one(db, 'SELECT * FROM Inventory WHERE Id = ?', id); return r ? mapInv(r) : null; }

app.post('/api/inventory/items', async (c) => {
  const d = await c.req.json();
  const res = await run(c.env.DB, 'INSERT INTO Inventory (ItemName, Unit, CurrentStock, ReorderLevel, UnitCost) VALUES (?,?,?,?,?)', d.ItemName, d.Unit, d.CurrentStock ?? 0, d.ReorderLevel ?? 0, d.UnitCost ?? 0);
  return c.json(await fetchInv(c.env.DB, res.meta.last_row_id));
});

app.put('/api/inventory/items/:id', async (c) => {
  const d = await c.req.json();
  const cur = await one(c.env.DB, 'SELECT * FROM Inventory WHERE Id = ?', c.req.param('id'));
  if (!cur) return c.json({ error: 'Not found' }, 404);
  await run(c.env.DB, 'UPDATE Inventory SET ItemName=?, Unit=?, CurrentStock=?, ReorderLevel=?, UnitCost=?, UpdatedAt=? WHERE Id=?',
    d.ItemName ?? cur.ItemName, d.Unit ?? cur.Unit, d.CurrentStock ?? cur.CurrentStock, d.ReorderLevel ?? cur.ReorderLevel, d.UnitCost ?? cur.UnitCost, nowIso(), c.req.param('id'));
  return c.json(await fetchInv(c.env.DB, c.req.param('id')));
});

app.delete('/api/inventory/items/:id', async (c) => { await run(c.env.DB, 'UPDATE Inventory SET IsDeleted = 1, IsActive = 0 WHERE Id = ?', c.req.param('id')); return c.body(null, 204); });

app.post('/api/inventory/adjust', async (c) => {
  const { InventoryItemId, Quantity, Reason } = await c.req.json();
  const cur = await one(c.env.DB, 'SELECT * FROM Inventory WHERE Id = ?', InventoryItemId);
  if (!cur) return c.json({ error: 'Not found' }, 404);
  const after = num(cur.CurrentStock) + num(Quantity);
  await run(c.env.DB, 'UPDATE Inventory SET CurrentStock = ?, UpdatedAt = ? WHERE Id = ?', after, nowIso(), InventoryItemId);
  const type = num(Quantity) >= 0 ? 'MANUAL_ADDITION' : 'MANUAL_DEDUCTION';
  await run(c.env.DB, 'INSERT INTO tbl_StockMovementLog (InventoryItemId, MovementType, QuantityChange, StockAfter, Reason) VALUES (?,?,?,?,?)', InventoryItemId, type, Quantity, after, Reason ?? null);
  const item = await fetchInv(c.env.DB, InventoryItemId);
  const mv = await one(c.env.DB, 'SELECT * FROM tbl_StockMovementLog WHERE InventoryItemId = ? ORDER BY Id DESC LIMIT 1', InventoryItemId);
  const low = after <= num(cur.ReorderLevel) ? { InventoryItemId, ItemName: cur.ItemName, Unit: cur.Unit, CurrentStock: after, ReorderLevel: num(cur.ReorderLevel), Shortfall: num(cur.ReorderLevel) - after } : null;
  return c.json({
    Item: item,
    Movement: { Id: mv!.Id, InventoryItemId, ItemName: cur.ItemName, Unit: cur.Unit, MovementType: mv!.MovementType, QuantityChange: num(mv!.QuantityChange), StockAfter: num(mv!.StockAfter), OrderId: null, OrderNumber: null, Reason: mv!.Reason ?? null, ChangedBy: null, ChangedByName: null, ChangedAt: mv!.CreatedAt },
    LowStockAlert: low,
  });
});

app.get('/api/inventory/recipes/:menuItemId', async (c) => {
  const id = c.req.param('menuItemId');
  const mi = await one(c.env.DB, 'SELECT Name FROM Menu_Items WHERE Id = ?', id);
  const lines = await all(c.env.DB, `SELECT r.InventoryItemId, i.ItemName, i.Unit, r.QuantityRequired FROM tbl_Recipe r LEFT JOIN Inventory i ON r.InventoryItemId = i.Id WHERE r.MenuItemId = ?`, id);
  return c.json({ MenuItemId: Number(id), MenuItemName: mi?.Name ?? '', Lines: lines.map((l) => ({ InventoryItemId: l.InventoryItemId, ItemName: l.ItemName ?? '', Unit: l.Unit ?? '', QuantityRequired: num(l.QuantityRequired) })) });
});

app.put('/api/inventory/recipes/:menuItemId', async (c) => {
  const id = c.req.param('menuItemId');
  const { Lines } = await c.req.json();
  await run(c.env.DB, 'DELETE FROM tbl_Recipe WHERE MenuItemId = ?', id);
  for (const l of Lines ?? []) await run(c.env.DB, 'INSERT INTO tbl_Recipe (MenuItemId, InventoryItemId, QuantityRequired) VALUES (?,?,?)', id, l.InventoryItemId, l.QuantityRequired);
  const mi = await one(c.env.DB, 'SELECT Name FROM Menu_Items WHERE Id = ?', id);
  const lines = await all(c.env.DB, `SELECT r.InventoryItemId, i.ItemName, i.Unit, r.QuantityRequired FROM tbl_Recipe r LEFT JOIN Inventory i ON r.InventoryItemId = i.Id WHERE r.MenuItemId = ?`, id);
  return c.json({ MenuItemId: Number(id), MenuItemName: mi?.Name ?? '', Lines: lines.map((l) => ({ InventoryItemId: l.InventoryItemId, ItemName: l.ItemName ?? '', Unit: l.Unit ?? '', QuantityRequired: num(l.QuantityRequired) })) });
});

app.get('/api/dashboard/inventory/stock-status', async (c) => {
  const rows = await all(c.env.DB, 'SELECT * FROM Inventory WHERE IsDeleted = 0');
  const map = (r: Any) => ({ InventoryItemId: r.Id, ItemName: r.ItemName, Unit: r.Unit, CurrentStock: num(r.CurrentStock), ReorderLevel: num(r.ReorderLevel), UnitCost: num(r.UnitCost), StockValue: num(r.CurrentStock) * num(r.UnitCost) });
  const low = rows.filter((r) => num(r.CurrentStock) > 0 && num(r.CurrentStock) <= num(r.ReorderLevel)).map(map);
  const out = rows.filter((r) => num(r.CurrentStock) <= 0).map(map);
  return c.json({ TotalItems: rows.length, LowStockCount: low.length, OutOfStockCount: out.length, TotalValuation: rows.reduce((s, r) => s + num(r.CurrentStock) * num(r.UnitCost), 0), LowStock: low, OutOfStock: out });
});

app.get('/api/dashboard/inventory/movement-logs', async (c) => {
  const type = c.req.query('movement_type');
  let sql = `SELECT m.*, i.ItemName, i.Unit, o.OrderNumber FROM tbl_StockMovementLog m LEFT JOIN Inventory i ON m.InventoryItemId = i.Id LEFT JOIN Orders o ON m.OrderId = o.Id WHERE 1=1`;
  const p: any[] = [];
  if (type) { sql += ' AND m.MovementType = ?'; p.push(type); }
  sql += ' ORDER BY m.CreatedAt DESC LIMIT ? OFFSET ?';
  const rows = await all(c.env.DB, sql, ...p, qInt(c, 'limit', 50), qInt(c, 'skip', 0));
  const total = num((await one(c.env.DB, 'SELECT COUNT(*) n FROM tbl_StockMovementLog'))?.n);
  return c.json(pageOf(c, rows.map((r) => ({ Id: r.Id, InventoryItemId: r.InventoryItemId, ItemName: r.ItemName ?? '', Unit: r.Unit ?? '', MovementType: r.MovementType, QuantityChange: num(r.QuantityChange), StockAfter: num(r.StockAfter), OrderId: r.OrderId ?? null, OrderNumber: r.OrderNumber ?? null, Reason: r.Reason ?? null, ChangedBy: r.CreatedBy ?? null, ChangedByName: null, ChangedAt: r.CreatedAt })), total));
});

// ---------- TABLES ----------
function mapTable(r: Any, cur: Any | null) {
  return { Id: r.Id, TableNumber: r.TableNumber, Capacity: num(r.Capacity), Status: r.Status, CurrentOrder: cur ? { OrderId: cur.Id, OrderNumber: cur.OrderNumber, GuestCount: num(cur.GuestCount), NetAmount: num(cur.NetAmount), OrderDate: cur.OrderDate } : null };
}

app.get('/api/tables', async (c) => {
  const rows = await all(c.env.DB, 'SELECT * FROM tbl_DiningTable WHERE IsDeleted = 0 ORDER BY TableNumber');
  const items = [];
  for (const r of rows) {
    const cur = await one(c.env.DB, `SELECT * FROM Orders WHERE TableId = ? AND Status = 'Pending' AND IsDeleted = 0 ORDER BY Id DESC LIMIT 1`, r.Id);
    items.push(mapTable(r, cur));
  }
  return c.json({ Total: items.length, Available: items.filter((t) => t.Status === 'AVAILABLE').length, Occupied: items.filter((t) => t.Status === 'OCCUPIED').length, Reserved: items.filter((t) => t.Status === 'RESERVED').length, Items: items });
});

app.post('/api/tables/assign', async (c) => {
  const { TableId, OrderId } = await c.req.json();
  await run(c.env.DB, 'UPDATE tbl_DiningTable SET Status = ?, UpdatedAt = ? WHERE Id = ?', 'OCCUPIED', nowIso(), TableId);
  if (OrderId) await run(c.env.DB, 'UPDATE Orders SET TableId = ?, UpdatedAt = ? WHERE Id = ?', TableId, nowIso(), OrderId);
  const r = await one(c.env.DB, 'SELECT * FROM tbl_DiningTable WHERE Id = ?', TableId);
  return c.json(mapTable(r!, null));
});

app.put('/api/tables/:id/status', async (c) => {
  const { Status } = await c.req.json();
  await run(c.env.DB, 'UPDATE tbl_DiningTable SET Status = ?, UpdatedAt = ? WHERE Id = ?', Status, nowIso(), c.req.param('id'));
  const r = await one(c.env.DB, 'SELECT * FROM tbl_DiningTable WHERE Id = ?', c.req.param('id'));
  return c.json(mapTable(r!, null));
});

// ---------- ORDERS ----------
function mapOrder(o: Any, items: Any[], invoiceNumber: string | null, cust: Any | null) {
  return {
    Id: o.Id, OrderNumber: o.OrderNumber, OrderDate: o.OrderDate, OrderType: o.OrderType, PaymentMethod: o.PaymentMethod, Status: o.Status,
    CustomerId: o.CustomerId ?? null, Customer: cust ? { CustomerName: cust.Name, Phone: cust.Phone } : null,
    GuestCount: num(o.GuestCount), TableId: o.TableId ?? null, TableNumber: o.TableNumber ?? null,
    TotalAmount: num(o.TotalAmount), Discount: num(o.Discount), NetAmount: num(o.NetAmount), InvoiceNumber: invoiceNumber,
    items, AverageSpendPerGuest: num(o.GuestCount) > 0 ? num(o.NetAmount) / num(o.GuestCount) : 0,
  };
}

async function loadOrder(db: D1Database, id: any) {
  const o = await one(db, `SELECT o.*, (SELECT TableNumber FROM tbl_DiningTable t WHERE t.Id = o.TableId) TableNumber FROM Orders o WHERE o.Id = ?`, id);
  if (!o) return null;
  const lines = await all(db, `SELECT oi.*, mi.Name MenuItemName FROM Order_Items oi LEFT JOIN Menu_Items mi ON oi.MenuItemId = mi.Id WHERE oi.OrderId = ? ORDER BY oi.Id`, id);
  const inv = await one(db, 'SELECT InvoiceNumber FROM tbl_Payment WHERE OrderId = ?', id);
  const cust = o.CustomerId ? await one(db, 'SELECT Name, Phone FROM Customers WHERE Id = ?', o.CustomerId) : null;
  return mapOrder(o, lines.map((l) => ({ Id: l.Id, MenuItemId: l.MenuItemId, MenuItemName: l.MenuItemName ?? '', Quantity: num(l.Quantity), UnitPrice: num(l.UnitPrice), TotalPrice: num(l.TotalPrice) })), inv?.InvoiceNumber ?? null, cust);
}

app.get('/api/orders', async (c) => {
  const status = c.req.query('status'), type = c.req.query('order_type');
  let sql = `SELECT o.*, (SELECT TableNumber FROM tbl_DiningTable t WHERE t.Id = o.TableId) TableNumber FROM Orders o WHERE o.IsDeleted = 0`;
  const p: any[] = [];
  if (status) { sql += ' AND o.Status = ?'; p.push(status); }
  if (type) { sql += ' AND o.OrderType = ?'; p.push(type); }
  sql += ' ORDER BY o.OrderDate DESC LIMIT ? OFFSET ?';
  const rows = await all(c.env.DB, sql, ...p, qInt(c, 'limit', 50), qInt(c, 'skip', 0));
  const items = [];
  for (const o of rows) {
    const lines = await all(c.env.DB, `SELECT oi.*, mi.Name MenuItemName FROM Order_Items oi LEFT JOIN Menu_Items mi ON oi.MenuItemId = mi.Id WHERE oi.OrderId = ?`, o.Id);
    const inv = await one(c.env.DB, 'SELECT InvoiceNumber FROM tbl_Payment WHERE OrderId = ?', o.Id);
    const cust = o.CustomerId ? await one(c.env.DB, 'SELECT Name, Phone FROM Customers WHERE Id = ?', o.CustomerId) : null;
    items.push(mapOrder(o, lines.map((l) => ({ Id: l.Id, MenuItemId: l.MenuItemId, MenuItemName: l.MenuItemName ?? '', Quantity: num(l.Quantity), UnitPrice: num(l.UnitPrice), TotalPrice: num(l.TotalPrice) })), inv?.InvoiceNumber ?? null, cust));
  }
  let csql = 'SELECT COUNT(*) n FROM Orders o WHERE o.IsDeleted = 0';
  const cp: any[] = [];
  if (status) { csql += ' AND o.Status = ?'; cp.push(status); }
  if (type) { csql += ' AND o.OrderType = ?'; cp.push(type); }
  return c.json(pageOf(c, items, num((await one(c.env.DB, csql, ...cp))?.n)));
});

app.get('/api/orders/:id', async (c) => {
  const o = await loadOrder(c.env.DB, c.req.param('id'));
  return o ? c.json(o) : c.json({ error: 'Not found' }, 404);
});

app.post('/api/orders', async (c) => {
  const d = await c.req.json();
  const payload = c.get('jwtPayload');
  const orderNumber = `ORD-${Date.now()}`;
  let total = 0;
  const lines: Any[] = [];
  for (const it of d.items ?? []) {
    const mi = await one(c.env.DB, 'SELECT * FROM Menu_Items WHERE Id = ?', it.MenuItemId);
    if (!mi) continue;
    const tp = num(mi.Price) * num(it.Quantity);
    total += tp;
    lines.push({ mi, qty: num(it.Quantity), unit: num(mi.Price), total: tp });
  }
  const discount = num(d.Discount);
  const net = total - discount;
  const res = await run(c.env.DB, `INSERT INTO Orders (CustomerId, TableId, BranchId, GuestCount, OrderNumber, OrderDate, OrderType, PaymentMethod, Status, TotalAmount, Discount, NetAmount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    d.CustomerId ?? null, null, d.BranchId ?? payload.branchId ?? null, d.GuestCount ?? 1, orderNumber, nowIso(), d.OrderType, d.PaymentMethod, 'Pending', total, discount, net);
  const orderId = Number(res.meta.last_row_id);
  for (const l of lines) {
    await run(c.env.DB, `INSERT INTO Order_Items (OrderId, MenuItemId, Quantity, UnitPrice, TotalPrice, UnitCost) VALUES (?,?,?,?,?,?)`, orderId, l.mi.Id, l.qty, l.unit, l.total, num(l.mi.Cost));
    const recipe = await all(c.env.DB, 'SELECT * FROM tbl_Recipe WHERE MenuItemId = ?', l.mi.Id);
    for (const r of recipe) {
      const inv = await one(c.env.DB, 'SELECT * FROM Inventory WHERE Id = ?', r.InventoryItemId);
      if (!inv) continue;
      const after = num(inv.CurrentStock) - num(r.QuantityRequired) * l.qty;
      await run(c.env.DB, 'UPDATE Inventory SET CurrentStock = ? WHERE Id = ?', after, inv.Id);
      await run(c.env.DB, 'INSERT INTO tbl_StockMovementLog (InventoryItemId, MovementType, QuantityChange, StockAfter, OrderId) VALUES (?,?,?,?,?)', inv.Id, 'ORDER_CONSUMPTION', -num(r.QuantityRequired) * l.qty, after, orderId);
    }
  }
  return c.json(await loadOrder(c.env.DB, orderId));
});

app.put('/api/orders/:id/status', async (c) => {
  const { Status } = await c.req.json();
  await run(c.env.DB, 'UPDATE Orders SET Status = ?, UpdatedAt = ? WHERE Id = ?', Status, nowIso(), c.req.param('id'));
  if (Status === 'Cancelled') {
    const tbl = await one(c.env.DB, 'SELECT TableId FROM Orders WHERE Id = ?', c.req.param('id'));
    if (tbl?.TableId) await run(c.env.DB, "UPDATE tbl_DiningTable SET Status = 'AVAILABLE' WHERE Id = ?", tbl.TableId);
  }
  return c.json(await loadOrder(c.env.DB, c.req.param('id')));
});

// ---------- FAVORITES ----------
app.get('/api/favorites', async (c) => {
  const { customerId } = c.get('jwtPayload');
  if (!customerId) return c.json({ MenuItemIds: [] });
  const rows = await all(c.env.DB, 'SELECT MenuItemId FROM Customer_Favorites WHERE CustomerId = ? AND IsDeleted = 0 AND IsActive = 1', customerId);
  return c.json({ MenuItemIds: rows.map((r) => r.MenuItemId) });
});

app.post('/api/favorites/:menuItemId/toggle', async (c) => {
  const { customerId } = c.get('jwtPayload');
  const menuItemId = Number(c.req.param('menuItemId'));
  if (!customerId) return c.json({ MenuItemId: menuItemId, IsFavorite: false });
  const ex = await one(c.env.DB, 'SELECT * FROM Customer_Favorites WHERE CustomerId = ? AND MenuItemId = ?', customerId, menuItemId);
  if (ex) {
    await run(c.env.DB, 'UPDATE Customer_Favorites SET IsActive = ?, IsDeleted = ? WHERE Id = ?', ex.IsActive ? 0 : 1, ex.IsActive ? 1 : 0, ex.Id);
    return c.json({ MenuItemId: menuItemId, IsFavorite: !ex.IsActive });
  }
  await run(c.env.DB, 'INSERT INTO Customer_Favorites (CustomerId, MenuItemId) VALUES (?,?)', customerId, menuItemId);
  return c.json({ MenuItemId: menuItemId, IsFavorite: true });
});

// ---------- PROMOTIONS ----------
app.get('/api/promotions/validate/:code', async (c) => {
  const code = c.req.param('code');
  const p = await one(c.env.DB, `SELECT * FROM Promotions WHERE Code = ? AND IsDeleted = 0 AND IsActive = 1 AND date('now') BETWEEN StartDate AND EndDate`, code);
  return c.json(p ? { Valid: true, Code: p.Code, PromotionName: p.Name, DiscountPercent: num(p.DiscountPercent), Message: 'Promotion applied' } : { Valid: false, Code: code, PromotionName: null, DiscountPercent: null, Message: 'Invalid or expired code' });
});

// ---------- PAYMENTS ----------
function tierFor(points: number) {
  if (points >= 400) return { Name: 'Platinum', Percent: 10 };
  if (points >= 200) return { Name: 'Gold', Percent: 5 };
  return { Name: 'Silver', Percent: 0 };
}

async function buildBill(db: D1Database, orderId: any, redeem: number, tendered?: number) {
  const o = await one(db, 'SELECT * FROM Orders WHERE Id = ?', orderId);
  if (!o) return null;
  const cust = o.CustomerId ? await one(db, 'SELECT * FROM Customers WHERE Id = ?', o.CustomerId) : null;
  const before = cust ? num(cust.LoyaltyPoints) : null;
  const subTotal = num(o.TotalAmount);
  const orderDiscount = num(o.Discount);
  const tier = cust ? tierFor(before!) : { Name: null as any, Percent: 0 };
  const tierDiscount = ((subTotal - orderDiscount) * (tier.Percent || 0)) / 100;
  const amountDue = subTotal - orderDiscount - tierDiscount;
  const redeemPoints = Math.min(num(redeem), before ?? 0);
  const redemptionAmount = redeemPoints;
  const amountPayable = Math.max(0, amountDue - redemptionAmount);
  const tend = tendered ?? amountPayable;
  const changeDue = Math.max(0, tend - amountPayable);
  const pointsEarned = Math.floor(amountPayable / 100);
  return {
    o, cust,
    Bill: {
      SubTotal: subTotal, OrderDiscount: orderDiscount, TierName: tier.Name, TierDiscountPercentage: tier.Percent,
      TierDiscount: tierDiscount, AmountDue: amountDue, PointsRedeemed: redeemPoints, PointsRedemptionAmount: redemptionAmount,
      AmountPayable: amountPayable, AmountTendered: tend, ChangeDue: changeDue, PointsEarned: pointsEarned,
      PointsBalanceBefore: before, PointsBalanceAfter: before === null ? null : before - redeemPoints + pointsEarned,
    },
  };
}

app.post('/api/payments/preview', async (c) => {
  const d = await c.req.json();
  const b = await buildBill(c.env.DB, d.OrderId, d.RedeemPoints, d.AmountTendered);
  if (!b) return c.json({ error: 'Order not found' }, 404);
  return c.json({ OrderId: b.o.Id, OrderNumber: b.o.OrderNumber, PaymentMethod: d.PaymentMethod, Bill: b.Bill });
});

app.post('/api/payments/settle', async (c) => {
  const d = await c.req.json();
  const b = await buildBill(c.env.DB, d.OrderId, d.RedeemPoints, d.AmountTendered);
  if (!b) return c.json({ error: 'Order not found' }, 404);
  const invoiceNumber = `INV-${Date.now()}`;
  await run(c.env.DB, `INSERT INTO tbl_Payment (InvoiceNumber, OrderId, CustomerId, PaymentMethod, SubTotal, OrderDiscount, TierName, TierDiscountPercentage, TierDiscount, AmountDue, PointsRedeemed, PointsRedemptionAmount, AmountPayable, AmountTendered, ChangeDue, PointsEarned) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    invoiceNumber, b.o.Id, b.o.CustomerId ?? null, d.PaymentMethod, b.Bill.SubTotal, b.Bill.OrderDiscount, b.Bill.TierName, b.Bill.TierDiscountPercentage, b.Bill.TierDiscount, b.Bill.AmountDue, b.Bill.PointsRedeemed, b.Bill.PointsRedemptionAmount, b.Bill.AmountPayable, b.Bill.AmountTendered, b.Bill.ChangeDue, b.Bill.PointsEarned);
  await run(c.env.DB, "UPDATE Orders SET Status = 'Completed', UpdatedAt = ? WHERE Id = ?", nowIso(), b.o.Id);
  if (b.cust) await run(c.env.DB, 'UPDATE Customers SET LoyaltyPoints = ? WHERE Id = ?', (b.Bill.PointsBalanceAfter ?? 0), b.cust.Id);
  if (b.o.TableId) await run(c.env.DB, "UPDATE tbl_DiningTable SET Status = 'AVAILABLE' WHERE Id = ?", b.o.TableId);
  const lines = await all(c.env.DB, `SELECT oi.*, mi.Name MenuItemName FROM Order_Items oi LEFT JOIN Menu_Items mi ON oi.MenuItemId = mi.Id WHERE oi.OrderId = ?`, b.o.Id);
  const low = await all(c.env.DB, 'SELECT * FROM Inventory WHERE IsDeleted = 0 AND CurrentStock <= ReorderLevel');
  return c.json({
    InvoiceNumber: invoiceNumber, RestaurantName: 'DineIQ Restaurant', PaidAt: nowIso(), OrderNumber: b.o.OrderNumber,
    OrderType: b.o.OrderType, TableNumber: null, GuestCount: num(b.o.GuestCount),
    CustomerName: b.cust?.Name ?? null, CustomerPhone: b.cust?.Phone ?? null, CashierName: null,
    PaymentMethod: d.PaymentMethod,
    Lines: lines.map((l) => ({ MenuItemName: l.MenuItemName ?? '', Quantity: num(l.Quantity), UnitPrice: num(l.UnitPrice), TotalPrice: num(l.TotalPrice) })),
    Bill: b.Bill,
    LowStockAlerts: low.map((r) => ({ InventoryItemId: r.Id, ItemName: r.ItemName, Unit: r.Unit, CurrentStock: num(r.CurrentStock), ReorderLevel: num(r.ReorderLevel), Shortfall: num(r.ReorderLevel) - num(r.CurrentStock) })),
  });
});

// ---------- DASHBOARD (ADMIN) ----------
app.get('/api/dashboard/admin/summary', async (c) => {
  const d = today();
  const t = await one(c.env.DB, `SELECT COUNT(*) orders, COALESCE(SUM(CASE WHEN Status='Completed' THEN NetAmount ELSE 0 END),0) sales, COALESCE(SUM(CASE WHEN Status='Completed' THEN 1 ELSE 0 END),0) completed, COALESCE(SUM(GuestCount),0) guests FROM Orders WHERE date(OrderDate) = ? AND IsDeleted = 0`, d);
  const pending = num((await one(c.env.DB, "SELECT COUNT(*) n FROM Orders WHERE Status='Pending' AND IsDeleted=0"))?.n);
  const tabs = await all(c.env.DB, 'SELECT Status, COUNT(*) n FROM tbl_DiningTable WHERE IsDeleted=0 GROUP BY Status');
  const stock = await one(c.env.DB, 'SELECT COALESCE(SUM(CASE WHEN CurrentStock<=ReorderLevel AND CurrentStock>0 THEN 1 ELSE 0 END),0) low, COALESCE(SUM(CASE WHEN CurrentStock<=0 THEN 1 ELSE 0 END),0) out FROM Inventory WHERE IsDeleted=0');
  const orders = num(t?.orders);
  return c.json({
    BusinessDate: d, SalesToday: num(t?.sales), CompletedOrdersToday: num(t?.completed), OrdersToday: orders, GuestsToday: num(t?.guests),
    AverageOrderValueToday: orders ? num(t?.sales) / orders : 0, PendingOrders: pending,
    ActiveTables: num(tabs.find((x) => x.Status === 'OCCUPIED')?.n), ReservedTables: num(tabs.find((x) => x.Status === 'RESERVED')?.n),
    TotalTables: num((await one(c.env.DB, 'SELECT COUNT(*) n FROM tbl_DiningTable WHERE IsDeleted=0'))?.n),
    LowStockItems: num(stock?.low), OutOfStockItems: num(stock?.out),
  });
});

app.get('/api/dashboard/admin/revenue-chart', async (c) => {
  const daily = await all(c.env.DB, `SELECT date(OrderDate) Period, COALESCE(SUM(NetAmount),0) Revenue, COUNT(*) Orders FROM Orders WHERE IsDeleted=0 AND Status='Completed' GROUP BY date(OrderDate) ORDER BY Period DESC LIMIT 30`);
  const monthly = await all(c.env.DB, `SELECT strftime('%Y-%m', OrderDate) Period, COALESCE(SUM(NetAmount),0) Revenue, COUNT(*) Orders FROM Orders WHERE IsDeleted=0 AND Status='Completed' GROUP BY Period ORDER BY Period DESC LIMIT 12`);
  return c.json({ Daily: daily.map((r) => ({ Period: r.Period, Revenue: num(r.Revenue), Orders: num(r.Orders) })), Monthly: monthly.map((r) => ({ Period: r.Period, Revenue: num(r.Revenue), Orders: num(r.Orders) })) });
});

app.get('/api/dashboard/admin/top-performing', async (c) => {
  const days = qInt(c, 'days', 30);
  const rows = await all(c.env.DB, `SELECT mi.Id, mi.Name, mc.Name CategoryName, SUM(oi.Quantity) qty, SUM(oi.TotalPrice) rev FROM Order_Items oi JOIN Orders o ON oi.OrderId=o.Id LEFT JOIN Menu_Items mi ON oi.MenuItemId=mi.Id LEFT JOIN Menu_Categories mc ON mi.CategoryId=mc.Id WHERE o.IsDeleted=0 AND o.OrderDate >= date('now', ?) GROUP BY mi.Id ORDER BY qty DESC LIMIT 10`, `-${days} days`);
  const totalRev = rows.reduce((s, r) => s + num(r.rev), 0);
  return c.json({
    PeriodDays: days,
    TopItems: rows.map((r, i) => ({ Rank: i + 1, MenuItemId: r.Id, MenuItemName: r.Name ?? '', CategoryName: r.CategoryName ?? '', QuantitySold: num(r.qty), Revenue: num(r.rev), RevenueSharePercentage: totalRev ? (num(r.rev) / totalRev) * 100 : 0 })),
    TopSpendingSegments: [],
  });
});

// ---------- DASHBOARD (BRANCH / INVENTORY / CUSTOMER) ----------
app.get('/api/dashboard/restaurant-manager/overview', async (c) => {
  const r = await one(c.env.DB, `SELECT COUNT(*) orders, COALESCE(SUM(NetAmount),0) rev, COALESCE(SUM(GuestCount),0) guests FROM Orders WHERE IsDeleted=0`);
  return c.json({ TotalOrders: num(r?.orders), GrossSales: num(r?.rev), TotalRevenue: num(r?.rev), NetProfit: 0, ProfitMarginPercentage: 0, AverageOrderValue: num(r?.orders) ? num(r?.rev) / num(r?.orders) : 0, TotalGuests: num(r?.guests), AverageSpendPerGuest: num(r?.guests) ? num(r?.rev) / num(r?.guests) : 0 });
});

app.get('/api/dashboard/restaurant-manager/channel-mix', async (c) => {
  const rows = await all(c.env.DB, `SELECT OrderType Channel, COUNT(*) OrderCount, COALESCE(SUM(NetAmount),0) Revenue FROM Orders WHERE IsDeleted=0 GROUP BY OrderType`);
  const total = rows.reduce((s, r) => s + num(r.Revenue), 0);
  return c.json({ BranchId: c.req.query('branch_id') ? Number(c.req.query('branch_id')) : null, Channels: rows.map((r) => ({ Channel: r.Channel, OrderCount: num(r.OrderCount), Revenue: num(r.Revenue), SharePercentage: total ? (num(r.Revenue) / total) * 100 : 0 })) });
});

app.get('/api/dashboard/restaurant-manager/branch-snapshot', async (c) => {
  const s = await one(c.env.DB, `SELECT COUNT(*) orders, COALESCE(SUM(CASE WHEN Status='Completed' THEN NetAmount ELSE 0 END),0) sales, COALESCE(SUM(CASE WHEN Status='Completed' THEN 1 ELSE 0 END),0) completed, COALESCE(SUM(CASE WHEN Status='Pending' THEN 1 ELSE 0 END),0) pending FROM Orders WHERE date(OrderDate)=date('now') AND IsDeleted=0`);
  const recent = await all(c.env.DB, `SELECT * FROM Orders WHERE IsDeleted=0 ORDER BY OrderDate DESC LIMIT 10`);
  return c.json({
    BranchId: c.req.query('branch_id') ? Number(c.req.query('branch_id')) : null, BusinessDate: today(),
    SalesToday: num(s?.sales), OrdersToday: num(s?.orders), CompletedOrdersToday: num(s?.completed), PendingOrders: num(s?.pending),
    RecentOrders: recent.map((o) => mapOrder(o, [], null, null)),
    ActiveTables: 0, ReservedTables: 0, TotalTables: num((await one(c.env.DB, 'SELECT COUNT(*) n FROM tbl_DiningTable WHERE IsDeleted=0'))?.n),
    LowStockItems: num((await one(c.env.DB, 'SELECT COUNT(*) n FROM Inventory WHERE IsDeleted=0 AND CurrentStock<=ReorderLevel AND CurrentStock>0'))?.n),
    OutOfStockItems: num((await one(c.env.DB, 'SELECT COUNT(*) n FROM Inventory WHERE IsDeleted=0 AND CurrentStock<=0'))?.n),
    WastageCost30Days: 0,
  });
});

app.get('/api/dashboard/restaurant-manager/menu-quadrants', async (c) => {
  const rows = await all(c.env.DB, `SELECT mi.Id, mi.Name, mi.Price, mi.Cost, mc.Name CategoryName, COALESCE(SUM(oi.Quantity),0) qty, COALESCE(SUM(oi.TotalPrice),0) rev FROM Menu_Items mi LEFT JOIN Menu_Categories mc ON mi.CategoryId=mc.Id LEFT JOIN Order_Items oi ON oi.MenuItemId=mi.Id WHERE mi.IsDeleted=0 GROUP BY mi.Id`);
  const items = rows.map((r) => {
    const margin = num(r.rev) - num(r.qty) * num(r.Cost);
    const mp = num(r.rev) ? (margin / num(r.rev)) * 100 : 0;
    const q = num(r.qty) >= 20 ? (mp >= 30 ? 'Profit Driver' : 'Volume Driver') : (mp >= 30 ? 'Hidden Opportunity' : 'Low Performer');
    return { MenuItemId: r.Id, MenuItemName: r.Name, CategoryName: r.CategoryName ?? '', QuantitySold: num(r.qty), Revenue: num(r.rev), Margin: margin, MarginPercentage: mp, Quadrant: q };
  });
  const med = (arr: number[]) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  return c.json({ BranchId: null, MedianQuantity: med(items.map((i) => i.QuantitySold)), MedianMarginPercentage: med(items.map((i) => i.MarginPercentage)), Items: items });
});

app.get('/api/dashboard/restaurant-manager/recommendations', async (c) => {
  const low = await one(c.env.DB, 'SELECT COUNT(*) n FROM Inventory WHERE IsDeleted=0 AND CurrentStock<=ReorderLevel');
  const recs: Any[] = [];
  if (num(low?.n) > 0) recs.push({ Title: 'Low stock items need attention', Priority: 'HIGH', Evidence: `${num(low?.n)} item(s) at or below reorder level.`, SuggestedAction: 'Create purchase orders for low-stock items.' });
  return c.json(recs);
});

app.get('/api/dashboard/inventory-manager/wastage', async (c) => {
  const byItem = await all(c.env.DB, `SELECT w.InventoryItemId, i.ItemName, i.Unit, SUM(w.Quantity) tw, COUNT(*) ic FROM Wastage w LEFT JOIN Inventory i ON w.InventoryItemId=i.Id WHERE w.IsDeleted=0 GROUP BY w.InventoryItemId`);
  const byReason = await all(c.env.DB, `SELECT COALESCE(Reason,'Unspecified') Reason, SUM(Quantity) tw, COUNT(*) ic FROM Wastage WHERE IsDeleted=0 GROUP BY Reason`);
  const cost = (itemId: number, qty: number) => 0;
  return c.json({
    BranchId: null, TotalWastageCost: 0,
    ByItem: byItem.map((r) => ({ InventoryItemId: r.InventoryItemId, ItemName: r.ItemName ?? '', Unit: r.Unit ?? '', TotalWasted: num(r.tw), WastageCost: cost(r.InventoryItemId, num(r.tw)), IncidentCount: num(r.ic) })),
    ByReason: byReason.map((r) => ({ Reason: r.Reason, TotalWasted: num(r.tw), WastageCost: 0, IncidentCount: num(r.ic) })),
  });
});

app.get('/api/dashboard/inventory-manager/demand-forecast', async (c) => {
  const pattern = await all(c.env.DB, `SELECT CAST(strftime('%H', OrderDate) AS INTEGER) Hour, COUNT(*) n FROM Orders WHERE IsDeleted=0 GROUP BY Hour ORDER BY Hour`);
  const hourly = pattern.map((p) => ({ Hour: num(p.Hour), AverageQuantityConsumed: num(p.n) }));
  const peak = hourly.length ? hourly.reduce((a, b) => (b.AverageQuantityConsumed > a.AverageQuantityConsumed ? b : a)).Hour : null;
  return c.json({ BranchId: null, HourlyPattern: hourly, PeakHour: peak, Recommendations: [], IsMLPowered: false, ModelAccuracy: null, UsedSystemWideFallback: true });
});

app.get('/api/dashboard/admin/branch-comparison', async (c) => {
  const rows = await all(c.env.DB, `SELECT b.Id, b.BranchName, b.City, b.IsActive, COUNT(o.Id) oc, COALESCE(SUM(o.NetAmount),0) rev FROM Restaurants b LEFT JOIN Orders o ON o.BranchId=b.Id AND o.IsDeleted=0 WHERE b.IsDeleted=0 GROUP BY b.Id`);
  return c.json({ Period: { StartDate: c.req.query('start_date') ?? null, EndDate: c.req.query('end_date') ?? null }, Branches: rows.map((r) => ({ BranchId: r.Id, BranchName: r.BranchName, City: r.City, IsActive: bool(r.IsActive), OrderCount: num(r.oc), Revenue: num(r.rev), Profit: 0, ProfitMarginPercentage: 0, WastageCost: 0, AverageRating: null, CustomerCount: 0 })) });
});

app.get('/api/dashboard/admin/anomalies', async (c) => c.json({ SalesAnomalies: [] }));

// ---------- CUSTOMER PORTAL ----------
app.get('/api/dashboard/customer/me', async (c) => {
  const { customerId } = c.get('jwtPayload');
  const cust = customerId ? await one(c.env.DB, 'SELECT * FROM Customers WHERE Id = ?', customerId) : null;
  if (!cust) return c.json({ error: 'Not found' }, 404);
  const agg = await one(c.env.DB, 'SELECT COUNT(*) c, COALESCE(SUM(NetAmount),0) s, MAX(OrderDate) last FROM Orders WHERE CustomerId=? AND IsDeleted=0', cust.Id);
  const pts = num(cust.LoyaltyPoints);
  const tier = tierFor(pts);
  const next = pts >= 400 ? null : pts >= 200 ? 'Platinum' : 'Gold';
  const needed = next === 'Platinum' ? 400 - pts : next === 'Gold' ? 200 - pts : null;
  return c.json({
    CustomerId: cust.Id, Name: cust.Name, Phone: cust.Phone, Email: cust.Email ?? null, MemberSince: cust.CreatedAt, LoyaltyPoints: pts, PointsValue: pts,
    TierStatus: { Tier: tier.Name, DiscountPercentage: tier.Percent, NextTier: next, PointsToNextTier: needed },
    Tiers: [{ Name: 'Silver', MinPoints: 0, DiscountPercentage: 0 }, { Name: 'Gold', MinPoints: 200, DiscountPercentage: 5 }, { Name: 'Platinum', MinPoints: 400, DiscountPercentage: 10 }],
    TotalOrders: num(agg?.c), TotalSpent: num(agg?.s), LastOrderDate: agg?.last ?? null,
  });
});

app.get('/api/dashboard/customer/my-orders', async (c) => {
  const { customerId } = c.get('jwtPayload');
  if (!customerId) return c.json(pageOf(c, [], 0));
  const openOnly = c.req.query('open_only') === 'true';
  let sql = 'SELECT * FROM Orders WHERE CustomerId=? AND IsDeleted=0';
  if (openOnly) sql += " AND Status='Pending'";
  sql += ' ORDER BY OrderDate DESC LIMIT ? OFFSET ?';
  const rows = await all(c.env.DB, sql, customerId, qInt(c, 'limit', 20), qInt(c, 'skip', 0));
  const items = [];
  for (const o of rows) {
    const full = await loadOrder(c.env.DB, o.Id);
    if (full) items.push({ ...full, TrackingStatus: o.Status, IsOpen: o.Status === 'Pending' });
  }
  const total = num((await one(c.env.DB, 'SELECT COUNT(*) n FROM Orders WHERE CustomerId=? AND IsDeleted=0', customerId))?.n);
  return c.json(pageOf(c, items, total));
});

app.get('/api/dashboard/customer/recommendations', async (c) => {
  const { customerId } = c.get('jwtPayload');
  const items = await all(c.env.DB, 'SELECT mi.Id, mi.Name, mi.Price, mc.Name CategoryName FROM Menu_Items mi LEFT JOIN Menu_Categories mc ON mi.CategoryId=mc.Id WHERE mi.IsDeleted=0 AND mi.IsAvailable=1 LIMIT 6');
  return c.json({ BasedOnOrders: 0, FavouriteCategories: [], Items: items.map((r) => ({ MenuItemId: r.Id, Name: r.Name, CategoryName: r.CategoryName ?? '', Price: num(r.Price), Reason: 'Popular choice' })) });
});

// ---------- ANALYTICS ----------
async function overviewFor(c: any, branchId: number | null) {
  const where = branchId ? 'AND BranchId = ?' : '';
  const p: any[] = branchId ? [branchId] : [];
  const r = await one(c.env.DB, `SELECT COUNT(*) orders, COALESCE(SUM(NetAmount),0) rev, COALESCE(SUM(GuestCount),0) guests FROM Orders WHERE IsDeleted=0 ${where}`, ...p);
  const orders = num(r?.orders), rev = num(r?.rev);
  return { TotalOrders: orders, GrossSales: rev, TotalRevenue: rev, NetProfit: 0, ProfitMarginPercentage: 0, AverageOrderValue: orders ? rev / orders : 0, TotalGuests: num(r?.guests), AverageSpendPerGuest: num(r?.guests) ? rev / num(r?.guests) : 0 };
}

app.get('/api/analytics/overview', async (c) => c.json(await overviewFor(c, null)));

app.get('/api/analytics/hourly-heatmap', async (c) => {
  const rows = await all(c.env.DB, `SELECT CAST(strftime('%w', OrderDate) AS INTEGER) DayOfWeek, CAST(strftime('%H', OrderDate) AS INTEGER) Hour, COUNT(*) Orders, COALESCE(SUM(NetAmount),0) Revenue FROM Orders WHERE IsDeleted=0 GROUP BY DayOfWeek, Hour`);
  const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const cells = rows.map((r) => ({ DayOfWeek: num(r.DayOfWeek), DayName: names[num(r.DayOfWeek) % 7], Hour: num(r.Hour), Orders: num(r.Orders), Revenue: num(r.Revenue) }));
  const max = cells.reduce((m, x) => Math.max(m, x.Orders), 0);
  const busiest = cells.length ? cells.reduce((a, b) => (b.Orders > a.Orders ? b : a)) : null;
  return c.json({ Cells: cells, MaxOrders: max, BusiestSlot: busiest });
});

app.get('/api/analytics/rfm-matrix', async (c) => c.json({ PurchasingCustomers: 0, FrequencyMatrix: [], MonetaryMatrix: [] }));

// ---------- ML ANALYTICS (no models deployed -> valid empty shapes) ----------
app.get('/api/ml-analytics/market-basket', async (c) => c.json([]));
app.get('/api/ml-analytics/price-sensitivity', async (c) => c.json([]));
app.get('/api/ml-analytics/promotion-traps', async (c) => c.json([]));
app.get('/api/ml-analytics/recommendations', async (c) => c.json([]));
app.get('/api/ml-analytics/churn-risk', async (c) => c.json({ ScoredCustomers: 0, Customers: [] }));
app.get('/api/ml-analytics/rating-anomalies', async (c) => c.json([]));
app.get('/api/ml-analytics/slow-moving-dishes', async (c) => c.json([]));
app.get('/api/ml-analytics/wastage-risk', async (c) => c.json([]));
app.get('/api/ml-analytics/demand-forecast', async (c) => c.json([]));

app.get('/api/ml-analytics/dual-pipeline-comparison', async (c) => {
  const emptyClf = { accuracy: 0, weighted_precision: 0, weighted_recall: 0, macro_f1: 0, train_rows: 0, test_rows: 0 };
  const emptyReg = { mae: 0, rmse: 0, mape_percent: 0, train_rows: 0, test_rows: 0 };
  return c.json({
    spark_pipeline: { pipeline: 'spark', menu_performance_classification: { best_model: 'n/a', best_model_display_name: 'n/a', best_macro_f1: 0, candidates: {}, feature_columns: [], label_classes: [], saved_path: '' }, demand_forecasting: emptyReg },
    python_pipeline: { pipeline: 'python', menu_performance_classification: emptyClf, demand_forecasting: emptyReg, wastage_prediction: emptyReg, churn_risk_classification: emptyClf },
    comparison: {
      menu_performance_classification: { total_records: 0, matched_count: 0, mismatched_count: 0, agreement_percent: 0, spark_accuracy_vs_actual: 0, xgboost_accuracy_vs_actual: 0, comparisons: [] },
      demand_forecast_regression: { task: 'demand_forecast', total_records: 0, matched_count: 0, mismatched_count: 0, agreement_percent: 0, mean_absolute_difference: 0, records: [] },
    },
  });
});

app.post('/api/ml-analytics/what-if', async (c) => {
  const d = await c.req.json();
  const mi = await one(c.env.DB, 'SELECT * FROM Menu_Items WHERE Id = ?', d.menu_item_id);
  const sold = await one(c.env.DB, 'SELECT COALESCE(SUM(Quantity),0) q, COALESCE(SUM(TotalPrice),0) r FROM Order_Items WHERE MenuItemId = ?', d.menu_item_id);
  const price = num(mi?.Price), qty = num(sold?.q), rev = num(sold?.r);
  const pp = price * (1 + num(d.price_change_percent) / 100);
  const projectedQty = qty * (1 - num(d.price_change_percent) / 100);
  const projectedRev = pp * projectedQty;
  return c.json({
    menu_item_id: d.menu_item_id, menu_item_name: mi?.Name ?? '', price_change_percent: num(d.price_change_percent), discount_percent: num(d.discount_percent),
    remove_item: !!d.remove_item, prep_quantity_change_percent: num(d.prep_quantity_change_percent), wastage_assumption_change_percent: num(d.wastage_assumption_change_percent),
    elasticity_coefficient: 1, current_price: price, projected_price: pp, current_quantity: qty, projected_quantity: projectedQty,
    current_revenue: rev, projected_revenue: projectedRev, current_profit: 0, projected_profit: 0, current_margin_percent: 0, projected_margin_percent: 0,
    revenue_delta_percent: rev ? ((projectedRev - rev) / rev) * 100 : 0, profit_delta_percent: 0, volume_delta_percent: qty ? ((projectedQty - qty) / qty) * 100 : 0,
  });
});

// ---------- RATINGS ----------
app.post('/api/ratings', async (c) => {
  const d = await c.req.json();
  const { customerId } = c.get('jwtPayload');
  const res = await run(c.env.DB, 'INSERT INTO Ratings (MenuItemId, CustomerId, OrderId, Score, Comment) VALUES (?,?,?,?,?)', d.MenuItemId, customerId, d.OrderId ?? null, d.Score, d.Comment ?? null);
  const r = await one(c.env.DB, `SELECT r.*, mi.Name MenuItemName, cu.Name CustomerName FROM Ratings r LEFT JOIN Menu_Items mi ON r.MenuItemId=mi.Id LEFT JOIN Customers cu ON r.CustomerId=cu.Id WHERE r.Id=?`, res.meta.last_row_id);
  return c.json({ Id: r!.Id, MenuItemId: r!.MenuItemId, MenuItemName: r!.MenuItemName ?? '', CustomerId: r!.CustomerId, CustomerName: r!.CustomerName ?? '', OrderId: r!.OrderId ?? null, BranchId: r!.BranchId ?? null, Score: num(r!.Score), Comment: r!.Comment ?? null, CreatedAt: r!.CreatedAt });
});

app.get('/api/ratings/menu-item/:menuItemId', async (c) => {
  const id = c.req.param('menuItemId');
  const rows = await all(c.env.DB, `SELECT r.*, mi.Name MenuItemName, cu.Name CustomerName FROM Ratings r LEFT JOIN Menu_Items mi ON r.MenuItemId=mi.Id LEFT JOIN Customers cu ON r.CustomerId=cu.Id WHERE r.MenuItemId=? AND r.IsDeleted=0 ORDER BY r.CreatedAt DESC LIMIT ? OFFSET ?`, id, qInt(c, 'limit', 20), qInt(c, 'skip', 0));
  const total = num((await one(c.env.DB, 'SELECT COUNT(*) n FROM Ratings WHERE MenuItemId=? AND IsDeleted=0', id))?.n);
  return c.json(pageOf(c, rows.map((r) => ({ Id: r.Id, MenuItemId: r.MenuItemId, MenuItemName: r.MenuItemName ?? '', CustomerId: r.CustomerId, CustomerName: r.CustomerName ?? '', OrderId: r.OrderId ?? null, BranchId: r.BranchId ?? null, Score: num(r.Score), Comment: r.Comment ?? null, CreatedAt: r.CreatedAt })), total));
});

app.get('/api/ratings/me', async (c) => {
  const { customerId } = c.get('jwtPayload');
  const rows = await all(c.env.DB, `SELECT r.*, mi.Name MenuItemName, cu.Name CustomerName FROM Ratings r LEFT JOIN Menu_Items mi ON r.MenuItemId=mi.Id LEFT JOIN Customers cu ON r.CustomerId=cu.Id WHERE r.CustomerId=? AND r.IsDeleted=0 ORDER BY r.CreatedAt DESC LIMIT ? OFFSET ?`, customerId, qInt(c, 'limit', 20), qInt(c, 'skip', 0));
  const total = num((await one(c.env.DB, 'SELECT COUNT(*) n FROM Ratings WHERE CustomerId=? AND IsDeleted=0', customerId))?.n);
  return c.json(pageOf(c, rows.map((r) => ({ Id: r.Id, MenuItemId: r.MenuItemId, MenuItemName: r.MenuItemName ?? '', CustomerId: r.CustomerId, CustomerName: r.CustomerName ?? '', OrderId: r.OrderId ?? null, BranchId: r.BranchId ?? null, Score: num(r.Score), Comment: r.Comment ?? null, CreatedAt: r.CreatedAt })), total));
});

// ---------- ASSISTANT ----------
app.post('/api/assistant/chat', async (c) => c.json({ Reply: 'The AI assistant is not configured on this deployment. Add a model API key to enable it.', Configured: false }));

app.notFound((c) => c.json({ error: 'Not found', path: c.req.path }, 404));
app.onError((err, c) => { console.error(err); return c.json({ error: 'Internal server error' }, 500); });

export default app;
