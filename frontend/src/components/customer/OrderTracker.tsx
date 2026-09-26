import { motion } from 'framer-motion'
import { useState } from 'react'
import { useApi } from '../../hooks/useApi'
import { customerPortalApi } from '../../services/endpoints'
import type { MyOrder } from '../../types/api'
import { dateTime, money } from '../../utils/format'
import { Badge, EmptyState, ErrorBanner, ShimmerSkeleton, statusTone } from '../ui'

const PAGE_SIZE = 8

/** Step index for the progress stepper: received → being prepared/served → done. */
const stepOf = (o: MyOrder): number => (o.Status === 'Completed' ? 2 : o.IsOpen ? 1 : 0)

export function OrderTracker() {
  const [page, setPage] = useState(1)
  const orders = useApi(() => customerPortalApi.myOrders({ skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE }), [page], 10_000)
  const items = orders.data?.Items ?? []
  const pages = Math.max(1, Math.ceil((orders.data?.Total ?? 0) / PAGE_SIZE))

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-ink">My orders</h3>
          <p className="text-xs text-slate-500">Live status · updates every 10 seconds</p>
        </div>
        {orders.data && <span className="text-xs text-slate-500">{orders.data.Total} total</span>}
      </div>
      {orders.error && <ErrorBanner message={orders.error} onRetry={orders.reload} />}
      {orders.loading && !orders.data ? (
        <div className="space-y-3">
          <ShimmerSkeleton className="h-20" rounded="rounded-xl" />
          <ShimmerSkeleton className="h-20" rounded="rounded-xl" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No orders yet" message="Your orders appear here as soon as they're placed." icon="🍽" />
      ) : (
        <ul className="space-y-3">
          {items.map((o) => (
            <motion.li key={o.Id} layout className={`rounded-xl border p-4 ${o.IsOpen ? 'border-brand-300 bg-brand-50/40' : 'border-slate-100'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-xs text-slate-500">{o.OrderNumber}</p>
                  <p className="text-sm font-medium text-ink">{o.TrackingStatus}</p>
                </div>
                <div className="text-right">
                  <Badge tone={statusTone(o.Status)}>{o.Status}</Badge>
                  <p className="mt-1 text-sm font-semibold text-ink">{money(o.NetAmount)}</p>
                </div>
              </div>
              {o.Status !== 'Cancelled' && <Stepper step={stepOf(o)} live={o.IsOpen} />}
              <p className="mt-2 text-xs text-slate-500">
                {dateTime(o.OrderDate)} · {o.OrderType} · {o.items.map((l) => `${l.Quantity}× ${l.MenuItemName}`).join(', ')}
                {o.InvoiceNumber && ` · ${o.InvoiceNumber}`}
              </p>
            </motion.li>
          ))}
        </ul>
      )}
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-xs">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-md px-2 py-1 hover:bg-slate-100 disabled:opacity-40">
            ‹ Newer
          </button>
          <span>
            {page} / {pages}
          </span>
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded-md px-2 py-1 hover:bg-slate-100 disabled:opacity-40">
            Older ›
          </button>
        </div>
      )}
    </div>
  )
}

function Stepper({ step, live }: { step: number; live: boolean }) {
  const labels = ['Order received', 'Preparing / serving', 'Completed']
  return (
    <div className="mt-3 flex items-center gap-2">
      {labels.map((label, i) => (
        <div key={label} className="flex flex-1 items-center gap-2">
          <span className={`relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${i <= step ? 'bg-brand-600' : 'bg-slate-300'}`}>
            {i < step || step === 2 ? '✓' : i + 1}
            {live && i === step && <span className="absolute inset-0 animate-ping rounded-full bg-brand-500 opacity-40" />}
          </span>
          <span className={`hidden text-xs sm:inline ${i <= step ? 'text-ink' : 'text-slate-400'}`}>{label}</span>
          {i < labels.length - 1 && <span className={`h-0.5 flex-1 rounded ${i < step ? 'bg-brand-600' : 'bg-slate-200'}`} />}
        </div>
      ))}
    </div>
  )
}
