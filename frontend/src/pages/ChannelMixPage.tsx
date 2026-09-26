import { useBranch } from '../context/BranchContext'
import { PageHeader } from '../components/layout/AppLayout'
import { EmptyState, ErrorBanner, ShimmerSkeleton } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { branchAnalyticsApi } from '../services/endpoints'
import { count, money } from '../utils/format'

export function ChannelMixPage() {
  const { selectedBranchId } = useBranch()
  const mix = useApi(() => branchAnalyticsApi.channelMix({ branch_id: selectedBranchId }), [selectedBranchId])

  return (
    <>
      <PageHeader title="Channel Mix" subtitle="Orders and revenue split by Dine-in / Takeaway / Delivery" />
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
    </>
  )
}
