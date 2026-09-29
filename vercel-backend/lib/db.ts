// D1-compatible query shim backed by Supabase PostgreSQL.
//
// Lets the Cloudflare Worker's SQL run unchanged on Vercel by emulating the
// `db.prepare(sql).bind(...).all() / .first() / .run()` interface and
// translating SQLite-isms to PostgreSQL.

import postgres from 'postgres';

const sql = postgres(process.env.SUPABASE_DATABASE_URL || '', {
  ssl: 'require',
  // Supavisor *transaction* mode (port 6543): connections return to the pool
  // after each transaction instead of being pinned, so concurrent serverless
  // instances don't exhaust the 15-connection session-mode cap (EMAXCONNSESSION).
  prepare: false, // required by transaction mode (no server-side prepared statements)
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

/** Boolean columns — the Worker's SQL compares these with `= 1` / `= 0`. */
const BOOLEAN_COLUMNS = [
  'canaccessbranchanalytics', 'canaccessinventory', 'canaccessmenumanagement',
  'cantriggerpipeline', 'isactive', 'isavailable', 'isdeleted', 'issuccess',
];

/** bigint/numeric columns — Postgres returns these as strings, the API needs numbers. */
const NUMERIC_COLUMNS = [
  'amountdue', 'amountpayable', 'amounttendered', 'branchid', 'capacity', 'categoryid',
  'changedue', 'cost', 'createdby', 'currentstock', 'customerid', 'discount',
  'discountpercent', 'guestcount', 'id', 'inventoryitemid', 'loyaltypoints', 'managerid',
  'menuitemid', 'netamount', 'newprice', 'oldprice', 'orderdiscount', 'orderid',
  'pointsearned', 'pointsredeemed', 'pointsredemptionamount', 'price', 'quantity',
  'quantitychange', 'quantityrequired', 'reorderlevel', 'roleid', 'score', 'signupid',
  'stockafter', 'subtotal', 'tableid', 'tierdiscount', 'tierdiscountpercentage',
  'totalamount', 'totalprice', 'unitcost', 'unitprice', 'updatedby', 'userid',
];

const BOOL_SET = new Set(BOOLEAN_COLUMNS);
const NUM_SET = new Set(NUMERIC_COLUMNS);

// ---------------------------------------------------------------------------
// SQL translation: SQLite -> PostgreSQL
// ---------------------------------------------------------------------------

function convertBooleans(text: string): string {
  for (const col of BOOLEAN_COLUMNS) {
    text = text.replace(new RegExp(`\\b${col}\\s*=\\s*1\\b`, 'gi'), `${col} = TRUE`);
    text = text.replace(new RegExp(`\\b${col}\\s*=\\s*0\\b`, 'gi'), `${col} = FALSE`);
  }
  return text;
}

function convertStrftime(text: string): string {
  return text.replace(/strftime\(\s*'([^']+)'\s*,\s*([^()]+?)\s*\)/gi, (_m, fmt, expr) => {
    switch (String(fmt)) {
      case '%Y-%m': return `to_char(${expr}, 'YYYY-MM')`;
      case '%Y-%m-%d': return `to_char(${expr}, 'YYYY-MM-DD')`;
      case '%H': return `EXTRACT(HOUR FROM ${expr})`;
      case '%w': return `EXTRACT(DOW FROM ${expr})`;
      default:
        return `to_char(${expr}, '${String(fmt)
          .replace(/%Y/g, 'YYYY').replace(/%m/g, 'MM').replace(/%d/g, 'DD')
          .replace(/%H/g, 'HH24').replace(/%M/g, 'MI').replace(/%S/g, 'SS')}')`;
    }
  });
}

function convertDates(text: string): string {
  // date('now', ?) -> CURRENT_DATE offset by N days ("-30 days" -> -30)
  text = text.replace(
    /date\(\s*'now'\s*,\s*\?\s*\)/gi,
    "(CURRENT_DATE + CAST(REPLACE(REPLACE(?, ' days', ''), ' day', '') AS INTEGER) * INTERVAL '1 day')"
  );
  // date('now') -> CURRENT_DATE
  return text.replace(/date\(\s*'now'\s*\)/gi, 'CURRENT_DATE');
}

