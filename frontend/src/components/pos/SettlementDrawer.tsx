import { useEffect, useState } from 'react'
import { useApi, useDebounce } from '../../hooks/useApi'
import { apiErrorMessage } from '../../services/api'
import { orderApi, paymentApi } from '../../services/endpoints'
import type { Invoice, PaymentMethod, SettleInput } from '../../types/api'
import { money } from '../../utils/format'
import { Badge, Button, ConfirmDialog, Drawer, ErrorBanner, ShimmerSkeleton, useToast } from '../ui'

interface Props {
  orderId: number | null
  onClose: () => void
  onSettled: (invoice: Invoice) => void
  onCancelled: () => void
}

const METHODS: { key: PaymentMethod; label: string; icon: string }[] = [
  { key: 'Cash', label: 'Cash', icon: '💵' },
  { key: 'Card', label: 'Card', icon: '💳' },
  { key: 'Loyalty Points', label: 'Points', icon: '★' },
]

export function SettlementDrawer({ orderId, onClose, onSettled, onCancelled }: Props) {
  const toast = useToast()
  const order = useApi(() => (orderId ? orderApi.get(orderId) : Promise.resolve(undefined)), [orderId])
  const [method, setMethod] = useState<PaymentMethod>('Cash')
  const [redeem, setRedeem] = useState(0)
  const [tendered, setTendered] = useState<number | ''>('')
  const [settling, setSettling] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  useEffect(() => {
    setMethod('Cash')
    setRedeem(0)
    setTendered('')
  }, [orderId])

  const hasCustomer = Boolean(order.data?.CustomerId)
  const input: SettleInput | null = orderId
    ? {
        OrderId: orderId,
        PaymentMethod: method,
        RedeemPoints: method === 'Loyalty Points' ? 0 : redeem,
        AmountTendered: method === 'Cash' ? (tendered === '' ? undefined : tendered) : undefined,
      }
    : null

  const previewKey = useDebounce(orderId ? `${orderId}|${method}|${redeem}` : '', 300)
  const preview = useApi(
    () =>
      previewKey && orderId
        ? paymentApi.preview({
            OrderId: orderId,
            PaymentMethod: method === 'Cash' ? 'Card' : method,
            RedeemPoints: method === 'Loyalty Points' ? 0 : redeem,
          })
        : Promise.resolve(undefined),
    [previewKey],
  )
  const bill = preview.data?.Bill
  const cashShort = method === 'Cash' && bill && tendered !== '' && Number(tendered) < bill.AmountPayable

  const settle = async () => {
    if (!input) return
    setSettling(true)
    try {
      const invoice = await paymentApi.settle(input)
      toast.success(`Paid · ${invoice.InvoiceNumber}`, invoice.Bill.ChangeDue > 0 ? `Change due ${money(invoice.Bill.ChangeDue)}` : undefined)
      invoice.LowStockAlerts.forEach((a) => toast.warning('Low stock', `${a.ItemName}: ${a.CurrentStock} ${a.Unit} left`))
      onSettled(invoice)
    } catch (err) {
      toast.error('Payment failed', apiErrorMessage(err))
    } finally {
      setSettling(false)
    }
  }

  const cancelOrder = async () => {
    if (!orderId) return
    setSettling(true)
    try {
      await orderApi.cancel(orderId)
      toast.info('Order cancelled', order.data?.OrderNumber)
      setConfirmCancel(false)
      onCancelled()
    } catch (err) {
      toast.error('Could not cancel', apiErrorMessage(err))
    } finally {
      setSettling(false)
    }
  }

  const o = order.data
  const quickCash = bill ? [bill.AmountPayable, Math.ceil(bill.AmountPayable / 500) * 500, Math.ceil(bill.AmountPayable / 1000) * 1000, 5000].filter((v, i, all) => v > 0 && all.indexOf(v) === i) : []

  return (
    <Drawer
      open={orderId !== null}
      title={o ? `Settle ${o.OrderNumber}` : 'Settle bill'}
      subtitle={o ? `${o.OrderType}${o.TableNumber ? ` · Table ${o.TableNumber}` : ''} · ${o.GuestCount} guest${o.GuestCount === 1 ? '' : 's'}` : undefined}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" className="text-rose-600" onClick={() => setConfirmCancel(true)} disabled={!o || settling}>
            Cancel order
          </Button>
          <Button className="flex-1" size="lg" onClick={settle} loading={settling} disabled={!bill || Boolean(cashShort) || (method === 'Cash' && tendered === '') || preview.loading}>
            {bill ? `Charge ${money(bill.AmountPayable)}` : 'Charge'}
          </Button>
        </div>
      }
    >
      {order.error && <ErrorBanner message={order.error} />}
      {!o ? (
        <ShimmerSkeleton className="h-40" rounded="rounded-xl" />
      ) : (
        <div className="space-y-5">
          <div>
            {o.Customer ? (
              <p className="text-sm">
                <span className="font-medium text-ink dark:text-white">{o.Customer.CustomerName}</span> <span className="text-slate-500">{o.Customer.Phone}</span>
              </p>
            ) : (
              <Badge>Walk-in customer</Badge>
            )}
            <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100 dark:border-slate-800 text-sm">
              {o.items.map((l) => (
                <li key={l.Id} className="flex justify-between px-3 py-2">
                  <span>
                    {l.Quantity} × {l.MenuItemName}
                  </span>
                  <span className="font-medium">{money(l.TotalPrice)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="field-label">Payment method</p>
            <div className="grid grid-cols-3 gap-2">
              {METHODS.map((m) => {
                const disabled = m.key === 'Loyalty Points' && !hasCustomer
                return (
                  <button
                    key={m.key}
                    disabled={disabled}
                    onClick={() => setMethod(m.key)}
                    title={disabled ? 'Needs a registered customer on the order' : undefined}
                    className={`rounded-xl border px-3 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${method === m.key ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <span className="block text-lg" aria-hidden="true">
                      {m.icon}
                    </span>
                    {m.label}
                  </button>
                )
              })}
            </div>
          </div>

          {hasCustomer && method !== 'Loyalty Points' && (
            <label className="block">
              <span className="field-label">Redeem points towards the bill</span>
              <input type="number" min={0} className="field-input" value={redeem} onChange={(e) => setRedeem(Math.max(0, Math.floor(Number(e.target.value))))} />
            </label>
          )}

          {method === 'Cash' && (
            <div>
              <label className="block">
                <span className="field-label">Cash received</span>
                <input type="number" min={0} className={`field-input ${cashShort ? 'border-rose-400' : ''}`} value={tendered} onChange={(e) => setTendered(e.target.value === '' ? '' : Number(e.target.value))} />
              </label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {quickCash.map((v) => (
                  <button key={v} onClick={() => setTendered(v)} className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium hover:bg-slate-200">
                    {money(v)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800 p-4 text-sm">
            {preview.error && <p className="mb-2 text-rose-600">{preview.error}</p>}
            {!bill ? (
              <ShimmerSkeleton className="h-28" />
            ) : (
              <dl className="space-y-1.5">
                <Row label="Subtotal" value={money(bill.SubTotal)} />
                {bill.OrderDiscount > 0 && <Row label="Order discount" value={`− ${money(bill.OrderDiscount)}`} />}
                {bill.TierName && <Row label={`${bill.TierName} tier (${bill.TierDiscountPercentage}%)`} value={`− ${money(bill.TierDiscount)}`} />}
                <Row label="Amount due" value={money(bill.AmountDue)} strong />
                {bill.PointsRedeemed > 0 && <Row label={`${bill.PointsRedeemed} points redeemed`} value={`− ${money(bill.PointsRedemptionAmount)}`} />}
                <Row label="Payable" value={money(bill.AmountPayable)} strong />
                {method === 'Cash' && tendered !== '' && !cashShort && <Row label="Change due" value={money(Number(tendered) - bill.AmountPayable)} />}
                {bill.PointsBalanceBefore !== null && (
                  <p className="pt-2 text-xs text-slate-500">
                    Points: {bill.PointsBalanceBefore} → {bill.PointsBalanceAfter} (earns {bill.PointsEarned})
                  </p>
                )}
                {cashShort && <p className="pt-1 text-xs font-medium text-rose-600">Cash received is less than the payable amount.</p>}
              </dl>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this order?"
        message="The order will be marked Cancelled and its table freed. This can't be undone."
        confirmLabel="Cancel order"
        busy={settling}
        onConfirm={cancelOrder}
        onCancel={() => setConfirmCancel(false)}
      />
    </Drawer>
  )
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between ${strong ? 'font-semibold text-ink' : 'text-slate-600'}`}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}
