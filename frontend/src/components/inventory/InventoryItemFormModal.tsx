import { useEffect, useState } from 'react'
import { apiErrorMessage } from '../../services/api'
import { inventoryApi } from '../../services/endpoints'
import type { InventoryItem, InventoryItemInput, Unit } from '../../types/api'
import { Button, Modal, SelectField, TextField, useToast } from '../ui'

const UNITS: Unit[] = ['kg', 'liters', 'pcs']

const blank: InventoryItemInput = { ItemName: '', Unit: 'kg', CurrentStock: 0, ReorderLevel: 0, UnitCost: 0 }

interface Props {
  open: boolean
  item: InventoryItem | null
  onClose: () => void
  onSaved: () => void
}

export function InventoryItemFormModal({ open, item, onClose, onSaved }: Props) {
  const toast = useToast()
  const [form, setForm] = useState<InventoryItemInput>(blank)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(item ? { ItemName: item.ItemName, Unit: item.Unit, ReorderLevel: item.ReorderLevel, UnitCost: item.UnitCost } : blank)
    setSubmitted(false)
  }, [open, item])

  const nameError = !form.ItemName.trim() ? 'Item name is required' : null
  const stockError = (form.CurrentStock ?? 0) < 0 ? 'Opening stock cannot be negative' : null
  const reorderError = form.ReorderLevel < 0 ? 'Reorder level cannot be negative' : null
  const costError = form.UnitCost < 0 ? 'Unit cost cannot be negative' : null
  const valid = !nameError && !stockError && !reorderError && !costError

  const save = async () => {
    setSubmitted(true)
    if (!valid) {
      toast.error('Missing required fields', 'Please fix the highlighted fields below.')
      return
    }
    setSaving(true)
    try {
      const body = { ...form, ItemName: form.ItemName.trim() }
      if (item) {
        // Stock itself only changes through a logged adjustment.
        const { CurrentStock: _ignored, ...changes } = body
        void _ignored
        await inventoryApi.update(item.Id, changes)
      } else {
        await inventoryApi.create(body)
      }
      toast.success(item ? 'Item updated' : 'Item created', body.ItemName)
      onSaved()
    } catch (err) {
      toast.error('Could not save item', apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={item ? `Edit ${item.ItemName}` : 'New inventory item'}
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
            label="Item name"
            autoFocus
            value={form.ItemName}
            maxLength={150}
            error={submitted ? nameError : null}
            onChange={(e) => setForm({ ...form, ItemName: e.target.value })}
            placeholder="e.g. Basmati Rice"
          />
        </div>
        <SelectField label="Unit" value={form.Unit} onChange={(e) => setForm({ ...form, Unit: e.target.value as Unit })}>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Unit cost (PKR)"
          type="number"
          min={0}
          step="0.01"
          value={form.UnitCost}
          error={submitted ? costError : null}
          onChange={(e) => setForm({ ...form, UnitCost: Number(e.target.value) })}
        />
        {!item && (
          <TextField
            label="Opening stock"
            type="number"
            min={0}
            step="0.001"
            value={form.CurrentStock}
            error={submitted ? stockError : null}
            onChange={(e) => setForm({ ...form, CurrentStock: Number(e.target.value) })}
            hint="Logged as INITIAL_STOCK"
          />
        )}
        <TextField
          label="Reorder level"
          type="number"
          min={0}
          step="0.001"
          value={form.ReorderLevel}
          error={submitted ? reorderError : null}
          onChange={(e) => setForm({ ...form, ReorderLevel: Number(e.target.value) })}
          hint="Alert at or below this"
        />
        {item && <p className="text-xs text-slate-500 sm:col-span-2">To change the stock quantity use “Stock Adjustment”, so the change is logged with a reason.</p>}
      </div>
    </Modal>
  )
}
