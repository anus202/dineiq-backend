"""Port worker/src/index.ts (D1/Cloudflare) to vercel-backend/api/index.ts (Postgres/Vercel).

Transforms are surgical so the 69 route handlers and their SQL stay byte-identical.
"""
import re
import sys

SRC = r"C:\Projects\dineiq-backend\worker\src\index.ts"
DST = r"C:\Projects\dineiq-backend\vercel-backend\api\index.ts"

src = open(SRC, encoding="utf-8").read()
orig = src

# 1. Drop the Cloudflare `caches.default` response-cache middleware block.
start = src.find("// Response cache for heavy")
end = src.find("// ---------- helpers ----------")
if start == -1 or end == -1 or end < start:
    sys.exit("cache middleware block markers not found")
src = src[:start] + src[end:]

# 2. Cloudflare `Env` binding type -> Hono Variables (jwt payload storage).
src = src.replace(
    "interface Env { DB: D1Database; JWT_SECRET: string; }",
    "",
)
src = src.replace(
    "const app = new Hono<{ Bindings: Env }>();",
    "const app = new Hono<{ Variables: { jwtPayload: any } }>();",
)

# 3. c.env.* -> module-level constants
src = src.replace("c.env.DB", "DB")
src = src.replace("c.env.JWT_SECRET", "JWT_SECRET")

# 4. D1Database type no longer exists (shim returns a duck-typed handle)
src = src.replace("db: D1Database", "db: any")
src = src.replace("(db: D1Database", "(db: any")

# 5. Imports + JWT secret
src = src.replace(
    "import bcrypt from 'bcryptjs';",
    "import bcrypt from 'bcryptjs';\n"
    "import { DB } from '../lib/db';\n\n"
    "const JWT_SECRET = process.env.JWT_SECRET || 'dineiq-jwt-secret-change-in-production-2024';",
    1,
)

# 6. Don't leak internal error messages in production.
src = src.replace(
    "app.onError((err, c) => { console.error(err); return c.json({ error: 'Internal server error', detail: String(err?.message || err) }, 500); });",
    "app.onError((err, c) => { console.error('[api]', c.req.method, c.req.path, err); return c.json({ error: 'Internal server error' }, 500); });",
)

# --- sanity checks -----------------------------------------------------------
if "c.env." in src:
    sys.exit("leftover c.env reference")
if "D1Database" in src:
    sys.exit("leftover D1Database reference")
if "caches.default" in src:
    sys.exit("leftover caches.default reference")
if "new Hono<{ Bindings" in src:
    sys.exit("Env binding type not replaced")

open(DST, "w", encoding="utf-8").write(src)

print(f"OK  {len(orig)} chars -> {len(src)} chars")
print(f"routes: {len(re.findall(r'app\.(?:get|post|put|patch|delete)\(', src))}")
