import { useState } from 'react'
import { useApi } from '../../hooks/useApi'
import { apiErrorMessage } from '../../services/api'
import { branchApi, usersApi } from '../../services/endpoints'
import type { RoleName, User } from '../../types/api'
import { roleLabel } from '../../utils/roles'
import { dateOnly } from '../../utils/format'
import { Badge, Button, ConfirmDialog, DataTable, useToast, type Column } from '../ui'
import { UserFormModal } from './UserFormModal'

const ROLES: RoleName[] = ['SUPER_ADMIN', 'ADMIN', 'INVENTORY_MANAGER', 'CASHIER', 'CUSTOMER']
const PAGE_SIZE = 15

export function UserManagementView() {
  const toast = useToast()
  const [roleFilter, setRoleFilter] = useState<RoleName | ''>('')
  const [branchFilter, setBranchFilter] = useState<number | ''>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const users = useApi(
    () => usersApi.list({ role: roleFilter || undefined, branch_id: branchFilter || undefined, search: search || undefined, skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE }),
    [roleFilter, branchFilter, search, page],
  )
  const branches = useApi(() => branchApi.list(), [])
  const [editingRoleFor, setEditingRoleFor] = useState<User | null>(null)
  const [pendingRole, setPendingRole] = useState<RoleName>('CASHIER')
  const [deactivating, setDeactivating] = useState<User | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)

  const startEditRole = (user: User) => {
    setEditingRoleFor(user)
    setPendingRole(user.Role)
  }

  const saveRole = async () => {
    if (!editingRoleFor) return
    setBusy(true)
    try {
      await usersApi.changeRole(editingRoleFor.Id, pendingRole)
      toast.success('Role updated', `${editingRoleFor.FullName} is now ${roleLabel[pendingRole]}`)
      setEditingRoleFor(null)
      await users.reload()
    } catch (err) {
      toast.error('Could not change role', apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const deactivate = async () => {
    if (!deactivating) return
    setBusy(true)
    try {
      await usersApi.deactivate(deactivating.Id)
      toast.success('Account deactivated', deactivating.FullName)
      setDeactivating(null)
      await users.reload()
    } catch (err) {
      toast.error('Could not deactivate account', apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<User>[] = [
    { key: 'id', header: 'User ID', render: (u) => <span className="text-slate-400">#{u.Id}</span> },
    { key: 'name', header: 'Full Name', render: (u) => <span className="font-medium text-ink">{u.FullName}</span> },
    { key: 'email', header: 'Email', render: (u) => <span className="text-slate-600">{u.Email}</span> },
    {
      key: 'role',
      header: 'Assigned Role',
      render: (u) =>
        editingRoleFor?.Id === u.Id ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <select className="field-input w-auto py-1 text-xs" value={pendingRole} onChange={(e) => setPendingRole(e.target.value as RoleName)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel[r]}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={saveRole} loading={busy}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingRoleFor(null)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Badge tone="blue">{roleLabel[u.Role]}</Badge>
        ),
    },
    { key: 'branch', header: 'Assigned Branch', render: (u) => u.BranchName ?? <span className="text-slate-400">All branches</span> },
    { key: 'status', header: 'Status', render: (u) => <Badge tone={u.IsActive ? 'green' : 'red'}>{u.IsActive ? 'Active' : 'Inactive'}</Badge> },
    { key: 'created', header: 'Created', render: (u) => dateOnly(u.CreatedAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {editingRoleFor?.Id !== u.Id && (
            <Button size="sm" variant="ghost" onClick={() => startEditRole(u)}>
              Edit Role
            </Button>
          )}
          {u.IsActive && (
            <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => setDeactivating(u)}>
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
        rows={users.data?.Items ?? []}
        rowKey={(u) => u.Id}
        loading={users.loading && !users.data}
        error={users.error}
        onRetry={users.reload}
        server={{
          total: users.data?.Total ?? 0,
          page,
          pageSize: PAGE_SIZE,
          onPageChange: setPage,
          search,
          onSearchChange: (v) => {
            setSearch(v)
            setPage(1)
          },
        }}
        searchPlaceholder="Search by name or email…"
        toolbar={
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              className="field-input w-auto"
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value as RoleName | '')
                setPage(1)
              }}
              aria-label="Filter by role"
            >
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel[r]}
                </option>
              ))}
            </select>
            <select
              className="field-input w-auto"
              value={branchFilter}
              onChange={(e) => {
                setBranchFilter(e.target.value ? Number(e.target.value) : '')
                setPage(1)
              }}
              aria-label="Filter by branch"
            >
              <option value="">All branches</option>
              {(branches.data ?? []).map((b) => (
                <option key={b.Id} value={b.Id}>
                  {b.BranchName}
                </option>
              ))}
            </select>
            <Button onClick={() => setCreating(true)}>+ Add User</Button>
          </div>
        }
        emptyTitle="No accounts found"
      />
      <UserFormModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false)
          void users.reload()
        }}
      />
      <ConfirmDialog
        open={deactivating !== null}
        title="Deactivate account?"
        message={`"${deactivating?.FullName}" will no longer be able to log in. Their history is kept.`}
        confirmLabel="Deactivate"
        busy={busy}
        onConfirm={deactivate}
        onCancel={() => setDeactivating(null)}
      />
    </>
  )
}
