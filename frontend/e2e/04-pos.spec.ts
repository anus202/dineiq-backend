import { expect, test } from '@playwright/test'
import { expectToast, login, shot } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page, 'cashier')
})

test('floor plan shows every table with status and Pax', async ({ page }) => {
  await expect(page.getByRole('button', { name: /^Table T-\d+, / })).toHaveCount(12)
  await expect(page.getByText(/\d+ available/)).toBeVisible()
  await expect(page.getByText(/Pax \d+ \/ \d+ seats/).first()).toBeVisible()
  await shot(page, '04-pos-floorplan')
})

test('dine-in: seat a registered customer, then settle in cash with an invoice', async ({ page }) => {
  const table = page.getByRole('button', { name: /, available$/ }).first()
  const label = (await table.getAttribute('aria-label')) ?? ''
  const tableNumber = label.split(',')[0].replace('Table ', '')
  await table.click()
  await page.getByRole('button', { name: 'Seat a party & start order' }).click()

  const builder = page.getByRole('dialog')
  await builder.getByLabel('Search dishes').fill('Chicken Biryani')
  await builder.getByRole('button', { name: /^Chicken Biryani/ }).click()
  await builder.getByRole('button', { name: /^Chicken Biryani/ }).click() // x2
  await builder.getByLabel('Search dishes').fill('French Fries')
  await builder.getByRole('button', { name: /^French Fries Basket/ }).click()
  await builder.getByLabel('Customer phone (optional)').fill('3400036540')
  const dineInMatch = builder.getByRole('button', { name: /\+923400036540/ })
  await expect(dineInMatch).toBeVisible() // debounced search against the 500k-customer table
  await dineInMatch.click()
  await expect(builder.getByText(/pts$/)).toBeVisible()
  await shot(page, '04-pos-order-builder')
  await builder.getByRole('button', { name: `Place order & seat at ${tableNumber}` }).click()
  await expectToast(page, /Order ORD-\d{4}-\d{6} placed/)

  const seated = page.getByRole('button', { name: `Table ${tableNumber}, occupied` })
  await expect(seated).toBeVisible()
  await expect(seated).toContainText('Pax 2')
  await seated.click()

  const drawer = page.getByRole('dialog', { name: /Settle ORD-/ })
  await expect(drawer.getByText('Amount due')).toBeVisible()
  await expect(drawer.getByText(/tier \(\d+%\)/)).toBeVisible() // registered customer gets their tier line
  await drawer.getByRole('button', { name: /^Rs/ }).first().click() // exact cash
  await shot(page, '04-pos-settlement')
  await drawer.getByRole('button', { name: /^Charge Rs/ }).click()

  const invoice = page.getByRole('dialog', { name: 'Invoice' })
  await expect(invoice.getByText(/^INV-\d{4}-\d{6}$/)).toBeVisible()
  await expect(invoice).toContainText(`Table ${tableNumber}`)
  await expect(invoice).toContainText('Points earned')
  await shot(page, '04-pos-invoice')
  await invoice.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('button', { name: `Table ${tableNumber}, available` })).toBeVisible() // freed
})

test('takeaway walk-in: card payment, points disabled without a customer', async ({ page }) => {
  await page.getByRole('button', { name: '+ Takeaway / delivery order' }).click()
  const builder = page.getByRole('dialog')
  await builder.getByLabel('Search dishes').fill('Garlic Bread')
  await builder.getByRole('button', { name: /^Garlic Bread with Cheese/ }).click()
  await builder.getByRole('button', { name: 'Place order' }).click()
  await expectToast(page, /placed/)

  const open = page.locator('aside').getByRole('button', { name: /ORD-/ }).first()
  await expect(open).toContainText('Takeaway')
  await open.click()
  const drawer = page.getByRole('dialog', { name: /Settle ORD-/ })
  await expect(drawer.getByText('Walk-in customer')).toBeVisible()
  await expect(drawer.getByRole('button', { name: /Points/ })).toBeDisabled()
  await drawer.getByRole('button', { name: /Card/ }).click()
  await drawer.getByRole('button', { name: /^Charge Rs/ }).click()
  await expect(page.getByRole('dialog', { name: 'Invoice' }).getByText(/Paid \(Card\)/)).toBeVisible()
})

test('open order for the demo customer (shown live in the customer portal)', async ({ page }) => {
  await page.getByRole('button', { name: '+ Takeaway / delivery order' }).click()
  const builder = page.getByRole('dialog')
  await builder.getByLabel('Order type').selectOption('Delivery')
  await builder.getByLabel('Search dishes').fill('Mutton Biryani')
  await builder.getByRole('button', { name: /^Mutton Biryani/ }).click()
  await builder.getByLabel('Customer phone (optional)').fill('3400036540')
  const deliveryMatch = builder.getByRole('button', { name: /\+923400036540/ })
  await expect(deliveryMatch).toBeVisible() // debounced search against the 500k-customer table
  await deliveryMatch.click()
  await builder.getByRole('button', { name: 'Place order' }).click()
  await expectToast(page, /placed/)
})
