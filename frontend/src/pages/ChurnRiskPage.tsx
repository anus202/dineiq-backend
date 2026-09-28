import { PageHeader } from '../components/layout/AppLayout'
import { Badge, DataTable, ErrorBanner, type Column } from '../components/ui'
import { ExportButtons } from '../components/common/ExportButtons'
import { useApi } from '../hooks/useApi'
import { mlAnalyticsApi } from '../services/endpoints'
import type { ChurnRiskCustomer } from '../types/api'

const columns: Column<ChurnRiskCustomer>[] = [
  { key: 'name', header: 'Customer', render: (c) => <span className="font-medium text-ink dark:text-white">{c.Name}</span>, sortValue: (c) => c.Name },
  { key: 'risk', header: 'Risk', render: (c) => <Badge tone={c.RiskLabel === 'At Risk' ? 'red' : 'green'}>{c.RiskLabel}</Badge>, sortValue: (c) => c.RiskLabel },
  { key: 'prob', header: 'Probability', align: 'right', render: (c) => `${(c.ChurnProbability * 100).toFixed(1)}%`, sortValue: (c) => c.ChurnProbability },
  { key: 'recency', header: 'Recency', align: 'right', render: (c) => `${c.RecencyDays}d`, sortValue: (c) => c.RecencyDays },
  { key: 'frequency', header: 'Frequency', align: 'right', render: (c) => c.Frequency, sortValue: (c) => c.Frequency },
  { key: 'monetary', header: 'Monetary', align: 'right', render: (c) => c.Monetary.toLocaleString(), sortValue: (c) => c.Monetary },
  { key: 'aov', header: 'Avg Order Value', align: 'right', render: (c) => c.AvgOrderValue.toLocaleString(), sortValue: (c) => c.AvgOrderValue },
  { key: 'tenure', header: 'Tenure', align: 'right', render: (c) => `${c.TenureDays}d`, sortValue: (c) => c.TenureDays },
]

export function ChurnRiskPage() {
  // Fetches the top 500 by risk (up from 100) — safe now that DataTable paginates
  // client-side at 20 rows/page instead of rendering every row as a DOM node at once.
  const churn = useApi(() => mlAnalyticsApi.churnRisk(500), [])

  return (
    <>
      <PageHeader
        title="Customer Churn Risk"
        subtitle="Customers scored by the trained XGBoost churn-risk classifier, from live order history"
        actions={
          <ExportButtons<ChurnRiskCustomer>
            filename="churn_risk"
            data={churn.data?.Customers}
            columns={[
              { header: 'Customer', accessor: (r) => r.Name },
              { header: 'Risk', accessor: (r) => r.RiskLabel },
              { header: 'Probability', accessor: (r) => r.ChurnProbability },
              { header: 'Recency (days)', accessor: (r) => r.RecencyDays },
              { header: 'Frequency', accessor: (r) => r.Frequency },
              { header: 'Monetary', accessor: (r) => r.Monetary },
              { header: 'Avg Order Value', accessor: (r) => r.AvgOrderValue },
              { header: 'Tenure (days)', accessor: (r) => r.TenureDays },
            ]}
          />
        }
      />
      {churn.data && (
        <p className="mb-4 text-sm text-slate-500">
          {churn.data.ScoredCustomers.toLocaleString()} customers scored — showing top {churn.data.Customers.length} by risk
        </p>
      )}
      {churn.error && <ErrorBanner message={churn.error} onRetry={churn.reload} />}
      <DataTable
        columns={columns}
        rows={churn.data?.Customers ?? []}
        rowKey={(c) => c.CustomerId}
        loading={churn.loading && !churn.data}
        searchText={(c) => c.Name}
        searchPlaceholder="Search customers…"
        pageSize={20}
        emptyTitle="No customers scored yet"
      />
    </>
  )
}
