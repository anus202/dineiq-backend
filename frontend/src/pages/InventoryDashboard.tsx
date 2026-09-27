import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { InventoryItemFormModal } from '../components/inventory/InventoryItemFormModal'
import { StockStatusMatrix } from '../components/inventory/StockStatusMatrix'
import { PageHeader } from '../components/layout/AppLayout'
import { Button, ConfirmDialog, ErrorBanner, StatsCard, useToast } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { apiErrorMessage } from '../services/api'
import { inventoryApi } from '../services/endpoints'
import type { InventoryItem } from '../types/api'
import { count, money } from '../utils/format'

export function InventoryDashboard() {
  const toast = useToast()
  const navigate = useNavigate()
  const items = useApi(() => inventoryApi.items({ skip: 0, limit: 200 }), [], 30_000)
  const status = useApi(() => inventoryApi.stockStatus(), [], 30_000)
  const [editing, setEditing] = useState<InventoryItem | 'new' | null>(null)
  const [deleting, setDeleting] = useState<InventoryItem | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    void items.reload()
    void status.reload()
  }

  const remove = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await inventoryApi.remove(deleting.Id)
      toast.success('Item deleted', deleting.ItemName)
      setDeleting(null)
      refresh()
    } catch (err) {
      toast.error('Could not delete item', apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const list = items.data?.Items ?? []
  const s = status.data

  return (
    <>
      <PageHeader
        title="Inventory Dashboard"
        subtitle="Stock health at a glance."
        actions={<Button onClick={() => setEditing('new')}>+ Add Item</Button>}
      />
      {(items.error || status.error) && <ErrorBanner message={(items.error || status.error) as string} onRetry={refresh} />}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard index={0} label="Items tracked" icon="▤" loading={!s} value={s && count(s.TotalItems)} />
        <StatsCard index={1} label="Stock valuation" icon="₨" tone="sky" loading={!s} value={s && money(s.TotalValuation)} hint="On hand × unit cost" />
        <StatsCard index={2} label="Low stock" icon="⚠" tone="amber" loading={!s} value={s && count(s.LowStockCount)} hint="At or below reorder level" />
        <StatsCard index={3} label="Out of stock" icon="⛔" tone="rose" loading={!s} value={s && count(s.OutOfStockCount)} />
      </div>

      <div className="mb-3 flex items-center gap-4 text-xs text-slate-500">
        <span className="font-semibold text-slate-700">Stock status matrix</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Healthy</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> Low (≤ reorder level)</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" /> Out of stock</span>
      </div>
      <StockStatusMatrix
        items={list}
        loading={items.loading}
        onEdit={(item) => setEditing(item)}
        onAdjust={(item) => navigate(`/inventory/adjust-stock?itemId=${item.Id}`)}
        onDelete={setDeleting}
      />

      <InventoryItemFormModal
        open={editing !== null}
        item={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          refresh()
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Delete inventory item?"
        message={`"${deleting?.ItemName}" will be removed from stock tracking. Its movement history is kept. Items still used in a recipe can't be deleted.`}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
