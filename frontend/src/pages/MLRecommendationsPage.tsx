import { PageHeader } from '../components/layout/AppLayout'
import { Badge, ErrorBanner, ShimmerSkeleton } from '../components/ui'
import { ExportButtons } from '../components/common/ExportButtons'
import { useApi } from '../hooks/useApi'
import { mlAnalyticsApi } from '../services/endpoints'
import type { MLRecommendation } from '../types/api'

function priorityTone(priority: string) {
  if (priority === 'CRITICAL' || priority === 'HIGH') return 'red' as const
  if (priority === 'MEDIUM') return 'yellow' as const
  return 'blue' as const
}

export function MLRecommendationsPage() {
  const recs = useApi(() => mlAnalyticsApi.recommendations(), [])

  return (
    <>
      <PageHeader
        title="ML Recommendations"
        subtitle="Evidence-backed suggestions combining menu performance, wastage, market-basket and pricing analysis"
        actions={
          <ExportButtons<MLRecommendation>
            filename="ml_recommendations"
            data={recs.data}
            columns={[
              { header: 'Priority', accessor: (r) => r.priority },
              { header: 'Category', accessor: (r) => r.category },
              { header: 'Title', accessor: (r) => r.title },
              { header: 'Menu Item', accessor: (r) => r.menu_item_name ?? '' },
              { header: 'Justification', accessor: (r) => r.justification },
              { header: 'Action', accessor: (r) => r.action },
            ]}
          />
        }
      />
      {recs.error && <ErrorBanner message={recs.error} onRetry={recs.reload} />}
      {recs.loading && !recs.data && <ShimmerSkeleton className="h-64" rounded="rounded-2xl" />}
      {recs.data?.length === 0 && <p className="text-sm text-slate-500">No recommendations yet.</p>}
      <div className="space-y-3">
        {recs.data?.map((r, idx) => (
          <div key={idx} className="card p-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="font-semibold text-ink">{r.title}</p>
              <Badge tone={priorityTone(r.priority)}>{r.priority}</Badge>
            </div>
            <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">{r.category}</p>
            <p className="mt-2 text-sm text-slate-600">{r.justification}</p>
            <p className="mt-2 text-sm font-medium text-brand-700">→ {r.action}</p>
          </div>
        ))}
      </div>
    </>
  )
}
