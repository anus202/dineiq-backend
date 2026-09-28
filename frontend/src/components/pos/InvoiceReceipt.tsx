import type { Invoice } from '../../types/api'
import { dateTime, money } from '../../utils/format'
import { Button, Modal } from '../ui'

export function InvoiceReceipt({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  return (
    <Modal
      open={invoice !== null}
      title="Invoice"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => window.print()}>
            🖨 Print
          </Button>
          <Button onClick={onClose}>Done</Button>
        </>
      }
    >
      {invoice && (
        <div className="print-area font-mono text-xs text-slate-700 dark:text-slate-300">
          <div className="text-center">
            <p className="text-base font-bold text-ink dark:text-white">{invoice.RestaurantName}</p>
            <p>{invoice.InvoiceNumber}</p>
            <p>{dateTime(invoice.PaidAt)}</p>
          </div>
          <div className="my-3 border-t border-dashed border-slate-300 pt-2">
            <p>
              Order {invoice.OrderNumber} · {invoice.OrderType}
              {invoice.TableNumber && ` · Table ${invoice.TableNumber}`}
            </p>
            <p>Guests: {invoice.GuestCount}</p>
            {invoice.CustomerName && (
              <p>
                Customer: {invoice.CustomerName} ({invoice.CustomerPhone})
              </p>
            )}
            {invoice.CashierName && <p>Cashier: {invoice.CashierName}</p>}
          </div>
          <table className="w-full border-t border-dashed border-slate-300">
            <tbody>
              {invoice.Lines.map((l, i) => (
                <tr key={i}>
                  <td className="py-0.5">
                    {l.Quantity} × {l.MenuItemName}
                  </td>
                  <td className="text-right">{money(l.TotalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 space-y-0.5 border-t border-dashed border-slate-300 pt-2">
            <Line label="Subtotal" value={money(invoice.Bill.SubTotal)} />
            {invoice.Bill.OrderDiscount > 0 && <Line label="Discount" value={`-${money(invoice.Bill.OrderDiscount)}`} />}
            {invoice.Bill.TierDiscount > 0 && <Line label={`${invoice.Bill.TierName} ${invoice.Bill.TierDiscountPercentage}%`} value={`-${money(invoice.Bill.TierDiscount)}`} />}
            <Line label="Amount due" value={money(invoice.Bill.AmountDue)} bold />
            {invoice.Bill.PointsRedeemed > 0 && <Line label={`Points (${invoice.Bill.PointsRedeemed})`} value={`-${money(invoice.Bill.PointsRedemptionAmount)}`} />}
            <Line label={`Paid (${invoice.PaymentMethod})`} value={money(invoice.Bill.AmountTendered)} />
            {invoice.Bill.ChangeDue > 0 && <Line label="Change" value={money(invoice.Bill.ChangeDue)} />}
            {invoice.Bill.PointsEarned > 0 && <Line label="Points earned" value={String(invoice.Bill.PointsEarned)} />}
            {invoice.Bill.PointsBalanceAfter !== null && <Line label="Points balance" value={String(invoice.Bill.PointsBalanceAfter)} />}
          </div>
          <p className="mt-4 text-center">Thank you for dining with us!</p>
        </div>
      )}
    </Modal>
  )
}

function Line({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold text-ink' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
