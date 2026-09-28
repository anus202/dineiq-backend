import type { BadgeTone } from '../ui'

export type StockHealth = 'Healthy' | 'Low' | 'Out'

/** Green: above reorder level. Yellow: at or below it. Red: nothing (or less) left. */
export const stockHealth = (stock: number, reorderLevel: number): StockHealth =>
  stock <= 0 ? 'Out' : stock <= reorderLevel ? 'Low' : 'Healthy'

export const healthTone: Record<StockHealth, BadgeTone> = { Healthy: 'green', Low: 'yellow', Out: 'red' }

export const healthBar: Record<StockHealth, string> = { Healthy: 'bg-emerald-500', Low: 'bg-amber-400', Out: 'bg-rose-500' }

/** Left accent border, colour-coded the same as the badge/bar above. */
export const healthAccent: Record<StockHealth, string> = {
  Healthy: 'border-l-emerald-400 dark:border-l-emerald-500',
  Low: 'border-l-amber-400 dark:border-l-amber-500',
  Out: 'border-l-rose-400 dark:border-l-rose-500',
}
