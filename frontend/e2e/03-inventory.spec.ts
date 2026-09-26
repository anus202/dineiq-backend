import { expect, test } from '@playwright/test'
import { expectToast, login, shot, stamp } from './helpers'

test.beforeEach(async ({ page }) => {
  await login(page, 'inventory')
})

test('stock status matrix shows green / yellow / red health and valuation', async ({ page }) => {
  await expect(page.getByText('Stock valuation')).toBeVisible()
  await expect(page.getByText('Out of stock', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Low', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Healthy', { exact: true }).first()).toBeVisible()
  await shot(page, '03-inventory-matrix')
})

test('item CRUD and manual adjustment with mandatory reason', async ({ page }) => {
  const name = `E2E Flour ${stamp()}`
  await page.getByRole('button', { name: '+ New item' }).click()
  const form = page.getByRole('dialog')
  await form.getByLabel('Item name').fill(name)
  await form.getByLabel('Unit cost (PKR)').fill('150')
  await form.getByLabel('Opening stock').fill('10')
  await form.getByLabel('Reorder level').fill('4')
  await form.getByRole('button', { name: 'Save' }).click()
  await expectToast(page, 'Item created')
  const tile = page.locator('main .card').filter({ hasText: name })
  await expect(tile).toContainText('10 kg')

  // Adjust: the reason is required before the button enables.
  await tile.getByRole('button', { name: '± Adjust' }).click()
  const adjust = page.getByRole('dialog')
  await adjust.getByLabel('Quantity (kg)').fill('5')
  await expect(adjust.getByRole('button', { name: 'Record adjustment' })).toBeDisabled()
  await adjust.getByLabel('Reason (required)').fill('E2E weekly purchase')
  await expect(adjust.getByText('10 kg →')).toBeVisible()
  await adjust.getByRole('button', { name: 'Record adjustment' }).click()
  await expectToast(page, 'Stock adjusted')
  await expect(tile).toContainText('15 kg')

  // Removing more than is on hand is blocked in the form.
  await tile.getByRole('button', { name: '± Adjust' }).click()
  await page.getByRole('dialog').getByRole('button', { name: /Remove stock/ }).click()
  await page.getByRole('dialog').getByLabel('Quantity (kg)').fill('40')
  await expect(page.getByRole('dialog').getByText('Would take stock below zero')).toBeVisible()
  await page.getByRole('dialog').getByLabel('Quantity (kg)').fill('12')
  await page.getByRole('dialog').getByLabel('Reason (required)').fill('E2E spoiled batch')
  await page.getByRole('dialog').getByRole('button', { name: 'Record adjustment' }).click()
  await expectToast(page, 'Stock adjusted')
  await expectToast(page, 'Low stock') // 3 kg <= reorder level 4
  await expect(tile).toContainText('Low')

  // The movement log records both, with the reasons.
  const log = page.getByRole('row').filter({ hasText: 'E2E spoiled batch' })
  await expect(log).toContainText('MANUAL DEDUCTION')
  await expect(page.getByRole('row').filter({ hasText: 'E2E weekly purchase' })).toContainText('Demo Inventory Manager')
  await shot(page, '03-inventory-adjusted')

  // Edit then delete.
  await tile.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('dialog').getByLabel('Reorder level').fill('2')
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await expectToast(page, 'Item updated')
  await tile.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  await expectToast(page, 'Item deleted')
  await expect(page.locator('main .card').filter({ hasText: name })).toHaveCount(0)
})

test('recipe builder loads and saves a recipe', async ({ page }) => {
  await page.getByRole('button', { name: /Recipe builder/ }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Filter menu items').fill('Chicken Biryani')
  await dialog.getByRole('button', { name: /Chicken Biryani/ }).first().click()
  await expect(dialog.getByLabel('Ingredient')).toHaveCount(6)
  await expect(dialog.getByText(/ingredient cost from this recipe/)).toBeVisible()
  await shot(page, '03-inventory-recipe')
  await dialog.getByRole('button', { name: 'Save recipe' }).click()
  await expectToast(page, 'Recipe saved')
})
