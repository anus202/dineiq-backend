"""Diff the frontend's API contract against the backend's registered routes.

Prints every frontend endpoint with no matching backend route, so gaps are fixed
in one pass instead of one 404 at a time.
"""
import re

FRONTEND = r"C:\Projects\dineiq-backend\frontend\src\services\endpoints.ts"
BACKEND = r"C:\Projects\dineiq-backend\vercel-backend\api\index.ts"

fe = open(FRONTEND, encoding="utf-8").read()
be = open(BACKEND, encoding="utf-8").read()

# --- frontend paths -------------------------------------------------------
# get('/x'), post<...>('/x', ...), api.get('/x'), '/x/:id' etc.
calls = re.findall(r"""(?:get|post|put|patch|delete)(?:<[^>]*>)?\(\s*['"`]([^'"`]+)['"`]""", fe)
calls += re.findall(r"""api\.(?:get|post|put|patch|delete)(?:<[^>]*>)?\(\s*['"`]([^'"`]+)['"`]""", fe)

paths = set()
for p in calls:
    p = p.split("?")[0].rstrip("/")
    if not p:
        continue
    # Hono matches ':param' segments literally; normalise both sides the same way.
    paths.add(re.sub(r"\$\{[^}]+\}", ":param", p))

# --- backend routes -------------------------------------------------------
routes = re.findall(r"""app\.(?:get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]""", be)
# Backend registers the '/api' prefix; the frontend omits it (VITE_API_BASE_URL ends in /api).
route_norm = {re.sub(r":[A-Za-z_]+", ":param", r[len("/api"):] if r.startswith("/api") else r) for r in routes}

# Build a matcher: same segment count, literals equal, ':param' matches anything.
def norm(seg_list):
    return seg_list

def matches(fe_path: str) -> str | None:
    fe_segs = fe_path.split("/")
    for r in sorted(route_norm):
        r_segs = r.split("/")
        if len(r_segs) != len(fe_segs):
            continue
        if all(a == b or b == ":param" or a == ":param" for a, b in zip(fe_segs, r_segs)):
            return r
    return None

missing = sorted(p for p in paths if matches(p) is None)
matched = {p: matches(p) for p in sorted(paths) if matches(p)}

print(f"frontend endpoints : {len(paths)}")
print(f"backend routes     : {len(route_norm)}")
print(f"matched            : {len(matched)}")
print(f"MISSING            : {len(missing)}\n")
for p in missing:
    print("  MISSING  ", p)

print("\n--- param normalisation mismatches (same shape, different placeholder) ---")
odd = [(p, r) for p, r in matched.items() if p != r]
for p, r in odd:
    print(f"  {p}   ->  {r}")