function convertPlaceholders(text: string): string {
  let i = 0;
  return text.replace(/\?/g, () => `$${++i}`);
}

/** Full SQLite -> PostgreSQL translation. Placeholder numbering happens last. */
export function translate(sqlText: string): string {
  let q = sqlText;
  q = convertDates(q);
  q = convertStrftime(q);
  q = convertBooleans(q);
  q = convertPlaceholders(q);
  return q;
}

// ---------------------------------------------------------------------------
// Row shaping
// ---------------------------------------------------------------------------

/**
 * Postgres folds unquoted identifiers to lowercase, so `row.FullName` would be
 * undefined. This Proxy maps any property access to its lowercase key, and
 * coerces bigint/numeric strings to numbers to match the D1 responses the
 * frontend was built against.
 */
function shapeRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const lower = key.toLowerCase();
    if (typeof value === 'string' && value !== '' && NUM_SET.has(lower)) {
      const n = Number(value);
      out[lower] = Number.isNaN(n) ? value : n;
    } else if (typeof value === 'boolean' && BOOL_SET.has(lower)) {
      out[lower] = value;
    } else {
      out[lower] = value;
    }
  }
  return new Proxy(out, {
    get(target, prop) {
      if (typeof prop === 'string' && prop.toLowerCase() in target) {
        return target[prop.toLowerCase()];
      }
      return (target as Record<string | symbol, unknown>)[prop];
    },
    has(target, prop) {
      return (typeof prop === 'string' ? prop.toLowerCase() : prop) in target
        || prop in target;
    },
  }) as T;
}

function shapeRows(rows: unknown[]): unknown[] {
  return rows.map((r) => shapeRow((r || {}) as Record<string, unknown>));
}

// ---------------------------------------------------------------------------
// D1-compatible statement object
// ---------------------------------------------------------------------------

export interface D1Result<T = unknown> {
  success: boolean;
  results: T[];
  meta: { changes: number; last_row_id: number; duration: number };
}

export interface D1Statement {
  bind(...params: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

function makeStatement(sqlText: string, params: unknown[]): D1Statement {
  const query = translate(sqlText);

  async function exec() {
    return (await sql.unsafe(query, params as never[])) as unknown[];
  }

  return {
    bind(...next: unknown[]) {
      return makeStatement(sqlText, next);
    },

    async all<T>() {
      const rows = await exec();
      const results = shapeRows(Array.isArray(rows) ? rows : []) as T[];
      return {
        success: true,
        results,
        meta: { changes: results.length, last_row_id: 0, duration: 0 },
      };
    },

    async first<T>(colName?: string) {
      const rows = await exec();
      const arr = Array.isArray(rows) ? rows : [];
      if (!arr.length) return null;
      if (colName) return (shapeRow(arr[0] as Record<string, unknown>) as Record<string, unknown>)[colName] as T;
      return shapeRow(arr[0] as Record<string, unknown>) as T;
    },

    async run<T>() {
      let q = query;
      let returning = false;
      if (/^\s*INSERT/i.test(q) && !/returning/i.test(q)) {
        q += ' RETURNING id';
        returning = true;
      }
      const rows = await sql.unsafe(q, params as never[]) as unknown[] & { count?: number };
      const arr = Array.isArray(rows) ? rows : [];
      const changes = (rows as unknown as { count?: number }).count ?? arr.length;
      let lastRowId = 0;
      if (arr.length) {
        const firstRow = (arr[0] || {}) as Record<string, unknown>;
        const candidate = firstRow.id ?? Object.values(firstRow)[0];
        const n = Number(candidate);
        lastRowId = Number.isNaN(n) ? 0 : n;
      }
      return {
        success: true,
        results: returning ? (shapeRows(arr) as T[]) : [],
        meta: { changes, last_row_id: lastRowId, duration: 0 },
      };
    },
  };
}

/** The D1-compatible database handle used across the API routes. */
export const DB = {
  prepare(sqlText: string) {
    return {
      bind(...params: unknown[]) {
        return makeStatement(sqlText, params);
      },
    };
  },
};

export default sql;
