import { useBranch } from '../context/BranchContext'
import { PageHeader } from '../components/layout/AppLayout'
import { ExportButtons } from '../components/common/ExportButtons'
import { DataTable, ErrorBanner, StatsCard, type Column } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { branchAnalyticsApi } from '../services/endpoints'
import type { WastageByItem, WastageByReason } from '../types/api'
import { money, quantity } from '../utils/format'

export function WastageAnalyticsPage() {
  const { selectedBranchId } = useBranch()
  const wastage = useApi(() => branchAnalyticsApi.wastage({ branch_id: selectedBranchId }), [selectedBranchId])
  const w = wastage.data

  const itemColumns: Column<WastageByItem>[] = [
    { key: 'item', header: 'Ingredient', render: (i) => <span className="font-medium text-ink">{i.ItemName}</span> },
    { key: 'wasted', header: 'Wasted', align: 'right', render: (i) => quantity(i.TotalWasted, i.Unit) },
    { key: 'cost', header: 'Cost', align: 'right', render: (i) => money(i.WastageCost), sortValue: (i) => i.WastageCost },
    { key: 'incidents', header: 'Incidents', align: 'right', render: (i) => i.IncidentCount },
  ]
  const reasonColumns: Column<WastageByReason>[] = [
    { key: 'reason', header: 'Reason', render: (r) => r.Reason },
    { key: 'wasted', header: 'Wasted', align: 'right', render: (r) => r.TotalWasted },
    { key: 'cost', header: 'Cost', align: 'right', render: (r) => money(r.WastageCost), sortValue: (r) => r.WastageCost },
    { key: 'incidents', header: 'Incidents', align: 'right', render: (r) => r.IncidentCount },
  ]

  return (
    <>
      <PageHeader
        title="Wastage Analytics"
        subtitle="Tracked at the ingredient level (manual stock deductions) — this system doesn't yet attribute wastage to individual dishes"
        actions={
          <ExportButtons
            filename="wastage_by_item"
            data={w?.ByItem}
            columns={[
              { header: 'Ingredient', accessor: (i) => i.ItemName },
              { header: 'Wasted', accessor: (i) => i.TotalWasted },
              { header: 'Unit', accessor: (i) => i.Unit },
              { header: 'Cost', accessor: (i) => i.WastageCost },
              { header: 'Incidents', accessor: (i) => i.IncidentCount },
            ]}
          />
        }
      />
      {wastage.error && <ErrorBanner message={wastage.error} onRetry={wastage.reload} />}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatsCard index={0} label="Total wastage cost" icon="₨" tone="rose" loading={!w} value={w && money(w.TotalWastageCost)} />
        <StatsCard index={1} label="Ingredients affected" icon="🗑" loading={!w} value={w && w.ByItem.length} />
        <StatsCard index={2} label="Distinct reasons logged" icon="📋" tone="amber" loading={!w} value={w && w.ByReason.length} />
      </div>
      <h2 className="mb-3 text-lg font-semibold text-ink">By ingredient</h2>
      <div className="mb-8">
        <DataTable columns={itemColumns} rows={w?.ByItem ?? []} rowKey={(i) => i.InventoryItemId} loading={wastage.loading && !w} emptyTitle="No wastage recorded for this branch" />
      </div>
      <h2 className="mb-3 text-lg font-semibold text-ink">By reason</h2>
      <DataTable columns={reasonColumns} rows={w?.ByReason ?? []} rowKey={(r) => r.Reason} loading={wastage.loading && !w} emptyTitle="No wastage recorded for this branch" />
    </>
  )
}
