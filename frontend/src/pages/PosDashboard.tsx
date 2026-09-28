import { useState } from 'react'
import { PageHeader } from '../components/layout/AppLayout'
import { FloorPlan } from '../components/pos/FloorPlan'
import { InvoiceReceipt } from '../components/pos/InvoiceReceipt'
import { OrderBuilder } from '../components/pos/OrderBuilder'
import { SettlementDrawer } from '../components/pos/SettlementDrawer'
import { Badge, Button, EmptyState, ErrorBanner, Modal, ShimmerSkeleton, useToast } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { apiErrorMessage } from '../services/api'
import { orderApi, tableApi } from '../services/endpoints'
import type { DiningTable, Invoice } from '../types/api'
import { money, timeAgo } from '../utils/format'

export function PosDashboard() {
  const toast = useToast()
  const tables = useApi(() => tableApi.list(), [], 15_000)
  const openOrders = useApi(() => orderApi.list({ skip: 0, limit: 30, status: 'Pending' }), [], 15_000)
  const [builderTable, setBuilderTable] = useState<DiningTable | null>(null)
  const [settleId, setSettleId] = useState<number | null>(null)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [actionTable, setActionTable] = useState<DiningTable | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = () => {
    void tables.reload()
    void openOrders.reload()
  }

  const onTable = (table: DiningTable) => {
    if (table.Status === 'OCCUPIED' && table.CurrentOrder) setSettleId(table.CurrentOrder.OrderId)
    else setActionTable(table)
  }

  const setStatus = async (table: DiningTable, status: 'AVAILABLE' | 'RESERVED') => {
    setBusy(true)
    try {
      await tableApi.setStatus(table.Id, status)
      toast.success(`Table ${table.TableNumber} ${status === 'RESERVED' ? 'reserved' : 'released'}`)
      setActionTable(null)
      refresh()
    } catch (err) {
      toast.error('Could not update table', apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const t = tables.data
  const unseated = (openOrders.data?.Items ?? []).filter((o) => !o.TableId)

  return (
    <>
      <PageHeader
        title="Cashier & POS"
        subtitle="Tap a free table to seat a party, or an occupied one to settle its bill. Use the sidebar for a takeaway/delivery order."
      />
      {(tables.error || openOrders.error) && <ErrorBanner message={(tables.error || openOrders.error) as string} onRetry={refresh} />}

      <div className="grid gap-6 xl:grid-cols-4">
        <section className="xl:col-span-3">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <h2 className="font-semibold text-ink dark:text-white">Floor plan</h2>
            {t && (
              <>
                <Badge tone="green" dot>
                  {t.Available} available
                </Badge>
                <Badge tone="blue" dot>
                  {t.Occupied} occupied
                </Badge>
                <Badge tone="yellow" dot>
                  {t.Reserved} reserved
                </Badge>
              </>
            )}
            <span className="ml-auto text-xs text-slate-400">Live · refreshes every 15 s</span>
          </div>
          <FloorPlan tables={t?.Items ?? []} loading={tables.loading} onSelect={onTable} />
        </section>

        <aside>
          <h2 className="mb-3 font-semibold text-ink dark:text-white">Open takeaway & delivery</h2>
          <div className="card divide-y divide-slate-100">
            {openOrders.loading && !openOrders.data ? (
              <div className="space-y-2 p-4">
                <ShimmerSkeleton className="h-10" />
                <ShimmerSkeleton className="h-10" />
              </div>
            ) : unseated.length === 0 ? (
              <EmptyState title="No open orders" message="Takeaway and delivery orders waiting for payment show here." icon="🧾" />
            ) : (
              unseated.map((o) => (
                <button key={o.Id} onClick={() => setSettleId(o.Id)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:bg-slate-800">
                  <div>
                    <p className="font-mono text-xs font-medium text-ink dark:text-white">{o.OrderNumber}</p>
                    <p className="text-xs text-slate-500">
                      {o.OrderType} · {timeAgo(o.OrderDate)}
                      {o.Customer && ` · ${o.Customer.CustomerName}`}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-ink dark:text-white">{money(o.NetAmount)}</span>
                </button>
              ))
            )}
          </div>
        </aside>
      </div>

      <Modal open={actionTable !== null} title={actionTable ? `Table ${actionTable.TableNumber}` : ''} onClose={() => setActionTable(null)} size="sm">
        {actionTable && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {actionTable.Status === 'RESERVED' ? 'Reserved' : 'Available'} · seats {actionTable.Capacity}
            </p>
            <Button
              className="w-full"
              onClick={() => {
                setBuilderTable(actionTable)
                setActionTable(null)
              }}
            >
              Seat a party & start order
            </Button>
            {actionTable.Status === 'AVAILABLE' ? (
              <Button className="w-full" variant="secondary" loading={busy} onClick={() => setStatus(actionTable, 'RESERVED')}>
                Mark reserved
              </Button>
            ) : (
              <Button className="w-full" variant="secondary" loading={busy} onClick={() => setStatus(actionTable, 'AVAILABLE')}>
                Release reservation
              </Button>
            )}
          </div>
        )}
      </Modal>

      <OrderBuilder
        open={builderTable !== null}
        table={builderTable}
        onClose={() => setBuilderTable(null)}
        onCreated={() => {
          setBuilderTable(null)
          refresh()
        }}
      />
      <SettlementDrawer
        orderId={settleId}
        onClose={() => setSettleId(null)}
        onSettled={(inv) => {
          setSettleId(null)
          setInvoice(inv)
          refresh()
        }}
        onCancelled={() => {
          setSettleId(null)
          refresh()
        }}
      />
      <InvoiceReceipt invoice={invoice} onClose={() => setInvoice(null)} />
    </>
  )
}
