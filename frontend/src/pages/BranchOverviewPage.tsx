import { useBranch } from '../context/BranchContext'
import { PageHeader } from '../components/layout/AppLayout'
import { EmptyState, ErrorBanner, ShimmerSkeleton, StatsCard } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { branchAnalyticsApi } from '../services/endpoints'
import { count, money } from '../utils/format'

export function BranchOverviewPage() {
  const { selectedBranchId, canSelectBranch } = useBranch()
  const overview = useApi(() => branchAnalyticsApi.overview({ branch_id: selectedBranchId }), [selectedBranchId])
  const mix = useApi(() => branchAnalyticsApi.channelMix({ branch_id: selectedBranchId }), [selectedBranchId])
  const o = overview.data

  return (
    <>
      <PageHeader
        title="Branch Overview"
        subtitle={canSelectBranch && !selectedBranchId ? 'Sales & profitability across all branches' : 'Sales & profitability for the selected branch'}
      />
      {overview.error && <ErrorBanner message={overview.error} onRetry={overview.reload} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard index={0} label="Total orders" icon="🧾" loading={!o} value={o && count(o.TotalOrders)} />
        <StatsCard index={1} label="Revenue" icon="₨" tone="sky" loading={!o} value={o && money(o.TotalRevenue)} />
        <StatsCard index={2} label="Net profit" icon="💰" tone="teal" loading={!o} value={o && money(o.NetProfit)} hint={o && `${o.ProfitMarginPercentage}% margin`} />
        <StatsCard index={3} label="Average order value" icon="∅" tone="amber" loading={!o} value={o && money(o.AverageOrderValue)} />
        <StatsCard index={4} label="Gross sales" icon="Σ" loading={!o} value={o && money(o.GrossSales)} />
        <StatsCard index={5} label="Total guests" icon="👥" tone="violet" loading={!o} value={o && count(o.TotalGuests)} />
        <StatsCard index={6} label="Average spend/guest" icon="₨" tone="slate" loading={!o} value={o && money(o.AverageSpendPerGuest)} />
      </div>

      <div className="mt-8">
        <h2 className="mb-1 text-lg font-semibold text-ink">Channel mix</h2>
        <p className="mb-4 text-sm text-slate-500">Orders and revenue split by Dine-in / Takeaway / Delivery</p>
        {mix.error && <ErrorBanner message={mix.error} onRetry={mix.reload} />}
        {mix.loading && !mix.data && <ShimmerSkeleton className="h-64" rounded="rounded-2xl" />}
        {mix.data && mix.data.Channels.length === 0 && (
          <div className="card">
            <EmptyState title="No orders yet" message="Channel mix appears once orders exist for this branch." icon="🧭" />
          </div>
        )}
        {mix.data && mix.data.Channels.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {mix.data.Channels.map((c) => (
              <div key={c.Channel} className="card p-5">
                <p className="text-sm font-medium text-slate-500">{c.Channel}</p>
                <p className="mt-2 text-2xl font-semibold text-ink">{count(c.OrderCount)} orders</p>
                <p className="mt-1 text-sm text-slate-600">{money(c.Revenue)} revenue</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${c.SharePercentage}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{c.SharePercentage}% of orders</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
