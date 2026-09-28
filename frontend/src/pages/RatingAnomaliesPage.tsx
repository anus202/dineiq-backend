import { PageHeader } from '../components/layout/AppLayout'
import { Badge, DataTable, ErrorBanner, type Column } from '../components/ui'
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

const columns: Column<RatingAnomalyItem>[] = [
  { key: 'item', header: 'Menu Item', render: (a) => <span className="font-medium text-ink dark:text-white">{a.menu_item_name}</span>, sortValue: (a) => a.menu_item_name },
  { key: 'date', header: 'Date', render: (a) => a.date, sortValue: (a) => a.date },
  { key: 'type', header: 'Type', render: (a) => <Badge tone={anomalyTone(a.anomaly_type)}>{a.anomaly_type.replace('_', ' ')}</Badge>, sortValue: (a) => a.anomaly_type },
  { key: 'count', header: 'Ratings', align: 'right', render: (a) => a.rating_count, sortValue: (a) => a.rating_count },
  { key: 'avg', header: 'Avg Score', align: 'right', render: (a) => a.average_score, sortValue: (a) => a.average_score },
  { key: 'trailing', header: 'Trailing Avg', align: 'right', render: (a) => a.trailing_average_score, sortValue: (a) => a.trailing_average_score },
  { key: 'reason', header: 'Reason', render: (a) => <span className="text-slate-500">{a.reason}</span> },
]

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
      <DataTable
        columns={columns}
        rows={anomalies.data ?? []}
        rowKey={(a) => `${a.menu_item_id}-${a.date}-${a.anomaly_type}`}
        loading={anomalies.loading && !anomalies.data}
        searchText={(a) => `${a.menu_item_name} ${a.anomaly_type}`}
        searchPlaceholder="Search anomalies…"
        pageSize={20}
        emptyTitle="No unusual rating patterns detected"
        emptyMessage="Nothing in the lookback window stood out from each item's own trailing average."
      />
    </>
  )
}
