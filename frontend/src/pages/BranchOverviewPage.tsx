import { useBranch } from '../context/BranchContext'
import { PageHeader } from '../components/layout/AppLayout'
import { ErrorBanner, StatsCard } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { branchAnalyticsApi } from '../services/endpoints'
import { count, money } from '../utils/format'

export function BranchOverviewPage() {
  const { selectedBranchId, canSelectBranch } = useBranch()
  const overview = useApi(() => branchAnalyticsApi.overview({ branch_id: selectedBranchId }), [selectedBranchId])
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
    </>
  )
}
