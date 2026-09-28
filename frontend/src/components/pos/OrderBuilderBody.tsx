import { useEffect, useMemo, useState } from 'react'
import { useApi, useDebounce } from '../../hooks/useApi'
import { apiErrorMessage } from '../../services/api'
import { customerApi, menuApi, orderApi, tableApi } from '../../services/endpoints'
import type { Customer, DiningTable, MenuItem, Order, OrderType } from '../../types/api'
import { money } from '../../utils/format'
import { Button, SelectField, ShimmerSkeleton, TextField, useToast } from '../ui'

interface Props {
  table: DiningTable | null
  onCreated: (order: Order) => void
}

type Cart = Map<number, { item: MenuItem; qty: number }>

/** Quick POS order body: pick dishes, optionally attach a customer, and seat it at a table.
 * Shared by the table-specific seating modal and the standalone "New Takeaway/Delivery Order" page.
 */
export function OrderBuilderBody({ table, onCreated }: Props) {
  const toast = useToast()
  const menu = useApi(() => menuApi.all(true), [])
  const [category, setCategory] = useState<string>('All')
  const [filter, setFilter] = useState('')
  const [cart, setCart] = useState<Cart>(new Map())
  const [orderType, setOrderType] = useState<OrderType>(table ? 'Dine-in' : 'Takeaway')
  const [guests, setGuests] = useState(table ? Math.min(2, table.Capacity) : 1)
  const [discount, setDiscount] = useState(0)
  const [phone, setPhone] = useState('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [saving, setSaving] = useState(false)
  const debouncedPhone = useDebounce(phone.replace(/[\s-]/g, ''), 400)
  const matches = useApi(
    () => (debouncedPhone.length >= 4 && !customer ? customerApi.list({ skip: 0, limit: 5, search: debouncedPhone }) : Promise.resolve(undefined)),
    [debouncedPhone, customer],
  )

  useEffect(() => {
    setCart(new Map())
    setOrderType(table ? 'Dine-in' : 'Takeaway')
    setGuests(table ? Math.min(2, table.Capacity) : 1)
    setDiscount(0)
    setPhone('')
    setCustomer(null)
    setFilter('')
    setCategory('All')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table?.Id])

  const categories = useMemo(() => ['All', ...new Set((menu.data ?? []).map((m) => m.Category.CategoryName))], [menu.data])
  const visible = (menu.data ?? []).filter(
    (m) => (category === 'All' || m.Category.CategoryName === category) && m.Name.toLowerCase().includes(filter.toLowerCase()),
  )
  const lines = [...cart.values()]
  const subtotal = lines.reduce((sum, l) => sum + l.item.Price * l.qty, 0)

  const change = (item: MenuItem, delta: number) => {
    setCart((current) => {
      const next = new Map(current)
      const qty = (next.get(item.Id)?.qty ?? 0) + delta
      if (qty <= 0) next.delete(item.Id)
      else next.set(item.Id, { item, qty })
      return next
    })
  }

  const tooBig = table !== null && guests > table.Capacity
  const valid = lines.length > 0 && discount >= 0 && discount <= subtotal && guests >= 1 && !tooBig

  const submit = async () => {
    setSaving(true)
    try {
      const order = await orderApi.create({
        OrderType: orderType,
        PaymentMethod: 'Cash',
        Discount: discount,
        CustomerId: customer?.Id,
        GuestCount: guests,
        items: lines.map((l) => ({ MenuItemId: l.item.Id, Quantity: l.qty })),
      })
      if (table && orderType === 'Dine-in') {
        try {
          await tableApi.assign(table.Id, order.Id, guests)
        } catch (err) {
          toast.warning(`Order ${order.OrderNumber} created, but not seated`, apiErrorMessage(err))
        }
      }
      toast.success(`Order ${order.OrderNumber} placed`, `${lines.length} dish${lines.length === 1 ? '' : 'es'} · ${money(order.NetAmount)}`)
      onCreated(order)
    } catch (err) {
      toast.error('Could not place order', apiErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      {/* Menu */}
      <div className="lg:col-span-3">
        <input className="field-input mb-3" placeholder="Search dishes…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search dishes" />
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${category === c ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="grid max-h-[26rem] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
          {menu.loading
            ? Array.from({ length: 9 }, (_, i) => <ShimmerSkeleton key={i} className="h-20" rounded="rounded-xl" />)
            : visible.map((m) => {
                const inCart = cart.get(m.Id)?.qty
                return (
                  <button
                    key={m.Id}
                    onClick={() => change(m, 1)}
                    aria-label={inCart ? `${m.Name}, ${inCart} in cart` : m.Name}
                    className={`relative rounded-xl border p-3 text-left transition hover:border-brand-400 hover:shadow-sm ${inCart ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white'}`}
                  >
                    {inCart && (
                      <span aria-hidden="true" className="absolute top-2 right-2 rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white">
                        {inCart}
                      </span>
                    )}
                    <p className="pr-6 text-sm leading-snug font-medium text-ink dark:text-white">{m.Name}</p>
                    <p className="mt-1 text-xs text-slate-500">{money(m.Price)}</p>
                  </button>
                )
              })}
        </div>
      </div>

      {/* Cart */}
      <div className="flex flex-col rounded-2xl bg-slate-50 dark:bg-slate-800 p-4 lg:col-span-2">
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Order type" value={orderType} disabled={table !== null} onChange={(e) => setOrderType(e.target.value as OrderType)}>
            <option>Dine-in</option>
            <option>Takeaway</option>
            <option>Delivery</option>
          </SelectField>
          <TextField
            label="Guests (Pax)"
            type="number"
            min={1}
            max={table?.Capacity ?? 50}
            value={guests}
            error={tooBig ? `Table seats ${table?.Capacity}` : null}
            onChange={(e) => setGuests(Number(e.target.value))}
          />
        </div>

        <div className="mt-3">
          {customer ? (
            <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-white px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-ink dark:text-white">{customer.Name}</p>
                <p className="text-xs text-slate-500">
                  {customer.Phone} · {customer.LoyaltyPoints} pts
                </p>
              </div>
              <button onClick={() => setCustomer(null)} className="text-xs text-slate-500 hover:text-rose-600">
                Remove
              </button>
            </div>
          ) : (
            <div className="relative">
              <TextField label="Customer phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Walk-in if empty" />
              {matches.data && matches.data.Items.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white shadow-lg">
                  {matches.data.Items.map((c) => (
                    <li key={c.Id}>
                      <button onClick={() => setCustomer(c)} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-brand-50">
                        <span>{c.Name}</span>
                        <span className="font-mono text-xs text-slate-500">{c.Phone}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
          {lines.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Tap dishes to add them</p>}
          {lines.map(({ item, qty }) => (
            <div key={item.Id} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">{item.Name}</span>
              <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white">
                <button onClick={() => change(item, -1)} className="px-2 py-0.5 text-slate-500 hover:text-ink dark:text-white" aria-label={`Remove one ${item.Name}`}>
                  −
                </button>
                <span className="w-6 text-center font-medium">{qty}</span>
                <button onClick={() => change(item, 1)} className="px-2 py-0.5 text-slate-500 hover:text-ink dark:text-white" aria-label={`Add one ${item.Name}`}>
                  +
                </button>
              </div>
              <span className="w-20 text-right font-medium">{money(item.Price * qty)}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2 border-t border-slate-200 dark:border-slate-700 pt-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500">Discount (PKR)</span>
            <input
              type="number"
              min={0}
              max={subtotal}
              className="field-input w-28 text-right"
              value={discount}
              onChange={(e) => setDiscount(Number(e.target.value))}
              aria-label="Discount"
            />
          </div>
          <div className="flex justify-between text-base font-semibold text-ink dark:text-white">
            <span>Total</span>
            <span>{money(Math.max(subtotal - discount, 0))}</span>
          </div>
          <Button className="w-full" size="lg" onClick={submit} loading={saving} disabled={!valid}>
            {table ? `Place order & seat at ${table.TableNumber}` : 'Place order'}
          </Button>
        </div>
      </div>
    </div>
  )
}
