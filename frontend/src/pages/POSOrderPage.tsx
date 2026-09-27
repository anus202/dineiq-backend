import { useState } from 'react'
import { CheckCircle2, Minus, Plus, ShoppingBag, Tag, Trash2 } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/layout/AppLayout'
import { Button, EmptyState, ErrorBanner, SelectField, ShimmerSkeleton, TextField, useToast } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useApi } from '../hooks/useApi'
import { apiErrorMessage } from '../services/api'
import { branchApi, menuApi, orderApi, promotionApi } from '../services/endpoints'
import type { Order, PromoValidateResponse } from '../types/api'
import { money } from '../utils/format'
import type { Cart } from './MenuBrowsePage'

interface LocationState {
  cart?: Cart
  email?: string
}

export function POSOrderPage() {
  const { user } = useAuth()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const toast = useToast()

  const state = (location.state as LocationState | null) ?? {}
  const cart: Cart = state.cart ?? {}
  // The customer's email, auto-filled read-only: prefer what was handed off from Menu
  // Browse (router state, then the ?email= URL param), and fall back to the logged-in
  // session -- covers a page refresh, where router state is lost but the session isn't.
  const customerEmail = state.email || searchParams.get('email') || user?.Email || ''

  const menu = useApi(() => menuApi.all(), [])
  const branches = useApi(() => branchApi.list({ is_active: true }), [])

  const [branchId, setBranchId] = useState<number | ''>('')
  const [promoCode, setPromoCode] = useState('')
  const [promoResult, setPromoResult] = useState<PromoValidateResponse | null>(null)
  const [applyingPromo, setApplyingPromo] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [placedOrder, setPlacedOrder] = useState<Order | null>(null)
  // Local copy of the cart so items can be adjusted/removed on this page without needing
  // to navigate back to Menu Browse.
  const [lines, setLines] = useState<Cart>(cart)

  const itemsById = new Map((menu.data ?? []).map((item) => [item.Id, item]))
  const cartRows = Object.entries(lines)
    .map(([id, quantity]) => ({ item: itemsById.get(Number(id)), quantity }))
    .filter((row): row is { item: NonNullable<typeof row.item>; quantity: number } => !!row.item && row.quantity > 0)

  const subtotal = cartRows.reduce((sum, row) => sum + row.item.Price * row.quantity, 0)
  const discountAmount = promoResult?.Valid ? Math.min(subtotal * ((promoResult.DiscountPercent ?? 0) / 100), subtotal) : 0
  const total = subtotal - discountAmount

  const adjustQuantity = (menuItemId: number, delta: number) =>
    setLines((prev) => {
      const next = Math.max(0, (prev[menuItemId] ?? 0) + delta)
      if (next === 0) {
        const { [menuItemId]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [menuItemId]: next }
    })

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return
    setApplyingPromo(true)
    try {
      const result = await promotionApi.validate(promoCode.trim(), branchId === '' ? undefined : branchId)
      setPromoResult(result)
      if (result.Valid) toast.success('Code applied', result.Message)
      else toast.error("Code didn't work", result.Message)
    } catch (err) {
      setPromoResult(null)
      toast.error('Could not check that code', apiErrorMessage(err))
    } finally {
      setApplyingPromo(false)
    }
  }

  const canSubmit = cartRows.length > 0 && branchId !== '' && !submitting

  const handleSubmit = async () => {
    if (branchId === '') {
      toast.error('Choose a branch', 'Pick which branch this order is for.')
      return
    }
    setSubmitting(true)
    try {
      const order = await orderApi.create({
        OrderType: 'Takeaway',
        PaymentMethod: 'Cash',
        Discount: Math.round(discountAmount * 100) / 100,
        BranchId: branchId,
        GuestCount: 1,
        items: cartRows.map((row) => ({ MenuItemId: row.item.Id, Quantity: row.quantity })),
      })
      setPlacedOrder(order)
      toast.success('Order placed!', `${order.OrderNumber} is on its way.`)
    } catch (err) {
      toast.error('Could not place the order', apiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (placedOrder) {
    return (
      <>
        <PageHeader title="Order confirmed" subtitle="Thanks for ordering with DineIQ" />
        <div className="card mx-auto max-w-md p-8 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <p className="mt-4 text-lg font-semibold text-ink">{placedOrder.OrderNumber}</p>
          <p className="mt-1 text-sm text-slate-500">
            {placedOrder.items.length} item{placedOrder.items.length === 1 ? '' : 's'} · {money(placedOrder.NetAmount)}
          </p>
          <p className="mt-4 text-sm text-slate-600">We'll email {customerEmail} with updates.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/customer/menu" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Order more
            </Link>
            <Link to="/customer" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Track my orders
            </Link>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Place your order" subtitle="Review your items, pick a branch, and check out" />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: customer + branch + voucher */}
        <div className="space-y-4 lg:col-span-1">
          <div className="card space-y-4 p-5">
            <TextField label="Your email" value={customerEmail} readOnly disabled hint="Confirmed from your account" />

            {branches.error && <ErrorBanner message={branches.error} onRetry={branches.reload} />}
            <SelectField
              label="Branch"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value ? Number(e.target.value) : '')}
              disabled={branches.loading}
            >
              <option value="">{branches.loading ? 'Loading branches…' : 'Choose your nearest branch'}</option>
              {(branches.data ?? []).map((b) => (
                <option key={b.Id} value={b.Id}>
                  {b.BranchName} — {b.City}
                </option>
              ))}
            </SelectField>

            <div>
              <span className="field-label">Voucher / discount code</span>
              <div className="mt-1 flex gap-2">
                <input
                  className="field-input"
                  placeholder="e.g. WELCOME20"
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value)
                    setPromoResult(null)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleApplyPromo())}
                />
                <Button variant="secondary" size="md" icon={<Tag className="h-4 w-4" />} loading={applyingPromo} onClick={handleApplyPromo} disabled={!promoCode.trim()}>
                  Apply
                </Button>
              </div>
              {promoResult && (
                <p className={`mt-1.5 text-xs font-medium ${promoResult.Valid ? 'text-emerald-600' : 'text-rose-600'}`}>{promoResult.Message}</p>
              )}
            </div>
          </div>
        </div>

        {/* Right: cart + summary */}
        <div className="space-y-4 lg:col-span-2">
          <div className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-ink">
              <ShoppingBag className="h-4.5 w-4.5" /> Your order
            </h3>

            {menu.loading && !menu.data && <ShimmerSkeleton className="h-32" rounded="rounded-xl" />}

            {!menu.loading && cartRows.length === 0 && (
              <EmptyState
                title="Your cart is empty"
                message="Head back to the menu and add a few dishes first."
                icon="🛒"
                action={
                  <Link to="/customer/menu" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
                    Browse the menu
                  </Link>
                }
              />
            )}

            {cartRows.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {cartRows.map(({ item, quantity }) => (
                  <li key={item.Id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{item.Name}</p>
                      <p className="text-xs text-slate-500">{money(item.Price)} each</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="inline-flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                        <button
                          type="button"
                          onClick={() => adjustQuantity(item.Id, -1)}
                          aria-label={`Remove one ${item.Name}`}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-rose-600"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-4 text-center text-sm font-semibold text-ink">{quantity}</span>
                        <button
                          type="button"
                          onClick={() => adjustQuantity(item.Id, 1)}
                          aria-label={`Add one more ${item.Name}`}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-slate-600 hover:bg-white hover:text-brand-700"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="w-20 text-right text-sm font-semibold text-ink">{money(item.Price * quantity)}</span>
                      <button
                        type="button"
                        onClick={() => setLines((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => Number(id) !== item.Id)))}
                        aria-label={`Remove ${item.Name} from order`}
                        className="text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {cartRows.length > 0 && (
            <div className="card space-y-2 p-5">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal</span>
                <span>{money(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>Discount ({promoResult?.Code})</span>
                  <span>-{money(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-semibold text-ink">
                <span>Total</span>
                <span>{money(total)}</span>
              </div>
              <Button variant="primary" size="lg" className="mt-3 w-full" loading={submitting} disabled={!canSubmit} onClick={handleSubmit}>
                Confirm &amp; Submit Order
              </Button>
              {branchId === '' && <p className="text-center text-xs text-rose-500">Choose a branch above to continue.</p>}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
