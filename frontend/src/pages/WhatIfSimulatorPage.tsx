import { useEffect, useState } from 'react'
import { PageHeader } from '../components/layout/AppLayout'
import { Button, ErrorBanner, SelectField, ShimmerSkeleton, StatsCard, TextField, Toggle } from '../components/ui'
import { apiErrorMessage } from '../services/api'
import { menuApi, mlAnalyticsApi } from '../services/endpoints'
import type { MenuItem, WhatIfResponse } from '../types/api'

function pct(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 })
}

export function WhatIfSimulatorPage() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [menuItemsError, setMenuItemsError] = useState<string | null>(null)
  const [menuItemId, setMenuItemId] = useState<number | null>(null)
  const [priceChangePercent, setPriceChangePercent] = useState(0)
  const [discountPercent, setDiscountPercent] = useState(0)
  const [removeItem, setRemoveItem] = useState(false)
  const [prepQuantityChangePercent, setPrepQuantityChangePercent] = useState(0)
  const [wastageAssumptionChangePercent, setWastageAssumptionChangePercent] = useState(0)
  const [result, setResult] = useState<WhatIfResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    menuApi
      .all()
      .then((items) => {
        setMenuItems(items)
        if (items.length > 0) setMenuItemId(items[0].Id)
      })
      .catch((err) => setMenuItemsError(apiErrorMessage(err)))
  }, [])

  async function runSimulation() {
    if (menuItemId === null) return
    setLoading(true)
    setError(null)
    try {
      const response = await mlAnalyticsApi.whatIf({
        menu_item_id: menuItemId,
        price_change_percent: priceChangePercent,
        discount_percent: discountPercent,
        remove_item: removeItem,
        prep_quantity_change_percent: prepQuantityChangePercent,
        wastage_assumption_change_percent: wastageAssumptionChangePercent,
      })
      setResult(response)
    } catch (err) {
      setError(apiErrorMessage(err))
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <PageHeader
        title="What-If Scenario Simulator"
        subtitle="Project the revenue, profit and volume impact of a price change, discount, prep-quantity cut, wastage shift, or removing the item entirely"
      />

      {menuItemsError && <ErrorBanner message={menuItemsError} />}

      <div className="card mb-6 grid gap-4 p-5 sm:grid-cols-3">
        <SelectField
          label="Menu item"
          value={menuItemId ?? ''}
          onChange={(e) => setMenuItemId(e.target.value ? Number(e.target.value) : null)}
        >
          {menuItems.map((item) => (
            <option key={item.Id} value={item.Id}>
              {item.Name}
            </option>
          ))}
        </SelectField>
        <div className="flex items-end">
          <Toggle label="Remove this item from the menu" checked={removeItem} onChange={setRemoveItem} />
        </div>
        <div />

        <TextField
          label="Price change (%)"
          type="number"
          step="1"
          value={priceChangePercent}
          onChange={(e) => setPriceChangePercent(Number(e.target.value))}
          hint="Positive = price increase, negative = price decrease"
          disabled={removeItem}
        />
        <TextField
          label="Discount (%)"
          type="number"
          step="1"
          min={0}
          max={100}
          value={discountPercent}
          onChange={(e) => setDiscountPercent(Number(e.target.value))}
          hint="Applied on top of the price change, e.g. a promotion"
          disabled={removeItem}
        />
        <TextField
          label="Prep quantity change (%)"
          type="number"
          step="1"
          value={prepQuantityChangePercent}
          onChange={(e) => setPrepQuantityChangePercent(Number(e.target.value))}
          hint="Negative = prepare less; caps how much can actually be sold"
          disabled={removeItem}
        />
        <TextField
          label="Wastage assumption change (%)"
          type="number"
          step="1"
          value={wastageAssumptionChangePercent}
          onChange={(e) => setWastageAssumptionChangePercent(Number(e.target.value))}
          hint="Positive = assume more wastage (extra cost); negative = less wastage (saving)"
          disabled={removeItem}
        />
        <div className="sm:col-span-3">
          <Button onClick={runSimulation} loading={loading} disabled={menuItemId === null}>
            Run simulation
          </Button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}
      {loading && !result && <ShimmerSkeleton className="h-48" rounded="rounded-2xl" />}

      {result && (
        <>
          {result.remove_item ? (
            <p className="mb-4 text-sm font-medium text-rose-600">
              Scenario: remove '{result.menu_item_name}' from the menu entirely — all figures below are projected as zero.
            </p>
          ) : (
            <p className="mb-4 text-sm text-slate-500">
              Elasticity coefficient used: <b>{result.elasticity_coefficient}</b> (from the analytics pipeline's historical price/demand
              correlation for this item, or a conservative default when unavailable). These are estimates, not guaranteed outcomes.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatsCard
              label="Projected revenue"
              value={money(result.projected_revenue)}
              hint={`was ${money(result.current_revenue)} · ${pct(result.revenue_delta_percent)}`}
              tone={result.revenue_delta_percent >= 0 ? 'teal' : 'rose'}
            />
            <StatsCard
              label="Projected profit"
              value={money(result.projected_profit)}
              hint={`was ${money(result.current_profit)} · ${pct(result.profit_delta_percent)}`}
              tone={result.profit_delta_percent >= 0 ? 'teal' : 'rose'}
            />
            <StatsCard
              label="Projected volume"
              value={result.projected_quantity.toLocaleString()}
              hint={`was ${result.current_quantity.toLocaleString()} · ${pct(result.volume_delta_percent)}`}
              tone={result.volume_delta_percent >= 0 ? 'teal' : 'rose'}
            />
          </div>

          <div className="card mt-6 p-5">
            <h2 className="mb-3 text-lg font-semibold text-ink dark:text-white">{result.menu_item_name}</h2>
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-slate-500">Current price</p>
                <p className="font-medium text-ink dark:text-white">{money(result.current_price)}</p>
              </div>
              <div>
                <p className="text-slate-500">Projected price</p>
                <p className="font-medium text-ink dark:text-white">{money(result.projected_price)}</p>
              </div>
              <div>
                <p className="text-slate-500">Current margin</p>
                <p className="font-medium text-ink dark:text-white">{result.current_margin_percent.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-slate-500">Projected margin</p>
                <p className="font-medium text-ink dark:text-white">{result.projected_margin_percent.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
