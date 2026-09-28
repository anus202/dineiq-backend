import { PageHeader } from '../components/layout/AppLayout'
import { ExportButtons } from '../components/common/ExportButtons'
import { Badge, DataTable, ErrorBanner, type Column } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { branchAnalyticsApi } from '../services/endpoints'
import type { SalesAnomaly } from '../types/api'
import { dateOnly, money } from '../utils/format'

export function AnomalyDetectionPage() {
  const anomalies = useApi(() => branchAnalyticsApi.anomalies(), [])

  const columns: Column<SalesAnomaly>[] = [
    { key: 'branch', header: 'Branch', render: (a) => <span className="font-medium text-ink dark:text-white">{a.BranchName}</span> },
    { key: 'date', header: 'Date', render: (a) => dateOnly(a.Date), sortValue: (a) => a.Date },
    { key: 'type', header: 'Type', render: (a) => <Badge tone={a.Type === 'SPIKE' ? 'blue' : 'red'}>{a.Type}</Badge> },
    { key: 'severity', header: 'Severity', render: (a) => <Badge tone={a.Severity === 'CRITICAL' ? 'red' : a.Severity === 'HIGH' ? 'yellow' : 'gray'}>{a.Severity}</Badge> },
    { key: 'revenue', header: 'Revenue', align: 'right', render: (a) => money(a.Revenue) },
    { key: 'trailing', header: '7-Day Average', align: 'right', render: (a) => money(a.TrailingAverageRevenue) },
    { key: 'deviation', header: 'Deviation', align: 'right', render: (a) => `${a.DeviationPercentage > 0 ? '+' : ''}${a.DeviationPercentage}%`, sortValue: (a) => Math.abs(a.DeviationPercentage) },
  ]

  return (
    <>
      <PageHeader
        title="Anomaly & Fraud Detection"
        subtitle="Branch-days whose revenue deviates 50%+ from their own trailing 7-day average — simple, explainable statistics on real order data"
        actions={
          <ExportButtons
            filename="sales_anomalies"
            data={anomalies.data?.SalesAnomalies}
            columns={[
              { header: 'Branch', accessor: (a) => a.BranchName },
              { header: 'Date', accessor: (a) => a.Date },
              { header: 'Type', accessor: (a) => a.Type },
              { header: 'Severity', accessor: (a) => a.Severity },
              { header: 'Revenue', accessor: (a) => a.Revenue },
              { header: '7-Day Average', accessor: (a) => a.TrailingAverageRevenue },
              { header: 'Deviation %', accessor: (a) => a.DeviationPercentage },
            ]}
          />
        }
      />
      {anomalies.error && <ErrorBanner message={anomalies.error} onRetry={anomalies.reload} />}
      <DataTable
        columns={columns}
        rows={anomalies.data?.SalesAnomalies ?? []}
        rowKey={(a) => `${a.BranchId}-${a.Date}`}
        loading={anomalies.loading && !anomalies.data}
        pageSize={20}
        emptyTitle="No anomalies detected"
        emptyMessage="No branch-day has deviated more than 50% from its own trailing average recently."
      />
    </>
  )
}
