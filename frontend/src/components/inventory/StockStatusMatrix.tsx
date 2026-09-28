import { motion } from 'framer-motion'
import type { InventoryItem } from '../../types/api'
import { money, quantity } from '../../utils/format'
import { Badge, Button, EmptyState, ShimmerSkeleton } from '../ui'
import { healthAccent, healthBar, healthTone, stockHealth } from './stockHealth'

interface Props {
  items: InventoryItem[]
  loading: boolean
  onEdit: (item: InventoryItem) => void
  onAdjust: (item: InventoryItem) => void
  onDelete: (item: InventoryItem) => void
}

/** One tile per raw material, coloured by stock health. */
export function StockStatusMatrix({ items, loading, onEdit, onAdjust, onDelete }: Props) {
  if (loading && !items.length) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <ShimmerSkeleton key={i} className="h-40" rounded="rounded-2xl" />
        ))}
      </div>
    )
  }
  if (!items.length) {
    return (
      <div className="card">
        <EmptyState title="No inventory items" message="Add raw materials to start tracking stock." icon="▤" />
      </div>
    )
  }

  // Worst first: out of stock, then low, then healthy.
  const order = { Out: 0, Low: 1, Healthy: 2 }
  const sorted = [...items].sort((a, b) => order[stockHealth(a.CurrentStock, a.ReorderLevel)] - order[stockHealth(b.CurrentStock, b.ReorderLevel)] || a.ItemName.localeCompare(b.ItemName))

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {sorted.map((item, i) => {
        const health = stockHealth(item.CurrentStock, item.ReorderLevel)
        // Bar: stock against twice the reorder level (so the reorder point sits mid-bar).
        const scale = Math.max(item.ReorderLevel * 2, item.CurrentStock, 1)
        const fill = Math.max(0, Math.min(100, (item.CurrentStock / scale) * 100))
        return (
          <motion.div
            key={item.Id}
            className={`card flex flex-col border-l-[3px] p-4 ${healthAccent[health]}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 12) * 0.03 }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink dark:text-white" title={item.ItemName}>
                  {item.ItemName}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {money(item.UnitCost)} / {item.Unit}
                </p>
              </div>
              <Badge tone={healthTone[health]} dot>
                {health === 'Out' ? 'Out of stock' : health}
              </Badge>
            </div>
            <p className="mt-3 text-2xl font-semibold text-ink dark:text-white">{quantity(item.CurrentStock, item.Unit)}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <motion.div className={`h-full rounded-full ${healthBar[health]}`} initial={{ width: 0 }} animate={{ width: `${fill}%` }} transition={{ duration: 0.6 }} />
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Reorder at {quantity(item.ReorderLevel, item.Unit)} · value {money(Math.max(item.CurrentStock, 0) * item.UnitCost)}
            </p>
            <div className="mt-3 flex gap-1 border-t border-slate-100 pt-3 dark:border-slate-800">
              <Button size="sm" variant="secondary" onClick={() => onAdjust(item)}>
                ± Adjust
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onEdit(item)}>
                Edit
              </Button>
              <Button size="sm" variant="ghost" className="ml-auto text-rose-600 dark:text-rose-400" onClick={() => onDelete(item)}>
                Delete
              </Button>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}
