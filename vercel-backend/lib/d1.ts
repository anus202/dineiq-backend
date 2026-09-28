// D1 HTTP API client for Vercel serverless functions
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || 'c7b87f3265ae285e56acda761585f8cc';
const DATABASE_ID = process.env.D1_DATABASE_ID || 'b3b9c902-3fda-4a48-abc7-abcead1f4d78';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';

export interface D1Result<T = unknown> {
  results: T[];
  meta: {
    duration: number;
    changes: number;
    last_row_id: number;
  };
}

interface D1ApiResponse {
  success: boolean;
  errors: unknown[];
  result: Array<{
    results: unknown[];
    meta: {
      duration: number;
      changes: number;
      last_row_id: number;
    };
  }>;
}

export async function d1Query<T = unknown>(
  sql: string,
  params: (string | number | null | boolean)[] = []
): Promise<D1Result<T>> {
  const url = `${CLOUDFLARE_API_BASE}/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sql,
      params: params.map(p => p === null ? null : String(p)),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`D1 query failed: ${error}`);
  }

  const data = (await response.json()) as D1ApiResponse;
  
  if (!data.success) {
    throw new Error(`D1 query failed: ${JSON.stringify(data.errors)}`);
  }

  return data.result[0] as D1Result<T>;
}

export async function d1Execute(
  sql: string,
  params: (string | number | null | boolean)[] = []
): Promise<{ success: boolean; meta: { changes: number; last_row_id: number } }> {
  const url = `${CLOUDFLARE_API_BASE}/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sql,
      params: params.map(p => p === null ? null : String(p)),
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`D1 execute failed: ${error}`);
  }

  const data = (await response.json()) as D1ApiResponse;
  
  if (!data.success) {
    throw new Error(`D1 execute failed: ${JSON.stringify(data.errors)}`);
  }

  return {
    success: true,
    meta: data.result[0].meta,
  };
}
