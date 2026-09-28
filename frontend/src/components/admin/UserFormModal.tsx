import { useEffect, useState } from 'react'
import { useApi } from '../../hooks/useApi'
import { apiErrorMessage } from '../../services/api'
import { branchApi, usersApi } from '../../services/endpoints'
import type { RoleName, StaffCreateInput } from '../../types/api'
import { roleLabel } from '../../utils/roles'
import { Button, Modal, SelectField, TextField, Toggle, useToast } from '../ui'

interface Props {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

const ASSIGNABLE_ROLES: RoleName[] = ['ADMIN', 'RESTAURANT_MANAGER', 'INVENTORY_MANAGER', 'CASHIER']

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

/** Create-user + role-assignment modal.
 *
 * Note: the requested role list (Admin/Restaurant Manager/Inventory Manager/Data
 * Engineer/Analyst) doesn't match this system's actual RBAC roles (SUPER_ADMIN, ADMIN,
 * INVENTORY_MANAGER, CASHIER, CUSTOMER — see app/core/roles.py). Using the real roles
 * here so accounts created actually work; only a SUPER_ADMIN can grant ADMIN.
 */
export function UserFormModal({ open, onClose, onSaved }: Props) {
  const toast = useToast()
  const branches = useApi(() => branchApi.list({ is_active: true }), [])
  const [form, setForm] = useState<StaffCreateInput>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(EMPTY)
    setSubmitted(false)
  }, [open])

  const nameError = !form.FullName.trim() ? 'Full name is required' : null
  const emailError = !form.Email.trim() ? 'Email is required' : null
  const passwordError = form.Password.length < 8 ? 'Password must be at least 8 characters' : null
  const valid = !nameError && !emailError && !passwordError

  const save = async () => {
    setSubmitted(true)
    if (!valid) {
      toast.error('Missing required fields', 'Please fix the highlighted fields below.')
      return
    }
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
    <Modal
      open={open}
      title="New user"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Create user
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Full name"
          autoFocus
          value={form.FullName}
          maxLength={100}
          error={submitted ? nameError : null}
          onChange={(e) => setForm({ ...form, FullName: e.target.value })}
          placeholder="e.g. Sara Ali"
        />
        <TextField
          label="Email"
          type="email"
          value={form.Email}
          maxLength={150}
          error={submitted ? emailError : null}
          onChange={(e) => setForm({ ...form, Email: e.target.value })}
          placeholder="e.g. sara@dineiq.pk"
        />
        <TextField
          label="Password"
          type="password"
          value={form.Password}
          error={submitted ? passwordError : null}
          onChange={(e) => setForm({ ...form, Password: e.target.value })}
          hint="At least 8 characters"
        />
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

      <div className="mt-6 border-t border-slate-100 dark:border-slate-800 pt-4">
        <p className="mb-3 text-sm font-medium text-ink dark:text-white">System permissions</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle label="Inventory Access" checked={form.CanAccessInventory ?? false} onChange={(v) => setForm({ ...form, CanAccessInventory: v })} />
          <Toggle label="Pipeline Trigger Access" checked={form.CanTriggerPipeline ?? false} onChange={(v) => setForm({ ...form, CanTriggerPipeline: v })} />
          <Toggle label="Menu Management Access" checked={form.CanAccessMenuManagement ?? false} onChange={(v) => setForm({ ...form, CanAccessMenuManagement: v })} />
          <Toggle label="Branch Analytics Access" checked={form.CanAccessBranchAnalytics ?? false} onChange={(v) => setForm({ ...form, CanAccessBranchAnalytics: v })} />
        </div>
      </div>
    </Modal>
  )
}
