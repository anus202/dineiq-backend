import { useEffect, useState } from 'react'
import { useApi } from '../../hooks/useApi'
import { apiErrorMessage } from '../../services/api'
import { branchApi, usersApi } from '../../services/endpoints'
import type { RestaurantBranch, RestaurantBranchInput } from '../../types/api'
import { Button, Modal, SelectField, TextField, Toggle, useToast } from '../ui'

interface Props {
  open: boolean
  branch: RestaurantBranch | null
  onClose: () => void
  onSaved: () => void
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

export function BranchFormModal({ open, branch, onClose, onSaved }: Props) {
  const toast = useToast()
  const managers = useApi(() => usersApi.list({ skip: 0, limit: 200 }), [])
  const [form, setForm] = useState<RestaurantBranchInput>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(
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
    setSubmitted(false)
  }, [open, branch])

  const candidateManagers = (managers.data?.Items ?? []).filter((u) => u.Role !== 'CUSTOMER' && u.IsActive)

  const nameError = !form.BranchName.trim() ? 'Branch name is required' : null
  const addressError = !form.Address.trim() ? 'Address is required' : null
  const cityError = !form.City.trim() ? 'City is required' : null
  const phoneError = !form.Phone.trim() ? 'Phone is required' : null
  const hoursError = !form.OperatingHours.trim() ? 'Operating hours are required' : null
  const valid = !nameError && !addressError && !cityError && !phoneError && !hoursError

  const save = async () => {
    setSubmitted(true)
    if (!valid) {
      toast.error('Missing required fields', 'Please fix the highlighted fields below.')
      return
    }
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
    <Modal
      open={open}
      title={branch ? `Edit ${branch.BranchName}` : 'New branch'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextField
            label="Branch name"
            autoFocus
            value={form.BranchName}
            maxLength={150}
            error={submitted ? nameError : null}
            onChange={(e) => setForm({ ...form, BranchName: e.target.value })}
            placeholder="e.g. Gulberg Branch"
          />
        </div>
        <div className="sm:col-span-2">
          <TextField
            label="Address"
            value={form.Address}
            maxLength={255}
            error={submitted ? addressError : null}
            onChange={(e) => setForm({ ...form, Address: e.target.value })}
            placeholder="e.g. 12-A Main Boulevard"
          />
        </div>
        <TextField
          label="City"
          value={form.City}
          maxLength={100}
          error={submitted ? cityError : null}
          onChange={(e) => setForm({ ...form, City: e.target.value })}
          placeholder="e.g. Lahore"
        />
        <TextField
          label="Phone"
          value={form.Phone}
          maxLength={20}
          error={submitted ? phoneError : null}
          onChange={(e) => setForm({ ...form, Phone: e.target.value })}
          placeholder="e.g. +92 42 1234567"
        />
        <TextField
          label="Operating hours"
          value={form.OperatingHours}
          maxLength={100}
          error={submitted ? hoursError : null}
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
    </Modal>
  )
}
