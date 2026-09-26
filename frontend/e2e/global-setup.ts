import { request } from '@playwright/test'
import { PASSWORD, USERS } from './helpers'

const API = process.env.E2E_API_BASE_URL ?? 'http://localhost:8000/api/v1'

/**
 * Runs once before the suite. Warms SQL Server's buffer pool / plan cache for the
 * heaviest analytics and search queries (hourly heatmap, RFM matrix, top performers,
 * revenue chart, a 500k-row phone search) so the real test assertions — which run
 * against a machine with limited RAM for SQL Server — don't race a cold first query.
 */
export default async function globalSetup(): Promise<void> {
  const api = await request.newContext({ baseURL: API, timeout: 90_000 })
  try {
    const loginRes = await api.post('/auth/login', { data: { Email: USERS.admin, Password: PASSWORD } })
    const { Token } = (await loginRes.json()) as { Token: string }
    const headers = { Authorization: `Bearer ${Token}` }
    const warm = async (path: string) => {
      const start = Date.now()
      const res = await api.get(path, { headers }).catch(() => null)
      console.log(`[warm-up] ${path} -> ${res?.status() ?? 'error'} in ${Date.now() - start}ms`)
    }
    await Promise.all([
      warm('/dashboard/admin/summary'),
      warm('/dashboard/admin/revenue-chart?days=30&months=12'),
      warm('/analytics/hourly-heatmap'),
      warm('/analytics/rfm-matrix'),
      warm('/dashboard/admin/top-performing?days=30'),
      warm('/customers?skip=0&limit=20'),
      warm('/customers?skip=0&limit=20&search=3400036540'),
    ])
  } finally {
    await api.dispose()
  }
}
