import { expect, test } from '@playwright/test'
import { expectToast, login, shot, stamp } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page, 'admin')
})

test('overview: KPI cards, revenue trend, heatmap, RFM matrix, top performers', async ({ page }) => {
  for (const label of ['Revenue today', 'Orders today', 'Active tables', 'Low stock alerts', 'AOV (30 days)', 'ASPG (30 days)']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible()
  }
  // KPI values arrive (currency on revenue/AOV/ASPG, "x / y" on tables).
  await expect(page.getByText(/^\d+ \/ \d+$/)).toBeVisible()
  await expect(page.getByText('Revenue trend')).toBeVisible()
  await expect(page.locator('.recharts-area').first()).toBeVisible()

  // 7 x 24 heatmap cells with data titles, and a busiest slot callout.
  await expect(page.getByText(/^Busiest:/)).toBeVisible()
  expect(await page.locator('[title*=":00 —"]').count()).toBe(168)

  // 5 x 5 RFM grid.
  await expect(page.getByText(/purchasing customers/)).toBeVisible()
  await page.getByRole('button', { name: 'R × F' }).click()
  expect(await page.locator('[title^="R"][title*="customers, avg"]').count()).toBeGreaterThan(0)

  await expect(page.getByText('Top performers')).toBeVisible()
  await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible()
  await shot(page, '02-admin-overview')
})

test('category management: create, rename, delete', async ({ page }) => {
  const name = `E2E Category ${stamp()}`
  await page.getByRole('tab', { name: 'Categories' }).click()
  await page.getByRole('button', { name: '+ New category' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill(name)
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await expectToast(page, 'Category created')
  const row = page.getByRole('row').filter({ hasText: name })
  await expect(row).toBeVisible()

  await row.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill(`${name} v2`)
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await expectToast(page, 'Category updated')
  const renamed = page.getByRole('row').filter({ hasText: `${name} v2` })
  await expect(renamed).toBeVisible()
  await shot(page, '02-admin-categories')

  await renamed.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expectToast(page, 'Category deleted')
  await expect(page.getByRole('row').filter({ hasText: `${name} v2` })).toHaveCount(0)
})

test('menu item mapper: server-side search, category filter and edit form', async ({ page }) => {
  await page.getByRole('tab', { name: 'Menu Item Mapper' }).click()
  await page.getByLabel('Search table').fill('Biryani')
  await expect(page.getByRole('row').filter({ hasText: 'Chicken Biryani' })).toBeVisible()
  await expect(page.getByText(/^Showing 1–\d+ of \d+$/)).toBeVisible()
  await page.getByRole('row').filter({ hasText: 'Chicken Biryani' }).getByRole('button', { name: 'Edit' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Name')).toHaveValue('Chicken Biryani')
  await expect(dialog.getByText('Contribution margin')).toBeVisible()
  await shot(page, '02-admin-menu-edit')
  await dialog.getByRole('button', { name: 'Cancel' }).click()

  await page.getByLabel('Search table').fill('')
  await page.getByLabel('Filter by category').selectOption({ label: 'Hot Beverages' })
  await expect(page.getByRole('row').nth(1)).toContainText('Hot Beverages')
})

test('customer search over 500k records opens the profile with RFM', async ({ page }) => {
  await page.getByRole('tab', { name: 'Customer Search' }).click()
  await expect(page.getByText(/of 500,\d{3}$/)).toBeVisible() // the full customer base is paged server-side
  await page.getByLabel('Search table').fill('3400036540')
  const row = page.getByRole('row').filter({ hasText: '+923400036540' })
  await expect(row).toBeVisible()
  await row.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('RFM analysis')).toBeVisible()
  await expect(dialog.getByText(/^RFM \d{3}$/)).toBeVisible()
  await expect(dialog.getByText('Recent orders')).toBeVisible()
  await shot(page, '02-admin-customer-profile')
})

test('audit logs: entries, action filter and old/new values', async ({ page }) => {
  await page.getByRole('tab', { name: 'Audit Logs' }).click()
  await expect(page.getByRole('row').nth(1)).toBeVisible()
  await page.getByLabel('All actions').selectOption('CREATE')
  const first = page.getByRole('row').nth(1)
  await expect(first).toContainText('CREATE')
  await first.click()
  await expect(page.getByText('New values')).toBeVisible()
  await expect(page.locator('pre').last()).toContainText('"')
  await shot(page, '02-admin-audit')
})
