import { AnimatePresence, motion } from 'framer-motion'
import { Badge, EmptyState, ShimmerSkeleton, statusTone } from '../ui'
import { money, timeAgo } from '../../utils/format'
import type { Order, OrderType } from '../../types/api'

const typeIcon: Record<OrderType, string> = { 'Dine-in': '🍽', Takeaway: '🥡', Delivery: '🛵' }

/** The animated order-list body shared by the admin and branch-manager "recent activity"
 * panels -- each caller supplies its own header/title and real order list. */
export function OrdersFeedList({ orders, loading }: { orders: Order[]; loading: boolean }) {
  if (loading && orders.length === 0) {
    return (
      <div className="mt-4 space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <ShimmerSkeleton key={i} className="h-11" rounded="rounded-xl" />
        ))}
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="mt-2">
        <EmptyState title="No orders yet" icon="🧾" />
      </div>
    )
  }

  return (
    <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
      <AnimatePresence initial={false}>
        {orders.map((o) => (
          <motion.li
            key={o.Id}
            layout
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="flex items-center gap-3 py-2.5"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm dark:bg-brand-900/40">{typeIcon[o.OrderType]}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-ink dark:text-slate-100">
                {o.OrderType}
                {o.TableNumber ? ` · Table ${o.TableNumber}` : ''}
                {o.Customer ? ` · ${o.Customer.CustomerName}` : ''}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {o.OrderNumber} · {timeAgo(o.OrderDate)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[13px] font-semibold text-ink dark:text-white">{money(o.NetAmount)}</p>
              <Badge tone={statusTone(o.Status)}>{o.Status}</Badge>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  )
}
