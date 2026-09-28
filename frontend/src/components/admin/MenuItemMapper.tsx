import { useState } from 'react'
import { useApi, useDebounce } from '../../hooks/useApi'
import { apiErrorMessage } from '../../services/api'
import { categoryApi, menuApi } from '../../services/endpoints'
import type { MenuItem } from '../../types/api'
import { money, percent } from '../../utils/format'
import { Badge, Button, ConfirmDialog, DataTable, useToast, type Column } from '../ui'
import { MenuItemFormModal } from './MenuItemFormModal'

const PAGE_SIZE = 15

export function MenuItemMapper() {
  const toast = useToast()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const debounced = useDebounce(search)
  const categories = useApi(() => categoryApi.list(), [])
  const items = useApi(
    () => menuApi.list({ skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE, search: debounced, category_id: categoryId || undefined }),
    [page, debounced, categoryId],
  )
  const [editing, setEditing] = useState<MenuItem | 'new' | null>(null)
  const [deleting, setDeleting] = useState<MenuItem | null>(null)
  const [busy, setBusy] = useState(false)

  const remove = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await menuApi.remove(deleting.Id)
      toast.success('Menu item deleted', deleting.Name)
      setDeleting(null)
      await items.reload()
    } catch (err) {
      toast.error('Could not delete menu item', apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<MenuItem>[] = [
    {
      key: 'name',
      header: 'Menu item',
      render: (m) => (
        <div>
          <p className="font-medium text-ink dark:text-white">{m.Name}</p>
          <p className="text-xs text-slate-400">#{m.Id}</p>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (m) => <Badge tone="teal">{m.Category.CategoryName}</Badge> },
    { key: 'price', header: 'Price', align: 'right', render: (m) => money(m.Price) },
    { key: 'cost', header: 'Cost', align: 'right', render: (m) => <span className="text-slate-500">{money(m.Cost)}</span> },
    {
      key: 'margin',
      header: 'Margin',
      align: 'right',
      render: (m) => (
        <span className={m.ProfitMarginPercentage < 30 ? 'text-rose-600' : 'text-emerald-700'}>
          {money(m.ContributionMargin)} <span className="text-xs">({percent(m.ProfitMarginPercentage)})</span>
        </span>
      ),
    },
    { key: 'available', header: 'Status', render: (m) => <Badge tone={m.IsAvailable ? 'green' : 'gray'} dot>{m.IsAvailable ? 'Available' : 'Unavailable'}</Badge> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (m) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(m)}>
            Edit
          </Button>
          <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setDeleting(m)}>
            Delete
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <DataTable
        columns={columns}
        rows={items.data?.Items ?? []}
        rowKey={(m) => m.Id}
        loading={items.loading && !items.data}
        error={items.error}
        onRetry={items.reload}
        server={{
          total: items.data?.Total ?? 0,
          page,
          pageSize: PAGE_SIZE,
          onPageChange: setPage,
          search,
          onSearchChange: (v) => {
            setSearch(v)
            setPage(1)
          },
        }}
        searchPlaceholder="Search menu items by name…"
        toolbar={
          <>
            <select
              className="field-input w-auto"
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value ? Number(e.target.value) : '')
                setPage(1)
              }}
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              {categories.data?.map((c) => (
                <option key={c.Id} value={c.Id}>
                  {c.Name}
                </option>
              ))}
            </select>
            <Button onClick={() => setEditing('new')} disabled={!categories.data?.length}>
              + New item
            </Button>
          </>
        }
        emptyTitle="No menu items match"
      />
      <MenuItemFormModal
        open={editing !== null}
        item={editing === 'new' ? null : editing}
        categories={categories.data ?? []}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          void items.reload()
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="Delete menu item?"
        message={`"${deleting?.Name}" will no longer be orderable. Past orders keep it for reporting.`}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
