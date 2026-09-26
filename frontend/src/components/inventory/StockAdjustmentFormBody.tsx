import { useEffect, useState } from 'react'
import { apiErrorMessage } from '../../services/api'
import { inventoryApi } from '../../services/endpoints'
import type { InventoryItem } from '../../types/api'
import { quantity } from '../../utils/format'
import { Button, SelectField, TextAreaField, TextField, useToast } from '../ui'

interface Props {
  items: InventoryItem[]
  initialItemId: number | null
  onDone: () => void
  onCancel: () => void
}

type Direction = 'add' | 'remove'

/** Manual stock change; the reason is mandatory and stored in tbl_StockMovementLog. Full-page, no modal. */
export function StockAdjustmentFormBody({ items, initialItemId, onDone, onCancel }: Props) {
  const toast = useToast()
  const [itemId, setItemId] = useState<number>(initialItemId ?? items[0]?.Id ?? 0)
  const [direction, setDirection] = useState<Direction>('add')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setItemId(initialItemId ?? items[0]?.Id ?? 0)
  }, [initialItemId, items])

  const item = items.find((i) => i.Id === itemId)
  const qty = Number(amount)
  const change = direction === 'add' ? qty : -qty
  const after = item ? item.CurrentStock + change : 0
  const reasonError = reason.trim().length > 0 && reason.trim().length < 3 ? 'At least 3 characters' : null
  const amountError = amount && (!(qty > 0) ? 'Enter a positive amount' : after < 0 ? 'Would take stock below zero' : null)
  const valid = item && qty > 0 && after >= 0 && reason.trim().length >= 3

  const submit = async () => {
    if (!item) return
    setSaving(true)
    try {
      const result = await inventoryApi.adjust(item.Id, change, reason.trim())
      toast.success('Stock adjusted', `${item.ItemName}: ${quantity(result.Movement.StockAfter, item.Unit)} now`)
      if (result.LowStockAlert) {
        toast.warning('Low stock', `${item.ItemName} is at or below its reorder level (${quantity(result.LowStockAlert.ReorderLevel, item.Unit)})`)
      }
      onDone()
    } catch (err) {
      toast.error('Adjustment failed', apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card max-w-2xl p-6">
      <div className="space-y-4">
        <SelectField label="Inventory item" value={itemId} onChange={(e) => setItemId(Number(e.target.value))}>
          {items.map((i) => (
            <option key={i.Id} value={i.Id}>
              {i.ItemName} ({quantity(i.CurrentStock, i.Unit)})
            </option>
          ))}
        </SelectField>
        <div className="grid grid-cols-2 gap-2">
          {(['add', 'remove'] as Direction[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDirection(d)}
              className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${direction === d ? (d === 'add' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-rose-500 bg-rose-50 text-rose-700') : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {d === 'add' ? '＋ Add stock (purchase)' : '－ Remove stock (wastage, correction)'}
            </button>
          ))}
        </div>
        <TextField label={`Quantity${item ? ` (${item.Unit})` : ''}`} type="number" min={0} step="0.001" value={amount} error={amountError || null} onChange={(e) => setAmount(e.target.value)} />
        <TextAreaField
          label="Reason (required)"
          value={reason}
          maxLength={250}
          error={reasonError}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Weekly purchase from Metro, spoiled batch, stock count correction"
        />
        {item && qty > 0 && (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {quantity(item.CurrentStock, item.Unit)} → <b className={after <= item.ReorderLevel ? 'text-amber-700' : 'text-ink'}>{quantity(after, item.Unit)}</b>
            {after <= item.ReorderLevel && after >= 0 && ' (at or below reorder level)'}
          </p>
        )}
      </div>
      <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={submit} loading={saving} disabled={!valid}>
          Record adjustment
        </Button>
      </div>
    </div>
  )
}
