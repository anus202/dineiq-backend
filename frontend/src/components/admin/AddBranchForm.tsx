import { useEffect, useState } from 'react'
import { useApi } from '../../hooks/useApi'
import { apiErrorMessage } from '../../services/api'
import { branchApi, usersApi } from '../../services/endpoints'
import type { RestaurantBranch, RestaurantBranchInput } from '../../types/api'
import { Button, SelectField, TextField, Toggle, useToast } from '../ui'

interface Props {
  branch: RestaurantBranch | null
  onSaved: () => void
  onCancel: () => void
}

const EMPTY: RestaurantBranchInput = {
  BranchName: '',
  Address: '',
  City: '',
  Phone: '',
  OperatingHours: '',
  ManagerId: null,
  IsActive: true,
}

/** Full-page create/edit form for a restaurant branch (FR 1.6-ii) — no modal. */
export function AddBranchForm({ branch, onSaved, onCancel }: Props) {
  const toast = useToast()
  const managers = useApi(() => usersApi.list({ skip: 0, limit: 200 }), [])
  const [form, setForm] = useState<RestaurantBranchInput>(
    branch
      ? {
          BranchName: branch.BranchName,
          Address: branch.Address,
          City: branch.City,
          Phone: branch.Phone,
          OperatingHours: branch.OperatingHours,
          ManagerId: branch.ManagerId,
          IsActive: branch.IsActive,
        }
      : EMPTY,
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (branch) {
      setForm({
        BranchName: branch.BranchName,
        Address: branch.Address,
        City: branch.City,
        Phone: branch.Phone,
        OperatingHours: branch.OperatingHours,
        ManagerId: branch.ManagerId,
        IsActive: branch.IsActive,
      })
    }
  }, [branch])

  const candidateManagers = (managers.data?.Items ?? []).filter((u) => u.Role !== 'CUSTOMER' && u.IsActive)
  const invalid = !form.BranchName.trim() || !form.Address.trim() || !form.City.trim() || !form.Phone.trim() || !form.OperatingHours.trim()

  const save = async () => {
    setSaving(true)
    try {
      const body: RestaurantBranchInput = {
        ...form,
        BranchName: form.BranchName.trim(),
        Address: form.Address.trim(),
        City: form.City.trim(),
        Phone: form.Phone.trim(),
        OperatingHours: form.OperatingHours.trim(),
      }
      if (branch) await branchApi.update(branch.Id, body)
      else await branchApi.create(body)
      toast.success(branch ? 'Branch updated' : 'Branch created', body.BranchName)
      onSaved()
    } catch (err) {
      toast.error('Could not save branch', apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card max-w-2xl p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextField label="Branch name" value={form.BranchName} maxLength={150} onChange={(e) => setForm({ ...form, BranchName: e.target.value })} placeholder="e.g. Gulberg Branch" />
        </div>
        <div className="sm:col-span-2">
          <TextField label="Address" value={form.Address} maxLength={255} onChange={(e) => setForm({ ...form, Address: e.target.value })} placeholder="e.g. 12-A Main Boulevard" />
        </div>
        <TextField label="City" value={form.City} maxLength={100} onChange={(e) => setForm({ ...form, City: e.target.value })} placeholder="e.g. Lahore" />
        <TextField label="Phone" value={form.Phone} maxLength={20} onChange={(e) => setForm({ ...form, Phone: e.target.value })} placeholder="e.g. +92 42 1234567" />
        <TextField
          label="Operating hours"
          value={form.OperatingHours}
          maxLength={100}
          onChange={(e) => setForm({ ...form, OperatingHours: e.target.value })}
          placeholder="e.g. 9:00 AM - 11:00 PM"
        />
        <SelectField
          label="Assigned branch manager"
          value={form.ManagerId ?? ''}
          onChange={(e) => setForm({ ...form, ManagerId: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Unassigned</option>
          {candidateManagers.map((u) => (
            <option key={u.Id} value={u.Id}>
              {u.FullName} ({u.Role})
            </option>
          ))}
        </SelectField>
        <div className="sm:col-span-2">
          <Toggle label={form.IsActive ? 'Active' : 'Inactive'} checked={form.IsActive} onChange={(value) => setForm({ ...form, IsActive: value })} />
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={save} loading={saving} disabled={invalid}>
          Save
        </Button>
      </div>
    </div>
  )
}
