import { PageHeader } from '../components/layout/AppLayout'
import { Badge, DataTable, ErrorBanner, type Column } from '../components/ui'
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

const demandColumns: Column<DemandForecastItem>[] = [
  { key: 'name', header: 'Menu Item', render: (d) => <span className="font-medium text-ink dark:text-white">{d.MenuItemName}</span>, sortValue: (d) => d.MenuItemName },
  { key: 'current', header: 'This Month', align: 'right', render: (d) => d.CurrentMonthQuantity.toLocaleString(), sortValue: (d) => d.CurrentMonthQuantity },
  { key: 'predicted', header: 'Predicted Next Month', align: 'right', render: (d) => d.PredictedNextMonthQuantity.toLocaleString(), sortValue: (d) => d.PredictedNextMonthQuantity },
  {
    key: 'trend',
    header: 'Trend',
    render: (d) => (
      <Badge tone={d.PredictedNextMonthQuantity >= d.CurrentMonthQuantity ? 'green' : 'red'}>
        {d.PredictedNextMonthQuantity >= d.CurrentMonthQuantity ? '↑ Up' : '↓ Down'}
      </Badge>
    ),
  },
]

const wastageColumns: Column<WastageRiskItem>[] = [
  { key: 'name', header: 'Menu Item', render: (w) => <span className="font-medium text-ink dark:text-white">{w.MenuItemName}</span>, sortValue: (w) => w.MenuItemName },
  {
    key: 'risk',
    header: 'Risk Level',
    render: (w) => <Badge tone={riskTone(w.RiskLabel)}>{w.RiskLabel} — {w.PredictedWastagePercent}%</Badge>,
    sortValue: (w) => w.PredictedWastagePercent,
  },
  { key: 'qty', header: 'Total Qty Sold', align: 'right', render: (w) => w.TotalQuantitySold.toLocaleString(), sortValue: (w) => w.TotalQuantitySold },
  { key: 'rating', header: 'Avg Rating', align: 'right', render: (w) => `${w.AvgRating.toFixed(1)}★`, sortValue: (w) => w.AvgRating },
]

export function ForecastDashboardPage() {
  // Fetches up to 200 (up from 50) — safe now that each table paginates client-side.
  const demand = useApi(() => mlAnalyticsApi.demandForecastMl(200), [])
  const wastage = useApi(() => mlAnalyticsApi.wastageRisk(200), [])

  return (
    <>
      <PageHeader
        title="Forecast & Wastage-Risk Dashboard"
        subtitle="Live predictions from the trained demand-forecast and wastage-risk regressors — historical vs. projected, not a simple statistical average"
      />

      <h2 className="mb-3 text-lg font-semibold text-ink dark:text-white">Next-month demand forecast</h2>
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
      <DataTable
        columns={demandColumns}
        rows={demand.data ?? []}
        rowKey={(d) => d.MenuItemId}
        loading={demand.loading && !demand.data}
        searchText={(d) => d.MenuItemName}
        searchPlaceholder="Search menu items…"
        pageSize={15}
        emptyTitle="No forecast data yet"
      />

      <h2 className="mt-8 mb-3 text-lg font-semibold text-ink dark:text-white">Predicted wastage risk</h2>
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
      <DataTable
        columns={wastageColumns}
        rows={wastage.data ?? []}
        rowKey={(w) => w.MenuItemId}
        loading={wastage.loading && !wastage.data}
        searchText={(w) => w.MenuItemName}
        searchPlaceholder="Search menu items…"
        pageSize={15}
        emptyTitle="No wastage-risk data yet"
      />
    </>
  )
}
