import { AnimatePresence, motion } from 'framer-motion'
import { Badge, EmptyState, ShimmerSkeleton, statusTone } from '../ui'
import { useApi } from '../../hooks/useApi'
import { orderApi } from '../../services/endpoints'
import { money, timeAgo } from '../../utils/format'
import type { OrderType } from '../../types/api'

const typeIcon: Record<OrderType, string> = { 'Dine-in': '🍽', Takeaway: '🥡', Delivery: '🛵' }

/** The real 6 most-recent orders (order_service.get_all_orders returns newest first),
 * polled every 15s -- no synthetic/simulated activity, just the same data the Orders
 * list itself shows, narrowed and refreshed. */
export function RecentOrdersFeed() {
  const recent = useApi(() => orderApi.list({ skip: 0, limit: 6 }), [], 15_000)
  const orders = recent.data?.Items ?? []

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-ink dark:text-white">Recent orders</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Newest activity, refreshes every 15s</p>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          Live
        </span>
      </div>

      {recent.loading && !recent.data ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <ShimmerSkeleton key={i} className="h-11" rounded="rounded-xl" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="mt-2">
          <EmptyState title="No orders yet" icon="🧾" />
        </div>
      ) : (
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
      )}
    </div>
  )
}
