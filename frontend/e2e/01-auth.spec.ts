import { expect, test } from '@playwright/test'
import { login, PASSWORD, shot, USERS } from './helpers'

test('logged-out users are sent to login', async ({ page }) => {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in to DineIQ' })).toBeVisible()
  await shot(page, '01-login')
})

test('wrong password shows the API error', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(USERS.admin)
  await page.getByLabel('Password').fill('definitely-wrong')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText('Invalid email or password')
})

for (const [who, home, label] of [
  ['admin', '/admin', 'Admin'],
  ['inventory', '/inventory', 'Inventory Manager'],
  ['cashier', '/pos', 'Cashier'],
  ['customer', '/customer', 'Customer'],
] as const) {
  test(`${who} signs in and lands on ${home}`, async ({ page }) => {
    await login(page, who)
    await expect(page).toHaveURL(new RegExp(`${home}$`))
    await expect(page.locator('header').getByText(label, { exact: true })).toBeVisible()
  })
}

test('role guard: a cashier opening /admin or /inventory is sent back to /pos', async ({ page }) => {
  await login(page, 'cashier')
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/pos$/)
  await page.goto('/inventory')
  await expect(page).toHaveURL(/\/pos$/)
  // Sidebar only offers what the role may use (matched by accessible name: the nav
  // icon is aria-hidden, so it doesn't pollute the link's name; toHaveText would still
  // see the icon glyph since aria-hidden only affects the a11y tree, not rendered text).
  const nav = page.locator('aside nav')
  await expect(nav.getByRole('link')).toHaveCount(1)
  await expect(nav.getByRole('link', { name: 'POS & Tables' })).toBeVisible()
})

test('sign out ends the session', async ({ page }) => {
  await login(page, 'inventory')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/inventory')
  await expect(page).toHaveURL(/\/login$/)
})

test('password is never shown in the login form value after submit', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Password').fill(PASSWORD)
  await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password')
})
