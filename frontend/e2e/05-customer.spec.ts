import { expect, test } from '@playwright/test'
import { login, shot } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page, 'customer')
})

test('loyalty progress, live order tracking and recommendations', async ({ page }) => {
  await expect(page.getByText('Your tier')).toBeVisible()
  await expect(page.getByText('Points balance')).toBeVisible()
  for (const tier of ['Silver', 'Gold', 'Platinum']) {
    await expect(page.getByText(tier, { exact: true }).last()).toBeVisible()
  }
  await expect(page.getByText(/points to (Gold|Platinum)|top tier/)).toBeVisible()

  // The delivery order the cashier placed is open and tracked; the settled one shows as paid.
  await expect(page.getByText('Preparing for delivery').first()).toBeVisible()
  await expect(page.getByText('Completed & paid').first()).toBeVisible()
  await expect(page.getByText('Order received').first()).toBeVisible() // stepper

  await expect(page.getByText('Recommended for you')).toBeVisible()
  await expect(page.getByText(/You've ordered this|Popular in|Popular with other diners/).first()).toBeVisible()
  await shot(page, '05-customer-portal')
})

test('customers are kept out of staff dashboards', async ({ page }) => {
  for (const path of ['/admin', '/inventory', '/pos']) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/customer$/)
  }
})
