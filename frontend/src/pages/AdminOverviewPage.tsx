import { RecentOrdersFeed } from '../components/admin/RecentOrdersFeed'
import { HourlyHeatmap } from '../components/charts/HourlyHeatmap'
import { RevenueTrendChart } from '../components/charts/RevenueTrendChart'
import { RFMMatrix } from '../components/charts/RFMMatrix'
import { TopItemsChart } from '../components/charts/TopItemsChart'
import { PageHeader } from '../components/layout/AppLayout'
import { Button, ErrorBanner, Panel, Scene, StatsCard } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { adminDashboardApi, analyticsApi } from '../services/endpoints'
import { count, isoDaysAgo, money } from '../utils/format'

export function AdminOverviewPage() {

  const summary = useApi(() => adminDashboardApi.summary(), [], 30_000)
  const overview = useApi(() => analyticsApi.overview(isoDaysAgo(29)), [])
  const chart = useApi(() => adminDashboardApi.revenueChart(30, 12), [])
  const heatmap = useApi(() => analyticsApi.heatmap(isoDaysAgo(89)), [])
  const rfm = useApi(() => analyticsApi.rfmMatrix(), [])
  const top = useApi(() => adminDashboardApi.topPerforming(30), [])
  const s = summary.data
  const o = overview.data
  const errors = [summary, overview, chart, heatmap, rfm, top].map((r) => r.error).filter(Boolean)

  const daily = chart.data?.Daily ?? []
  const revenueSpark = daily.slice(-10).map((d) => d.Revenue)
  const revenueTrendPct =
    daily.length >= 2 && daily[daily.length - 2].Revenue > 0
      ? ((daily[daily.length - 1].Revenue - daily[daily.length - 2].Revenue) / daily[daily.length - 2].Revenue) * 100
      : undefined

  let revenueStreak = 0
  for (let i = daily.length - 1; i > 0; i--) {
    if (daily[i].Revenue > daily[i - 1].Revenue) revenueStreak++
    else break
  }

  const bestSeller = top.data?.TopItems?.[0]
  const busiest = heatmap.data?.BusiestSlot

  return (
    <>
      <PageHeader title="Executive Overview" subtitle="Live restaurant KPIs and demand patterns" />
      <Scene>
        {errors.length > 0 && <ErrorBanner message={errors[0] as string} onRetry={() => void summary.reload()} />}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatsCard
            index={0}
            label="Revenue today"
            icon="₨"
            loading={!s}
            value={s && money(s.SalesToday)}
            hint={s && `${count(s.CompletedOrdersToday)} completed · ${s.BusinessDate}`}
            sparkline={revenueSpark.length > 1 ? revenueSpark : undefined}
            trend={revenueTrendPct}
          />
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

        <Panel delay={0.1}>
          <RevenueTrendChart data={chart.data} loading={chart.loading} />
          {(busiest || bestSeller || revenueStreak > 1) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {busiest && (
                <span className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  🔥 Peak: <b className="text-ink dark:text-white">{busiest.DayName}</b> at <b className="text-ink dark:text-white">{String(busiest.Hour).padStart(2, '0')}:00</b> ({count(busiest.Orders)}{' '}
                  orders)
                </span>
              )}
              {bestSeller && (
                <span className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  ⭐ Best seller: <b className="text-ink dark:text-white">{bestSeller.MenuItemName}</b>
                </span>
              )}
              {revenueStreak > 1 && (
                <span className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  📈 Revenue up <b className="text-ink dark:text-white">{revenueStreak}</b> days straight
                </span>
              )}
            </div>
          )}
        </Panel>

        <div className="grid gap-6 xl:grid-cols-5">
          <Panel delay={0.15} className="xl:col-span-3">
            <HourlyHeatmap data={heatmap.data} loading={heatmap.loading} />
          </Panel>
          <Panel delay={0.2} className="xl:col-span-2">
            <RecentOrdersFeed />
          </Panel>
        </div>

        <div className="grid gap-6 xl:grid-cols-5">
          <Panel delay={0.25} className="xl:col-span-2">
            <RFMMatrix data={rfm.data} loading={rfm.loading} />
          </Panel>
          <Panel delay={0.3} className="xl:col-span-3">
            <TopItemsChart data={top.data} loading={top.loading} />
          </Panel>
        </div>

        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => [summary, overview, chart, heatmap, rfm, top].forEach((r) => void r.reload())}>
            ↻ Refresh all
          </Button>
        </div>
      </Scene>
    </>
  )
}
