import { useEffect, useState } from 'react'
import { apiErrorMessage } from '../../services/api'
import { inventoryApi } from '../../services/endpoints'
import type { InventoryItem, InventoryItemInput, Unit } from '../../types/api'
import { Button, SelectField, TextField, useToast } from '../ui'

const UNITS: Unit[] = ['kg', 'liters', 'pcs']

interface Props {
  item: InventoryItem | null
  onSaved: () => void
  onCancel: () => void
}

/** Full-page create/edit form for a raw-material inventory item — no modal wrapper. */
export function InventoryItemForm({ item, onSaved, onCancel }: Props) {
  const toast = useToast()
  const [form, setForm] = useState<InventoryItemInput>(
    item
      ? { ItemName: item.ItemName, Unit: item.Unit, ReorderLevel: item.ReorderLevel, UnitCost: item.UnitCost }
      : { ItemName: '', Unit: 'kg', CurrentStock: 0, ReorderLevel: 0, UnitCost: 0 },
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(
      item
        ? { ItemName: item.ItemName, Unit: item.Unit, ReorderLevel: item.ReorderLevel, UnitCost: item.UnitCost }
        : { ItemName: '', Unit: 'kg', CurrentStock: 0, ReorderLevel: 0, UnitCost: 0 },
    )
  }, [item])

  const invalid = !form.ItemName.trim() || form.ReorderLevel < 0 || form.UnitCost < 0 || (form.CurrentStock ?? 0) < 0

  const save = async () => {
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
    <div className="card max-w-2xl p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <TextField label="Item name" value={form.ItemName} maxLength={150} onChange={(e) => setForm({ ...form, ItemName: e.target.value })} placeholder="e.g. Basmati Rice" />
        </div>
        <SelectField label="Unit" value={form.Unit} onChange={(e) => setForm({ ...form, Unit: e.target.value as Unit })}>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </SelectField>
        <TextField label="Unit cost (PKR)" type="number" min={0} step="0.01" value={form.UnitCost} onChange={(e) => setForm({ ...form, UnitCost: Number(e.target.value) })} />
        {!item && (
          <TextField
            label="Opening stock"
            type="number"
            min={0}
            step="0.001"
            value={form.CurrentStock}
            onChange={(e) => setForm({ ...form, CurrentStock: Number(e.target.value) })}
            hint="Logged as INITIAL_STOCK"
          />
        )}
        <TextField label="Reorder level" type="number" min={0} step="0.001" value={form.ReorderLevel} onChange={(e) => setForm({ ...form, ReorderLevel: Number(e.target.value) })} hint="Alert at or below this" />
        {item && <p className="text-xs text-slate-500 sm:col-span-2">To change the stock quantity use “Stock Adjustment”, so the change is logged with a reason.</p>}
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
