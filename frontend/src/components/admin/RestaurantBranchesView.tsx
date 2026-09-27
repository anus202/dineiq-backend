import { useState } from 'react'
import { useApi } from '../../hooks/useApi'
import { apiErrorMessage } from '../../services/api'
import { branchApi } from '../../services/endpoints'
import type { RestaurantBranch } from '../../types/api'
import { dateOnly, money } from '../../utils/format'
import { Badge, Button, ConfirmDialog, DataTable, useToast, type Column } from '../ui'
import { BranchFormModal } from './BranchFormModal'

export function RestaurantBranchesView() {
  const toast = useToast()
  const { data, loading, error, reload } = useApi(() => branchApi.list(), [])
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All')
  const [editing, setEditing] = useState<RestaurantBranch | 'new' | null>(null)
  const [deactivating, setDeactivating] = useState<RestaurantBranch | null>(null)
  const [busy, setBusy] = useState(false)

  const rows = (data ?? []).filter((b) => statusFilter === 'All' || (statusFilter === 'Active') === b.IsActive)

  const deactivate = async () => {
    if (!deactivating) return
    setBusy(true)
    try {
      await branchApi.deactivate(deactivating.Id)
      toast.success('Branch deactivated', deactivating.BranchName)
      setDeactivating(null)
      await reload()
    } catch (err) {
      toast.error('Could not deactivate branch', apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<RestaurantBranch>[] = [
    { key: 'id', header: 'Branch ID', render: (b) => <span className="text-slate-400">#{b.Id}</span>, sortValue: (b) => b.Id },
    { key: 'name', header: 'Branch Name', render: (b) => <span className="font-medium text-ink">{b.BranchName}</span>, sortValue: (b) => b.BranchName },
    { key: 'address', header: 'Location / Address', render: (b) => <span className="text-slate-600">{b.Address}, {b.City}</span> },
    { key: 'manager', header: 'Manager Assigned', render: (b) => b.ManagerName ?? <span className="text-slate-400">Unassigned</span> },
    {
      key: 'status',
      header: 'Active Status',
      render: (b) => <Badge tone={b.IsActive ? 'green' : 'red'}>{b.IsActive ? 'Active' : 'Inactive'}</Badge>,
    },
    { key: 'revenue', header: 'Total Revenue', align: 'right', render: (b) => money(b.TotalRevenue), sortValue: (b) => b.TotalRevenue },
    { key: 'created', header: 'Created Date', render: (b) => dateOnly(b.CreatedAt), sortValue: (b) => b.CreatedAt },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (b) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => setEditing(b)}>
            Edit
          </Button>
          {b.IsActive && (
            <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setDeactivating(b)}>
              Deactivate
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(b) => b.Id}
        loading={loading && !data}
        error={error}
        onRetry={reload}
        searchText={(b) => `${b.BranchName} ${b.City} ${b.Address}`}
        searchPlaceholder="Search branches…"
        toolbar={
          <div className="ml-auto flex items-center gap-2">
            <select
              className="field-input w-auto"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              aria-label="Filter by status"
            >
              <option value="All">All statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
            <Button onClick={() => setEditing('new')}>+ Add Branch</Button>
          </div>
        }
        emptyTitle="No branches yet"
      />
      <BranchFormModal
        open={editing !== null}
        branch={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          void reload()
        }}
      />
      <ConfirmDialog
        open={deactivating !== null}
        title="Deactivate branch?"
        message={`"${deactivating?.BranchName}" will be marked inactive. Its history and revenue records are kept, and it can be reactivated from Edit.`}
        confirmLabel="Deactivate"
        busy={busy}
        onConfirm={deactivate}
        onCancel={() => setDeactivating(null)}
      />
    </>
  )
}
