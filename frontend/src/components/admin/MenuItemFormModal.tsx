import { useEffect, useState } from 'react'
import { apiErrorMessage } from '../../services/api'
import { menuApi } from '../../services/endpoints'
import type { Category, MenuItem, MenuItemInput } from '../../types/api'
import { money, percent } from '../../utils/format'
import { Button, Modal, SelectField, TextAreaField, TextField, Toggle, useToast } from '../ui'

interface Props {
  open: boolean
  item: MenuItem | null
  categories: Category[]
  onClose: () => void
  onSaved: () => void
}

const blank: MenuItemInput = { CategoryId: 0, Name: '', Description: '', Price: 0, Cost: 0, IsAvailable: true }

export function MenuItemFormModal({ open, item, categories, onClose, onSaved }: Props) {
  const toast = useToast()
  const [form, setForm] = useState<MenuItemInput>(blank)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(
      item
        ? { CategoryId: item.CategoryId, Name: item.Name, Description: item.Description ?? '', Price: item.Price, Cost: item.Cost, IsAvailable: item.IsAvailable }
        : { ...blank, CategoryId: categories[0]?.Id ?? 0 },
    )
    setSubmitted(false)
  }, [open, item, categories])

  const margin = form.Price - form.Cost
  const nameError = !form.Name.trim() ? 'Name is required' : null
  const categoryError = !form.CategoryId ? 'Category is required' : null
  const priceError = form.Price <= 0 ? 'Price must be greater than 0' : null
  const costError = form.Cost < 0 ? 'Cost cannot be negative' : null
  const valid = !nameError && !categoryError && !priceError && !costError

  const save = async () => {
    setSubmitted(true)
    if (!valid) {
      toast.error('Missing required fields', 'Please fix the highlighted fields below.')
      return
    }
    setSaving(true)
    try {
      const body = { ...form, Name: form.Name.trim(), Description: form.Description?.trim() || null }
      if (item) await menuApi.update(item.Id, body)
      else await menuApi.create(body)
      toast.success(item ? 'Menu item updated' : 'Menu item created', body.Name)
      onSaved()
    } catch (err) {
      toast.error('Could not save menu item', apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={item ? `Edit ${item.Name}` : 'New menu item'}
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
            label="Name"
            value={form.Name}
            maxLength={150}
            error={submitted ? nameError : null}
            onChange={(e) => setForm({ ...form, Name: e.target.value })}
          />
        </div>
        <SelectField
          label="Category"
          value={form.CategoryId}
          error={submitted ? categoryError : null}
          onChange={(e) => setForm({ ...form, CategoryId: Number(e.target.value) })}
        >
          {categories.map((c) => (
            <option key={c.Id} value={c.Id}>
              {c.Name}
            </option>
          ))}
        </SelectField>
        <div className="flex items-end pb-2">
          <Toggle label="Available to order" checked={form.IsAvailable} onChange={(IsAvailable) => setForm({ ...form, IsAvailable })} />
        </div>
        <TextField
          label="Price (PKR)"
          type="number"
          min={0}
          step="0.01"
          value={form.Price}
          error={submitted ? priceError : null}
          onChange={(e) => setForm({ ...form, Price: Number(e.target.value) })}
        />
        <TextField
          label="Cost (PKR)"
          type="number"
          min={0}
          step="0.01"
          value={form.Cost}
          error={submitted ? costError : null}
          onChange={(e) => setForm({ ...form, Cost: Number(e.target.value) })}
        />
        <div className="sm:col-span-2">
          <TextAreaField label="Description" value={form.Description ?? ''} maxLength={500} onChange={(e) => setForm({ ...form, Description: e.target.value })} />
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm sm:col-span-2">
          Contribution margin <b className="text-ink dark:text-white">{money(margin)}</b>
          {form.Price > 0 && <span className="text-slate-500"> · {percent((margin / form.Price) * 100)} of price</span>}
          {item && form.Price !== item.Price && <span className="ml-2 text-amber-700">Price change will be recorded in pricing history.</span>}
        </div>
      </div>
    </Modal>
  )
}
