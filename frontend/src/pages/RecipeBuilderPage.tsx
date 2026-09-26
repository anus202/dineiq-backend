import { RecipeBuilderBody } from '../components/inventory/RecipeBuilderBody'
import { PageHeader } from '../components/layout/AppLayout'
import { EmptyState, ErrorBanner, ShimmerSkeleton } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { inventoryApi } from '../services/endpoints'

export function RecipeBuilderPage() {
  const items = useApi(() => inventoryApi.items({ skip: 0, limit: 200 }), [])

  return (
    <>
      <PageHeader title="Recipe Builder" subtitle="Set how much of each ingredient one serving of a menu item uses" />
      {items.error && <ErrorBanner message={items.error} onRetry={items.reload} />}
      {items.loading && !items.data && <ShimmerSkeleton className="h-96" rounded="rounded-2xl" />}
      {items.data && items.data.Items.length === 0 && (
        <div className="card">
          <EmptyState title="No inventory items" message="Add raw materials first, then build recipes from them." icon="🍳" />
        </div>
      )}
      {items.data && items.data.Items.length > 0 && <RecipeBuilderBody inventory={items.data.Items} onSaved={items.reload} />}
    </>
  )
}
