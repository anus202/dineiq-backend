import { useState } from 'react'
import { useApi, useDebounce } from '../../hooks/useApi'
import { customerApi } from '../../services/endpoints'
import type { Customer } from '../../types/api'
import { count, dateOnly, dateTime, money } from '../../utils/format'
import { Badge, DataTable, ErrorBanner, Modal, ShimmerSkeleton, statusTone, type Column } from '../ui'

const PAGE_SIZE = 20

/** Server-side paged search over the full customer base (500k+ rows). */
export function CustomerSearch() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const debounced = useDebounce(search, 450)
  const list = useApi(() => customerApi.list({ skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE, search: debounced }), [page, debounced])
  const [selected, setSelected] = useState<Customer | null>(null)

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: 'Customer',
      render: (c) => (
        <div>
          <p className="font-medium text-ink">{c.Name}</p>
          <p className="text-xs text-slate-400">#{c.Id}</p>
        </div>
      ),
    },
    { key: 'phone', header: 'Phone', render: (c) => <span className="font-mono text-xs">{c.Phone}</span> },
    { key: 'email', header: 'Email', render: (c) => c.Email ?? <span className="text-slate-400">—</span> },
    { key: 'points', header: 'Points', align: 'right', render: (c) => count(c.LoyaltyPoints) },
    { key: 'since', header: 'Member since', render: (c) => dateOnly(c.CreatedAt) },
  ]

  return (
    <>
      <DataTable
        columns={columns}
        rows={list.data?.Items ?? []}
        rowKey={(c) => c.Id}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        onRowClick={setSelected}
        server={{
          total: list.data?.Total ?? 0,
          page,
          pageSize: PAGE_SIZE,
          onPageChange: setPage,
          search,
          onSearchChange: (v) => {
            setSearch(v)
            setPage(1)
          },
        }}
        searchPlaceholder="Search by phone (digits) or name…"
        emptyTitle="No customers match"
        emptyMessage="Phone searches match any part of the number; other text matches the name."
      />
      <CustomerProfileModal customer={selected} onClose={() => setSelected(null)} />
    </>
  )
}

function CustomerProfileModal({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const id = customer?.Id
  const detail = useApi(() => (id ? customerApi.detail(id) : Promise.resolve(undefined)), [id])
  const rfm = useApi(() => (id ? customerApi.rfm(id) : Promise.resolve(undefined)), [id])

  return (
    <Modal open={customer !== null} title={customer?.Name ?? ''} onClose={onClose} size="lg">
      {detail.error && <ErrorBanner message={detail.error} onRetry={detail.reload} />}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Orders', detail.data && count(detail.data.Stats.TotalOrders)],
          ['Lifetime spend', detail.data && money(detail.data.Stats.TotalSpent)],
          ['Avg order', detail.data && money(detail.data.Stats.AverageOrderValue)],
          ['Points', customer && count(customer.LoyaltyPoints)],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{label}</p>
            {value ? <p className="mt-1 font-semibold text-ink">{value}</p> : <ShimmerSkeleton className="mt-2 h-5 w-20" />}
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-slate-100 p-4">
        <h4 className="mb-2 text-sm font-semibold text-ink">RFM analysis</h4>
        {rfm.loading ? (
          <ShimmerSkeleton className="h-10" />
        ) : rfm.error ? (
          <ErrorBanner message={rfm.error} />
        ) : rfm.data ? (
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <Badge tone="teal">{rfm.data.Segment}</Badge>
            {rfm.data.RFMScore && <span className="font-mono text-ink">RFM {rfm.data.RFMScore}</span>}
            <span className="text-slate-500">Recency: {rfm.data.RecencyDays ?? '—'} days</span>
            <span className="text-slate-500">Frequency: {rfm.data.Frequency}</span>
            <span className="text-slate-500">Monetary: {money(rfm.data.MonetaryValue)}</span>
          </div>
        ) : null}
      </div>

      <h4 className="mt-5 mb-2 text-sm font-semibold text-ink">Recent orders</h4>
      {detail.loading ? (
        <ShimmerSkeleton className="h-24" />
      ) : detail.data?.RecentOrders.length ? (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {detail.data.RecentOrders.map((o) => (
            <li key={o.Id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="font-mono text-xs text-slate-600">{o.OrderNumber}</span>
              <span className="text-slate-500">{dateTime(o.OrderDate)}</span>
              <span className="text-slate-500">{o.OrderType}</span>
              <Badge tone={statusTone(o.Status)}>{o.Status}</Badge>
              <span className="font-medium text-ink">{money(o.NetAmount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">No orders yet.</p>
      )}
    </Modal>
  )
}
