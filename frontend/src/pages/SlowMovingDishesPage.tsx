import { PageHeader } from '../components/layout/AppLayout'
import { Badge, DataTable, ErrorBanner, type Column } from '../components/ui'
import { ExportButtons } from '../components/common/ExportButtons'
import { useApi } from '../hooks/useApi'
import { mlAnalyticsApi } from '../services/endpoints'
import type { SlowMovingDish } from '../types/api'

const columns: Column<SlowMovingDish>[] = [
  { key: 'item', header: 'Menu Item', render: (d) => <span className="font-medium text-ink">{d.menu_item_name}</span>, sortValue: (d) => d.menu_item_name },
  {
    key: 'signals',
    header: 'Signals',
    render: (d) => <Badge tone={d.signal_count >= 4 ? 'red' : d.signal_count >= 3 ? 'yellow' : 'gray'}>{d.signal_count} signals</Badge>,
    sortValue: (d) => d.signal_count,
  },
  { key: 'qty', header: 'Total Qty Sold', align: 'right', render: (d) => d.total_quantity_sold, sortValue: (d) => d.total_quantity_sold },
  { key: 'orders', header: 'Orders', align: 'right', render: (d) => d.order_count, sortValue: (d) => d.order_count },
  { key: 'recency', header: 'Last Sold', align: 'right', render: (d) => `${d.recency_days}d ago`, sortValue: (d) => d.recency_days },
  { key: 'margin', header: 'Margin %', align: 'right', render: (d) => `${d.margin_percent}%`, sortValue: (d) => d.margin_percent },
  { key: 'detail', header: 'Detail', render: (d) => <span className="text-xs text-slate-500">{d.signals.join(' · ')}</span> },
]

export function SlowMovingDishesPage() {
  const dishes = useApi(() => mlAnalyticsApi.slowMovingDishes(), [])

  return (
    <>
      <PageHeader
        title="Slow-Moving Dish Detection"
        subtitle="Items flagged by a combination of low volume, low order frequency, a long gap since last purchase, weak margin and a declining trend"
        actions={
          <ExportButtons<SlowMovingDish>
            filename="slow_moving_dishes"
            data={dishes.data}
            columns={[
              { header: 'Menu Item', accessor: (d) => d.menu_item_name },
              { header: 'Total Qty Sold', accessor: (d) => d.total_quantity_sold },
              { header: 'Order Count', accessor: (d) => d.order_count },
              { header: 'Recency (days)', accessor: (d) => d.recency_days },
              { header: 'Margin %', accessor: (d) => d.margin_percent },
              { header: 'Signal Count', accessor: (d) => d.signal_count },
              { header: 'Signals', accessor: (d) => d.signals.join('; ') },
            ]}
          />
        }
      />
      {dishes.error && <ErrorBanner message={dishes.error} onRetry={dishes.reload} />}
      <DataTable
        columns={columns}
        rows={dishes.data ?? []}
        rowKey={(d) => d.menu_item_id}
        loading={dishes.loading && !dishes.data}
        searchText={(d) => d.menu_item_name}
        searchPlaceholder="Search menu items…"
        pageSize={20}
        emptyTitle="No items currently flagged as slow-moving"
        emptyMessage="Sales volume, frequency and margin are fairly even across the current menu."
      />
    </>
  )
}
