import { PageHeader } from '../components/layout/AppLayout'
import { Badge, ErrorBanner, ShimmerSkeleton } from '../components/ui'
import { ExportButtons } from '../components/common/ExportButtons'
import { useApi } from '../hooks/useApi'
import { mlAnalyticsApi } from '../services/endpoints'
import type { PriceSensitivityItem } from '../types/api'

export function PriceSensitivityPage() {
  const items = useApi(() => mlAnalyticsApi.priceSensitivity(), [])

  return (
    <>
      <PageHeader
        title="Price Sensitivity"
        subtitle="Per-item demand elasticity, classified from historical price/quantity correlation"
        actions={
          <ExportButtons<PriceSensitivityItem>
            filename="price_sensitivity"
            data={items.data}
            columns={[
              { header: 'Menu Item', accessor: (r) => r.menu_item_name },
              { header: 'Correlation', accessor: (r) => r.price_quantity_correlation ?? '' },
              { header: 'Elasticity', accessor: (r) => r.elasticity_label },
              { header: 'Interpretation', accessor: (r) => r.interpretation },
            ]}
          />
        }
      />
      {items.error && <ErrorBanner message={items.error} onRetry={items.reload} />}
      {items.loading && !items.data && <ShimmerSkeleton className="h-64" rounded="rounded-2xl" />}
      <div className="space-y-3">
        {items.data?.map((r) => (
          <div key={r.menu_item_id} className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-ink">{r.menu_item_name}</p>
              <Badge tone={r.elasticity_label.includes('Elastic') ? 'yellow' : r.elasticity_label.includes('Inelastic') ? 'green' : 'gray'}>
                {r.elasticity_label}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">{r.interpretation}</p>
          </div>
        ))}
      </div>
    </>
  )
}
