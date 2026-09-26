import { defineConfig } from '@playwright/test'

// End-to-end tests against the running dev servers (backend :8001, frontend :5173).
// Uses the locally installed Chrome, so no browser download is needed.
//
// Timeouts are generous because this app's dev database is a 500k-customer /
// 50k-order SQL Server instance on a memory-constrained machine: analytics
// aggregations and phone-number searches can take several seconds on a cold
// cache. globalSetup warms the heaviest queries once before any test runs so
// individual assertions don't have to absorb that first-hit cost themselves.
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e-results/artifacts',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1, // specs share one database; run them in order (01-, 02-, ...)
  retries: 1, // one retry absorbs a stray slow query without masking a real failure
  timeout: 180_000,
  expect: { timeout: 45_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    actionTimeout: 45_000,
    navigationTimeout: 45_000,
  },
})
