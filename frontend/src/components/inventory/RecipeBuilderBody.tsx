import { useEffect, useMemo, useState } from 'react'
import { useApi } from '../../hooks/useApi'
import { apiErrorMessage } from '../../services/api'
import { inventoryApi, menuApi } from '../../services/endpoints'
import type { InventoryItem } from '../../types/api'
import { money } from '../../utils/format'
import { Button, ErrorBanner, ShimmerSkeleton, useToast } from '../ui'

interface Line {
  InventoryItemId: number
  QuantityRequired: string
}

interface Props {
  inventory: InventoryItem[]
  onSaved: () => void
}

/** Pick a menu item and set how much of each ingredient one serving uses. Full-page, no modal. */
export function RecipeBuilderBody({ inventory, onSaved }: Props) {
  const toast = useToast()
  const menu = useApi(() => menuApi.all(false), [])
  const [menuItemId, setMenuItemId] = useState<number>(0)
  const [filter, setFilter] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [loadingRecipe, setLoadingRecipe] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!menuItemId && menu.data?.length) setMenuItemId(menu.data[0].Id)
  }, [menu.data, menuItemId])

  useEffect(() => {
    if (!menuItemId) return
    setLoadingRecipe(true)
    setError(null)
    inventoryApi
      .recipe(menuItemId)
      .then((r) => setLines(r.Lines.map((l) => ({ InventoryItemId: l.InventoryItemId, QuantityRequired: String(l.QuantityRequired) }))))
      .catch((err) => setError(apiErrorMessage(err)))
      .finally(() => setLoadingRecipe(false))
  }, [menuItemId])

  const visibleMenu = useMemo(() => (menu.data ?? []).filter((m) => m.Name.toLowerCase().includes(filter.toLowerCase())), [menu.data, filter])
  const menuItem = menu.data?.find((m) => m.Id === menuItemId)
  const byId = new Map(inventory.map((i) => [i.Id, i]))
  const ingredientCost = lines.reduce((sum, l) => sum + (Number(l.QuantityRequired) || 0) * (byId.get(l.InventoryItemId)?.UnitCost ?? 0), 0)
  const usedIds = new Set(lines.map((l) => l.InventoryItemId))
  const invalid = lines.some((l) => !(Number(l.QuantityRequired) > 0) || !l.InventoryItemId)

  const addLine = () => {
    const next = inventory.find((i) => !usedIds.has(i.Id))
    if (next) setLines([...lines, { InventoryItemId: next.Id, QuantityRequired: '' }])
  }

  const save = async () => {
    setSaving(true)
    try {
      await inventoryApi.saveRecipe(
        menuItemId,
        lines.map((l) => ({ InventoryItemId: l.InventoryItemId, QuantityRequired: Number(l.QuantityRequired) })),
      )
      toast.success('Recipe saved', `${menuItem?.Name}: ${lines.length} ingredient${lines.length === 1 ? '' : 's'}`)
      onSaved()
    } catch (err) {
      toast.error('Could not save recipe', apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card p-6">
      <div className="grid gap-5 md:grid-cols-5">
        <div className="md:col-span-2">
          <input className="field-input mb-2" placeholder="Filter menu items…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter menu items" />
          <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-200">
            {menu.loading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 8 }, (_, i) => (
                  <ShimmerSkeleton key={i} className="h-6" />
                ))}
              </div>
            ) : (
              visibleMenu.map((m) => (
                <button
                  key={m.Id}
                  onClick={() => setMenuItemId(m.Id)}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${m.Id === menuItemId ? 'bg-brand-50 font-medium text-brand-700' : 'hover:bg-slate-50'}`}
                >
                  <span className="truncate">{m.Name}</span>
                  <span className="ml-2 shrink-0 text-xs text-slate-400">{m.Category.CategoryName}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="md:col-span-3">
          {menuItem && (
            <div className="mb-3">
              <p className="font-semibold text-ink">{menuItem.Name}</p>
              <p className="text-xs text-slate-500">
                Sells at {money(menuItem.Price)} · menu cost {money(menuItem.Cost)} · ingredient cost from this recipe <b>{money(ingredientCost)}</b>
              </p>
            </div>
          )}
          {error && <ErrorBanner message={error} />}
          {loadingRecipe ? (
            <ShimmerSkeleton className="h-40" rounded="rounded-xl" />
          ) : (
            <div className="space-y-2">
              {lines.length === 0 && <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No recipe yet: completing an order of this dish uses no stock.</p>}
              {lines.map((line, index) => {
                const unit = byId.get(line.InventoryItemId)?.Unit
                return (
                  <div key={index} className="flex items-center gap-2">
                    <select
                      className="field-input flex-1"
                      value={line.InventoryItemId}
                      onChange={(e) => setLines(lines.map((l, i) => (i === index ? { ...l, InventoryItemId: Number(e.target.value) } : l)))}
                      aria-label="Ingredient"
                    >
                      {inventory
                        .filter((i) => i.Id === line.InventoryItemId || !usedIds.has(i.Id))
                        .map((i) => (
                          <option key={i.Id} value={i.Id}>
                            {i.ItemName}
                          </option>
                        ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      step="0.001"
                      className="field-input w-28"
                      placeholder="Qty"
                      value={line.QuantityRequired}
                      onChange={(e) => setLines(lines.map((l, i) => (i === index ? { ...l, QuantityRequired: e.target.value } : l)))}
                      aria-label="Quantity per serving"
                    />
                    <span className="w-12 text-xs text-slate-500">{unit}</span>
                    <button onClick={() => setLines(lines.filter((_, i) => i !== index))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove ingredient">
                      ✕
                    </button>
                  </div>
                )
              })}
              <Button variant="secondary" size="sm" onClick={addLine} disabled={usedIds.size >= inventory.length}>
                + Add ingredient
              </Button>
              <p className="text-xs text-slate-500">Quantities are per serving, in each ingredient’s unit. Saving replaces the whole recipe.</p>
            </div>
          )}
        </div>
      </div>
      <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
        <Button onClick={save} loading={saving} disabled={!menuItemId || invalid || loadingRecipe}>
          Save recipe
        </Button>
      </div>
    </div>
  )
}
