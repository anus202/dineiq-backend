import { useBranch } from '../context/BranchContext'
import { PageHeader } from '../components/layout/AppLayout'
import { Badge, ErrorBanner, ShimmerSkeleton } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { branchAnalyticsApi } from '../services/endpoints'

export function BranchRecommendationsPage() {
  const { selectedBranchId } = useBranch()
  const recs = useApi(() => branchAnalyticsApi.recommendations({ branch_id: selectedBranchId }), [selectedBranchId])

  return (
    <>
      <PageHeader title="Business Recommendations" subtitle="Evidence-backed suggestions from real branch menu performance" />
      {recs.error && <ErrorBanner message={recs.error} onRetry={recs.reload} />}
      {recs.loading && !recs.data && <ShimmerSkeleton className="h-64" rounded="rounded-2xl" />}
      {recs.data?.length === 0 && <p className="text-sm text-slate-500">No recommendations yet — not enough sales data for this branch.</p>}
      <div className="space-y-3">
        {recs.data?.map((r, idx) => (
          <div key={idx} className="card p-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="font-semibold text-ink">{r.Title}</p>
              <Badge tone={r.Priority === 'CRITICAL' || r.Priority === 'HIGH' ? 'red' : r.Priority === 'MEDIUM' ? 'yellow' : 'blue'}>{r.Priority}</Badge>
            </div>
            <p className="text-sm text-slate-600">{r.Evidence}</p>
            <p className="mt-2 text-sm font-medium text-brand-700">→ {r.SuggestedAction}</p>
          </div>
        ))}
      </div>
    </>
  )
}
