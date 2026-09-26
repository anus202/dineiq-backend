import { useNavigate, useParams } from 'react-router-dom'
import { InventoryItemForm } from '../components/inventory/InventoryItemForm'
import { PageHeader } from '../components/layout/AppLayout'
import { ErrorBanner, ShimmerSkeleton } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { inventoryApi } from '../services/endpoints'

export function EditInventoryItemPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const items = useApi(() => inventoryApi.items({ skip: 0, limit: 200 }), [])
  const item = items.data?.Items.find((i) => i.Id === Number(id)) ?? null

  return (
    <>
      <PageHeader title="Edit Stock Item" subtitle="Update item details — stock quantity itself is changed via Stock Adjustment" />
      {items.error && <ErrorBanner message={items.error} onRetry={items.reload} />}
      {items.loading && !items.data && <ShimmerSkeleton className="h-72 max-w-2xl" rounded="rounded-2xl" />}
      {items.data && !item && <ErrorBanner message="Item not found. It may have been deleted." onRetry={() => navigate('/inventory')} />}
      {item && <InventoryItemForm item={item} onSaved={() => navigate('/inventory')} onCancel={() => navigate('/inventory')} />}
    </>
  )
}
