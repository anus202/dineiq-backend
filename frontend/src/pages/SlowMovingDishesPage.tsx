import { PageHeader } from '../components/layout/AppLayout'
import { Badge, ErrorBanner, ShimmerSkeleton } from '../components/ui'
import { ExportButtons } from '../components/common/ExportButtons'
import { useApi } from '../hooks/useApi'
import { mlAnalyticsApi } from '../services/endpoints'
import type { SlowMovingDish } from '../types/api'

export function SlowMovingDishesPage() {
  const dishes = useApi(() => mlAnalyticsApi.slowMovingDishes(), [])

  return (
    <>
      <PageHeader
        title="Slow-Moving Dish Detection"
        subtitle="Items flagged by a combination of low volume, low order frequency, a long gap since last purchase, weak margin and a declining trend"
        actions={
          <ExportButtons<SlowMovingDish>
            filename="slow_moving_dishes"
            data={dishes.data}
            columns={[
              { header: 'Menu Item', accessor: (d) => d.menu_item_name },
              { header: 'Total Qty Sold', accessor: (d) => d.total_quantity_sold },
              { header: 'Order Count', accessor: (d) => d.order_count },
              { header: 'Recency (days)', accessor: (d) => d.recency_days },
              { header: 'Margin %', accessor: (d) => d.margin_percent },
              { header: 'Signal Count', accessor: (d) => d.signal_count },
              { header: 'Signals', accessor: (d) => d.signals.join('; ') },
            ]}
          />
        }
      />
      {dishes.error && <ErrorBanner message={dishes.error} onRetry={dishes.reload} />}
      {dishes.loading && !dishes.data && <ShimmerSkeleton className="h-64" rounded="rounded-2xl" />}
      {dishes.data?.length === 0 && (
        <p className="text-sm text-slate-500">
          No items currently combine enough signals to be flagged as slow-moving — sales volume, frequency and margin are
          fairly even across the current menu.
        </p>
      )}
      <div className="space-y-3">
        {dishes.data?.map((d) => (
          <div key={d.menu_item_id} className="card p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="font-medium text-ink">{d.menu_item_name}</p>
              <Badge tone={d.signal_count >= 4 ? 'red' : d.signal_count >= 3 ? 'yellow' : 'gray'}>{d.signal_count} signals</Badge>
            </div>
            <p className="text-sm text-slate-500">
              {d.total_quantity_sold} sold · {d.order_count} orders · last sold {d.recency_days}d ago · {d.margin_percent}% margin
            </p>
            <p className="mt-1 text-xs text-slate-400">{d.signals.join(' · ')}</p>
          </div>
        ))}
      </div>
    </>
  )
}
