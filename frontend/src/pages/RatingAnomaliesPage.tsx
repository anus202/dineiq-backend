import { PageHeader } from '../components/layout/AppLayout'
import { Badge, ErrorBanner, ShimmerSkeleton } from '../components/ui'
import { ExportButtons } from '../components/common/ExportButtons'
import { useApi } from '../hooks/useApi'
import { mlAnalyticsApi } from '../services/endpoints'
import type { RatingAnomalyItem } from '../types/api'

function anomalyTone(type: string) {
  if (type === 'RATING_DROP') return 'red' as const
  if (type === 'RATING_SPIKE') return 'green' as const
  if (type === 'IDENTICAL_CLUSTER') return 'yellow' as const
  return 'blue' as const
}

export function RatingAnomaliesPage() {
  const anomalies = useApi(() => mlAnalyticsApi.ratingAnomalies(), [])

  return (
    <>
      <PageHeader
        title="Rating Anomaly Detection"
        subtitle="Sudden rating spikes/drops, unusual review volume, and suspiciously identical-score clusters"
        actions={
          <ExportButtons<RatingAnomalyItem>
            filename="rating_anomalies"
            data={anomalies.data}
            columns={[
              { header: 'Menu Item', accessor: (r) => r.menu_item_name },
              { header: 'Date', accessor: (r) => r.date },
              { header: 'Type', accessor: (r) => r.anomaly_type },
              { header: 'Rating Count', accessor: (r) => r.rating_count },
              { header: 'Average Score', accessor: (r) => r.average_score },
              { header: 'Trailing Average', accessor: (r) => r.trailing_average_score },
              { header: 'Reason', accessor: (r) => r.reason },
            ]}
          />
        }
      />
      {anomalies.error && <ErrorBanner message={anomalies.error} onRetry={anomalies.reload} />}
      {anomalies.loading && !anomalies.data && <ShimmerSkeleton className="h-64" rounded="rounded-2xl" />}
      {anomalies.data?.length === 0 && <p className="text-sm text-slate-500">No unusual rating patterns detected in the lookback window.</p>}
      <div className="space-y-3">
        {anomalies.data?.map((a, idx) => (
          <div key={idx} className="card p-4">
            <div className="mb-1 flex items-center justify-between gap-3">
              <p className="font-medium text-ink">
                {a.menu_item_name} — {a.date}
              </p>
              <Badge tone={anomalyTone(a.anomaly_type)}>{a.anomaly_type.replace('_', ' ')}</Badge>
            </div>
            <p className="text-sm text-slate-500">{a.reason}</p>
          </div>
        ))}
      </div>
    </>
  )
}
