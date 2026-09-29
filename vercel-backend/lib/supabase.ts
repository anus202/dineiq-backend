// Supabase PostgreSQL client for Vercel serverless functions
import postgres from 'postgres';

const connectionString = process.env.SUPABASE_DATABASE_URL || '';
const sql = postgres(connectionString, {
  ssl: 'require',
  max: 1,
  idle_timeout: 1,
  connect_timeout: 10,
});

export interface QueryResult<T = unknown> {
  results: T[];
  meta: { changes: number; last_row_id: number };
}

/** Convert ? placeholders to $1, $2, ... for PostgreSQL */
function convertPlaceholders(query: string): string {
  let i = 0;
  return query.replace(/\?/g, () => `$${++i}`);
}

/** Convert = 1 / = 0 to = TRUE / = FALSE for boolean columns (PostgreSQL is strict) */
const BOOLEAN_COLUMNS = [
  'IsActive', 'IsDeleted', 'IsAvailable', 'IsSuccess',
  'CanAccessInventory', 'CanTriggerPipeline', 'CanAccessMenuManagement', 'CanAccessBranchAnalytics',
];

function convertBooleanComparisons(query: string): string {
  for (const col of BOOLEAN_COLUMNS) {
    query = query.replace(new RegExp(`${col}\\s*=\\s*1`, 'g'), `${col} = TRUE`);
    query = query.replace(new RegExp(`${col}\\s*=\\s*0`, 'g'), `${col} = FALSE`);
  }
  return query;
}

/**
 * Wraps a row so property access is case-insensitive.
 * PostgreSQL folds unquoted identifiers to lowercase, so `user.PasswordHash`
 * would be undefined — this Proxy maps it to `user.passwordhash`.
 */
function caseInsensitive<T extends Record<string, any>>(row: T): T {
  return new Proxy(row, {
    get(target, prop) {
      if (typeof prop === 'string') {
        const lower = prop.toLowerCase();
        if (lower in target) return target[lower];
      }
      return (target as Record<string, any>)[prop as string];
    },
  }) as T;
}

export async function dbQuery<T = unknown>(
  query: string,
  params: (string | number | null | boolean)[] = []
): Promise<QueryResult<T>> {
  const rows = (await sql.unsafe(convertBooleanComparisons(convertPlaceholders(query)), params)) as Record<string, any>[];
  return {
    results: rows.map((r) => caseInsensitive(r)) as T[],
    meta: { changes: rows.length, last_row_id: 0 },
  };
}

export async function dbExecute(
  query: string,
  params: (string | number | null | boolean)[] = []
): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
  const result = await sql.unsafe(convertBooleanComparisons(convertPlaceholders(query)), params);
  return {
    success: true,
    meta: { changes: Array.isArray(result) ? result.length : 0, last_row_id: 0 },
  };
}

export default sql;
