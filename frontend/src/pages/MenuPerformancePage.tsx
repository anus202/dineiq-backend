import { useMemo, useRef, useState } from 'react'
import { useBranch } from '../context/BranchContext'
import { PageHeader } from '../components/layout/AppLayout'
import { ErrorBoundary } from '../components/common/ErrorBoundary'
import { ExportButtons } from '../components/common/ExportButtons'
import { Badge, Button, DataTable, ErrorBanner, type Column, type BadgeTone } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { branchAnalyticsApi } from '../services/endpoints'
import type { MenuQuadrant, MenuQuadrantItem } from '../types/api'
import { money } from '../utils/format'

const QUADRANT_TONE: Record<MenuQuadrant, BadgeTone> = {
  'Profit Driver': 'green',
  'Volume Driver': 'blue',
  'Hidden Opportunity': 'purple',
  'Low Performer': 'red',
}

const QUADRANTS: (MenuQuadrant | 'All')[] = ['All', 'Profit Driver', 'Volume Driver', 'Hidden Opportunity', 'Low Performer']

function MenuPerformanceContent() {
  const { selectedBranchId } = useBranch()
  // Set to true for exactly one in-flight call (the Refresh button), then reset -- the
  // backend cache TTL is 20 minutes, so every other visit is served instantly from cache.
  const forceRefreshRef = useRef(false)
  const quadrants = useApi(
    () => branchAnalyticsApi.menuQuadrants({ branch_id: selectedBranchId, refresh: forceRefreshRef.current }),
    [selectedBranchId],
  )
  const [filter, setFilter] = useState<(typeof QUADRANTS)[number]>('All')

  const handleRefresh = () => {
    forceRefreshRef.current = true
    void quadrants.reload().finally(() => {
      forceRefreshRef.current = false
    })
  }

  // Recomputed only when the underlying data or the filter actually changes, not on every
  // render (e.g. while the sync indicator is pulsing during a background revalidation).
  const rows = useMemo(
    () => (quadrants.data?.Items ?? []).filter((i) => filter === 'All' || i.Quadrant === filter),
    [quadrants.data, filter],
  )

  const columns: Column<MenuQuadrantItem>[] = [
    { key: 'name', header: 'Item', render: (i) => <span className="font-medium text-ink dark:text-white">{i.MenuItemName}</span> },
    { key: 'category', header: 'Category', render: (i) => i.CategoryName },
    { key: 'qty', header: 'Qty Sold', align: 'right', render: (i) => i.QuantitySold, sortValue: (i) => i.QuantitySold },
    { key: 'revenue', header: 'Revenue', align: 'right', render: (i) => money(i.Revenue), sortValue: (i) => i.Revenue },
    { key: 'margin', header: 'Margin %', align: 'right', render: (i) => `${i.MarginPercentage}%`, sortValue: (i) => i.MarginPercentage },
    { key: 'quadrant', header: 'Quadrant', render: (i) => <Badge tone={QUADRANT_TONE[i.Quadrant]}>{i.Quadrant}</Badge> },
  ]

  return (
    <>
      <PageHeader
        title="Menu Performance"
        subtitle="Profit Driver / Volume Driver / Hidden Opportunity / Low Performer, by quantity and margin"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={handleRefresh} disabled={quadrants.loading || quadrants.revalidating}>
              {quadrants.revalidating ? 'Refreshing…' : 'Refresh analysis'}
            </Button>
            <ExportButtons
              filename="menu_performance"
              data={rows}
              columns={[
                { header: 'Item', accessor: (i) => i.MenuItemName },
                { header: 'Category', accessor: (i) => i.CategoryName },
                { header: 'Qty Sold', accessor: (i) => i.QuantitySold },
                { header: 'Revenue', accessor: (i) => i.Revenue },
                { header: 'Margin %', accessor: (i) => i.MarginPercentage },
                { header: 'Quadrant', accessor: (i) => i.Quadrant },
              ]}
            />
          </div>
        }
      />
      {quadrants.error && <ErrorBanner message={quadrants.error} onRetry={quadrants.reload} />}
      {quadrants.data && (
        <p className="mb-4 text-sm text-slate-500">
          Median quantity: <b>{quadrants.data.MedianQuantity}</b> · Median margin: <b>{quadrants.data.MedianMarginPercentage}%</b> — items at or above both are Profit Drivers.
        </p>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(i) => i.MenuItemId}
        loading={quadrants.loading && !quadrants.data}
        searchText={(i) => `${i.MenuItemName} ${i.CategoryName}`}
        searchPlaceholder="Search menu items…"
        pageSize={20}
        toolbar={
          <select className="field-input w-auto" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter by quadrant">
            {QUADRANTS.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        }
        emptyTitle="No sales data yet"
      />
    </>
  )
}

export function MenuPerformancePage() {
  return (
    <ErrorBoundary title="Menu performance couldn't be displayed">
      <MenuPerformanceContent />
    </ErrorBoundary>
  )
}
