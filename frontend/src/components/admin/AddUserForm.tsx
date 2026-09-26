import { useState } from 'react'
import { useApi } from '../../hooks/useApi'
import { apiErrorMessage } from '../../services/api'
import { branchApi, usersApi } from '../../services/endpoints'
import type { RoleName, StaffCreateInput } from '../../types/api'
import { roleLabel } from '../../utils/roles'
import { Button, SelectField, TextField, Toggle, useToast } from '../ui'

interface Props {
  onSaved: () => void
  onCancel: () => void
}

const ASSIGNABLE_ROLES: RoleName[] = ['ADMIN', 'INVENTORY_MANAGER', 'CASHIER']

const EMPTY: StaffCreateInput = {
  FullName: '',
  Email: '',
  PhoneNumber: '',
  Password: '',
  Role: 'CASHIER',
  BranchId: null,
  CanAccessInventory: false,
  CanTriggerPipeline: false,
  CanAccessMenuManagement: false,
  CanAccessBranchAnalytics: false,
}

/** Full-page create-user + role-assignment form (FR 1.6-iii) — no modal.
 *
 * Note: the requested role list (Admin/Restaurant Manager/Inventory Manager/Data
 * Engineer/Analyst) doesn't match this system's actual RBAC roles (SUPER_ADMIN, ADMIN,
 * INVENTORY_MANAGER, CASHIER, CUSTOMER — see app/core/roles.py). Using the real roles
 * here so accounts created actually work; only a SUPER_ADMIN can grant ADMIN.
 */
export function AddUserForm({ onSaved, onCancel }: Props) {
  const toast = useToast()
  const branches = useApi(() => branchApi.list({ is_active: true }), [])
  const [form, setForm] = useState<StaffCreateInput>(EMPTY)
  const [saving, setSaving] = useState(false)

  const invalid = !form.FullName.trim() || !form.Email.trim() || form.Password.length < 8

  const save = async () => {
    setSaving(true)
    try {
      const body: StaffCreateInput = {
        ...form,
        FullName: form.FullName.trim(),
        Email: form.Email.trim(),
        PhoneNumber: form.PhoneNumber?.trim() || undefined,
      }
      await usersApi.create(body)
      toast.success('User created', `${body.FullName} (${roleLabel[body.Role]})`)
      onSaved()
    } catch (err) {
      toast.error('Could not create user', apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card max-w-2xl p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Full name" value={form.FullName} maxLength={100} onChange={(e) => setForm({ ...form, FullName: e.target.value })} placeholder="e.g. Sara Ali" />
        <TextField label="Email" type="email" value={form.Email} maxLength={150} onChange={(e) => setForm({ ...form, Email: e.target.value })} placeholder="e.g. sara@dineiq.pk" />
        <TextField label="Password" type="password" value={form.Password} onChange={(e) => setForm({ ...form, Password: e.target.value })} hint="At least 8 characters" />
        <TextField label="Phone number" value={form.PhoneNumber ?? ''} maxLength={20} onChange={(e) => setForm({ ...form, PhoneNumber: e.target.value })} placeholder="Optional" />
        <SelectField label="Role" value={form.Role} onChange={(e) => setForm({ ...form, Role: e.target.value as RoleName })}>
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel[r]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Branch access"
          value={form.BranchId ?? ''}
          onChange={(e) => setForm({ ...form, BranchId: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">All branches</option>
          {(branches.data ?? []).map((b) => (
            <option key={b.Id} value={b.Id}>
              {b.BranchName}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="mt-6 border-t border-slate-100 pt-4">
        <p className="mb-3 text-sm font-medium text-ink">System permissions</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle label="Inventory Access" checked={form.CanAccessInventory ?? false} onChange={(v) => setForm({ ...form, CanAccessInventory: v })} />
          <Toggle label="Pipeline Trigger Access" checked={form.CanTriggerPipeline ?? false} onChange={(v) => setForm({ ...form, CanTriggerPipeline: v })} />
          <Toggle label="Menu Management Access" checked={form.CanAccessMenuManagement ?? false} onChange={(v) => setForm({ ...form, CanAccessMenuManagement: v })} />
          <Toggle label="Branch Analytics Access" checked={form.CanAccessBranchAnalytics ?? false} onChange={(v) => setForm({ ...form, CanAccessBranchAnalytics: v })} />
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={save} loading={saving} disabled={invalid}>
          Create user
        </Button>
      </div>
    </div>
  )
}
