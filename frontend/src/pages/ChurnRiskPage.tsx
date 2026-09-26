import { PageHeader } from '../components/layout/AppLayout'
import { Badge, ErrorBanner, ShimmerSkeleton } from '../components/ui'
import { ExportButtons } from '../components/common/ExportButtons'
import { useApi } from '../hooks/useApi'
import { mlAnalyticsApi } from '../services/endpoints'
import type { ChurnRiskCustomer } from '../types/api'

export function ChurnRiskPage() {
  const churn = useApi(() => mlAnalyticsApi.churnRisk(100), [])

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
        <p className="mb-4 text-sm text-slate-500">{churn.data.ScoredCustomers.toLocaleString()} customers scored — showing top 100 by risk</p>
      )}
      {churn.error && <ErrorBanner message={churn.error} onRetry={churn.reload} />}
      {churn.loading && !churn.data && <ShimmerSkeleton className="h-64" rounded="rounded-2xl" />}
      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">Probability</th>
              <th className="px-4 py-3">Recency</th>
              <th className="px-4 py-3">Frequency</th>
              <th className="px-4 py-3">Monetary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {churn.data?.Customers.map((c) => (
              <tr key={c.CustomerId}>
                <td className="px-4 py-2.5 font-medium text-ink">{c.Name}</td>
                <td className="px-4 py-2.5">
                  <Badge tone={c.RiskLabel === 'At Risk' ? 'red' : 'green'}>{c.RiskLabel}</Badge>
                </td>
                <td className="px-4 py-2.5">{(c.ChurnProbability * 100).toFixed(1)}%</td>
                <td className="px-4 py-2.5">{c.RecencyDays}d</td>
                <td className="px-4 py-2.5">{c.Frequency}</td>
                <td className="px-4 py-2.5">{c.Monetary.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
