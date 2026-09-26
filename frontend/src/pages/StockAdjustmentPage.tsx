import { useNavigate, useSearchParams } from 'react-router-dom'
import { StockAdjustmentFormBody } from '../components/inventory/StockAdjustmentFormBody'
import { PageHeader } from '../components/layout/AppLayout'
import { EmptyState, ErrorBanner, ShimmerSkeleton } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { inventoryApi } from '../services/endpoints'

export function StockAdjustmentPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const items = useApi(() => inventoryApi.items({ skip: 0, limit: 200 }), [])
  const preselectItemId = searchParams.get('itemId') ? Number(searchParams.get('itemId')) : null

  return (
    <>
      <PageHeader title="Stock Adjustment" subtitle="Manually add or remove stock — every change is logged with a reason" />
      {items.error && <ErrorBanner message={items.error} onRetry={items.reload} />}
      {items.loading && !items.data && <ShimmerSkeleton className="h-96 max-w-2xl" rounded="rounded-2xl" />}
      {items.data && items.data.Items.length === 0 && (
        <div className="card">
          <EmptyState title="No inventory items" message="Add a raw material first, then come back to adjust its stock." icon="▤" />
        </div>
      )}
      {items.data && items.data.Items.length > 0 && (
        <StockAdjustmentFormBody
          items={items.data.Items}
          initialItemId={preselectItemId}
          onDone={() => navigate('/inventory')}
          onCancel={() => navigate('/inventory')}
        />
      )}
    </>
  )
}
