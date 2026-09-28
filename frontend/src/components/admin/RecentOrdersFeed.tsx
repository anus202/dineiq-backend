import { OrdersFeedList } from '../orders/OrdersFeedList'
import { useApi } from '../../hooks/useApi'
import { orderApi } from '../../services/endpoints'

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
      <OrdersFeedList orders={orders} loading={recent.loading && !recent.data} />
    </div>
  )
}
