import { PageHeader } from '../components/layout/AppLayout'
import { Badge, DataTable, ErrorBanner, type Column } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { branchAnalyticsApi } from '../services/endpoints'
import type { BranchComparisonRow } from '../types/api'
import { count, money } from '../utils/format'

export function BranchComparisonPage() {
  const comparison = useApi(() => branchAnalyticsApi.branchComparison(), [])

  const columns: Column<BranchComparisonRow>[] = [
    { key: 'name', header: 'Branch', render: (b) => <span className="font-medium text-ink">{b.BranchName}</span>, sortValue: (b) => b.BranchName },
    { key: 'city', header: 'City', render: (b) => b.City },
    { key: 'status', header: 'Status', render: (b) => <Badge tone={b.IsActive ? 'green' : 'red'}>{b.IsActive ? 'Active' : 'Inactive'}</Badge> },
    { key: 'orders', header: 'Orders', align: 'right', render: (b) => count(b.OrderCount), sortValue: (b) => b.OrderCount },
    { key: 'revenue', header: 'Revenue', align: 'right', render: (b) => money(b.Revenue), sortValue: (b) => b.Revenue },
    { key: 'profit', header: 'Profit', align: 'right', render: (b) => money(b.Profit), sortValue: (b) => b.Profit },
    { key: 'margin', header: 'Margin %', align: 'right', render: (b) => `${b.ProfitMarginPercentage}%`, sortValue: (b) => b.ProfitMarginPercentage },
    { key: 'wastage', header: 'Wastage Cost', align: 'right', render: (b) => money(b.WastageCost), sortValue: (b) => b.WastageCost },
    { key: 'rating', header: 'Avg Rating', align: 'right', render: (b) => (b.AverageRating != null ? `${b.AverageRating.toFixed(2)} ★` : '—') },
    { key: 'customers', header: 'Customers', align: 'right', render: (b) => count(b.CustomerCount), sortValue: (b) => b.CustomerCount },
  ]

  return (
    <>
      <PageHeader title="Multi-Branch Comparison" subtitle="Cross-location performance across every branch, in real time" />
      {comparison.error && <ErrorBanner message={comparison.error} onRetry={comparison.reload} />}
      <DataTable
        columns={columns}
        rows={comparison.data?.Branches ?? []}
        rowKey={(b) => b.BranchId}
        loading={comparison.loading && !comparison.data}
        searchText={(b) => `${b.BranchName} ${b.City}`}
        searchPlaceholder="Search branches…"
        pageSize={15}
        emptyTitle="No branches yet"
      />
    </>
  )
}
