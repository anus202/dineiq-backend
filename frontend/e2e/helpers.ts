import { expect, type Page } from '@playwright/test'

// Demo accounts created by backend/scripts/seed_demo_data.py.
export const PASSWORD = process.env.DEMO_PASSWORD ?? 'Demo@12345'
export const USERS = {
  admin: 'admin@dineiq.demo',
  inventory: 'inventory@dineiq.demo',
  cashier: 'cashier@dineiq.demo',
  customer: 'customer36540@gmail.com',
} as const

const HOME: Record<keyof typeof USERS, string> = { admin: '/admin', inventory: '/inventory', cashier: '/pos', customer: '/customer' }

export async function login(page: Page, who: keyof typeof USERS): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Email').fill(USERS[who])
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(`**${HOME[who]}`)
}

export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `e2e-results/screenshots/${name}.png`, fullPage: true })
}

/** Waits for a toast with this title. */
export async function expectToast(page: Page, title: string | RegExp): Promise<void> {
  await expect(page.getByRole('status').filter({ hasText: title }).first()).toBeVisible()
}

export const stamp = (): string => new Date().toISOString().replace(/\D/g, '').slice(8, 14)
