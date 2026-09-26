import { HourlyHeatmap } from '../components/charts/HourlyHeatmap'
import { RevenueTrendChart } from '../components/charts/RevenueTrendChart'
import { RFMMatrix } from '../components/charts/RFMMatrix'
import { TopItemsChart } from '../components/charts/TopItemsChart'
import { PageHeader } from '../components/layout/AppLayout'
import { Button, ErrorBanner, StatsCard } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { adminDashboardApi, analyticsApi } from '../services/endpoints'
import { count, isoDaysAgo, money } from '../utils/format'

export function AdminOverviewPage() {
  // Today's live figures refresh every 30 s; the heavier analytics load once.
  const summary = useApi(() => adminDashboardApi.summary(), [], 30_000)
  const overview = useApi(() => analyticsApi.overview(isoDaysAgo(29)), [])
  const chart = useApi(() => adminDashboardApi.revenueChart(30, 12), [])
  const heatmap = useApi(() => analyticsApi.heatmap(isoDaysAgo(89)), [])
  const rfm = useApi(() => analyticsApi.rfmMatrix(), [])
  const top = useApi(() => adminDashboardApi.topPerforming(30), [])
  const s = summary.data
  const o = overview.data
  const errors = [summary, overview, chart, heatmap, rfm, top].map((r) => r.error).filter(Boolean)

  return (
    <>
      <PageHeader title="Executive Overview" subtitle="Live restaurant KPIs and demand patterns" />
      <div className="space-y-6">
        {errors.length > 0 && <ErrorBanner message={errors[0] as string} onRetry={() => void summary.reload()} />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatsCard index={0} label="Revenue today" icon="₨" loading={!s} value={s && money(s.SalesToday)} hint={s && `${count(s.CompletedOrdersToday)} completed · ${s.BusinessDate}`} />
          <StatsCard index={1} label="Orders today" icon="🧾" tone="sky" loading={!s} value={s && count(s.OrdersToday)} hint={s && `${count(s.PendingOrders)} pending now`} />
          <StatsCard index={2} label="Active tables" icon="🍽" tone="violet" loading={!s} value={s && `${s.ActiveTables} / ${s.TotalTables}`} hint={s && `${s.ReservedTables} reserved`} />
          <StatsCard
            index={3}
            label="Low stock alerts"
            icon="⚠"
            tone={s && s.LowStockItems > 0 ? 'rose' : 'teal'}
            loading={!s}
            value={s && count(s.LowStockItems)}
            hint={s && `${s.OutOfStockItems} out of stock`}
          />
          <StatsCard index={4} label="AOV (30 days)" icon="∅" tone="amber" loading={!o} value={o && money(o.AverageOrderValue)} hint={o && `${count(o.TotalOrders)} orders`} />
          <StatsCard index={5} label="ASPG (30 days)" icon="👥" tone="slate" loading={!o} value={o && money(o.AverageSpendPerGuest)} hint={o && `${count(o.TotalGuests)} guests`} />
        </div>

        <RevenueTrendChart data={chart.data} loading={chart.loading} />
        <div className="grid gap-6 xl:grid-cols-5">
          <div className="xl:col-span-3">
            <HourlyHeatmap data={heatmap.data} loading={heatmap.loading} />
          </div>
          <div className="xl:col-span-2">
            <RFMMatrix data={rfm.data} loading={rfm.loading} />
          </div>
        </div>
        <TopItemsChart data={top.data} loading={top.loading} />
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => [summary, overview, chart, heatmap, rfm, top].forEach((r) => void r.reload())}>
            ↻ Refresh all
          </Button>
        </div>
      </div>
    </>
  )
}
