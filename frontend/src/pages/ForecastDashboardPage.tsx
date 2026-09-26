import { PageHeader } from '../components/layout/AppLayout'
import { Badge, ErrorBanner, ShimmerSkeleton } from '../components/ui'
import { ExportButtons } from '../components/common/ExportButtons'
import { useApi } from '../hooks/useApi'
import { mlAnalyticsApi } from '../services/endpoints'
import type { DemandForecastItem, WastageRiskItem } from '../types/api'

function riskTone(label: string) {
  if (label === 'Critical') return 'red' as const
  if (label === 'High') return 'yellow' as const
  if (label === 'Moderate') return 'blue' as const
  return 'green' as const
}

export function ForecastDashboardPage() {
  const demand = useApi(() => mlAnalyticsApi.demandForecastMl(50), [])
  const wastage = useApi(() => mlAnalyticsApi.wastageRisk(50), [])

  return (
    <>
      <PageHeader
        title="Forecast & Wastage-Risk Dashboard"
        subtitle="Live predictions from the trained demand-forecast and wastage-risk regressors — historical vs. projected, not a simple statistical average"
      />

      <h2 className="mb-3 text-lg font-semibold text-ink">Next-month demand forecast (top movers)</h2>
      <div className="mb-4 flex justify-end">
        <ExportButtons<DemandForecastItem>
          filename="demand_forecast"
          data={demand.data}
          columns={[
            { header: 'Menu Item', accessor: (d) => d.MenuItemName },
            { header: 'This Month Qty', accessor: (d) => d.CurrentMonthQuantity },
            { header: 'Predicted Next Month Qty', accessor: (d) => d.PredictedNextMonthQuantity },
          ]}
        />
      </div>
      {demand.error && <ErrorBanner message={demand.error} onRetry={demand.reload} />}
      {demand.loading && !demand.data && <ShimmerSkeleton className="h-48" rounded="rounded-2xl" />}
      <div className="card mb-8 overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
              <th className="px-4 py-3">Menu Item</th>
              <th className="px-4 py-3">This Month</th>
              <th className="px-4 py-3">Predicted Next Month</th>
              <th className="px-4 py-3">Trend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {demand.data?.map((d) => (
              <tr key={d.MenuItemId}>
                <td className="px-4 py-2.5 font-medium text-ink">{d.MenuItemName}</td>
                <td className="px-4 py-2.5">{d.CurrentMonthQuantity.toLocaleString()}</td>
                <td className="px-4 py-2.5">{d.PredictedNextMonthQuantity.toLocaleString()}</td>
                <td className="px-4 py-2.5">
                  <Badge tone={d.PredictedNextMonthQuantity >= d.CurrentMonthQuantity ? 'green' : 'red'}>
                    {d.PredictedNextMonthQuantity >= d.CurrentMonthQuantity ? '↑ Up' : '↓ Down'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-lg font-semibold text-ink">Predicted wastage risk</h2>
      <div className="mb-4 flex justify-end">
        <ExportButtons<WastageRiskItem>
          filename="wastage_risk"
          data={wastage.data}
          columns={[
            { header: 'Menu Item', accessor: (w) => w.MenuItemName },
            { header: 'Predicted Wastage %', accessor: (w) => w.PredictedWastagePercent },
            { header: 'Risk Level', accessor: (w) => w.RiskLabel },
            { header: 'Total Qty Sold', accessor: (w) => w.TotalQuantitySold },
            { header: 'Avg Rating', accessor: (w) => w.AvgRating },
          ]}
        />
      </div>
      {wastage.error && <ErrorBanner message={wastage.error} onRetry={wastage.reload} />}
      {wastage.loading && !wastage.data && <ShimmerSkeleton className="h-48" rounded="rounded-2xl" />}
      <div className="space-y-3">
        {wastage.data?.map((w) => (
          <div key={w.MenuItemId} className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-ink">{w.MenuItemName}</p>
              <Badge tone={riskTone(w.RiskLabel)}>{w.RiskLabel} — {w.PredictedWastagePercent}%</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {w.TotalQuantitySold.toLocaleString()} sold historically · {w.AvgRating.toFixed(1)}★ average rating
            </p>
          </div>
        ))}
      </div>
    </>
  )
}
