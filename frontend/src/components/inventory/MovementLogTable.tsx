import { useState } from 'react'
import { useApi } from '../../hooks/useApi'
import { inventoryApi } from '../../services/endpoints'
import type { MovementType, StockMovement } from '../../types/api'
import { dateTime, quantity } from '../../utils/format'
import { Badge, DataTable, statusTone, type Column } from '../ui'

const PAGE_SIZE = 15
const TYPES: MovementType[] = ['INITIAL_STOCK', 'MANUAL_ADDITION', 'MANUAL_DEDUCTION', 'ORDER_CONSUMPTION']

export function MovementLogTable({ refreshKey }: { refreshKey: number }) {
  const [page, setPage] = useState(1)
  const [type, setType] = useState<MovementType | ''>('')
  const logs = useApi(
    () => inventoryApi.movements({ skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE, movement_type: type || undefined }),
    [page, type, refreshKey],
    30_000,
  )

  const columns: Column<StockMovement>[] = [
    { key: 'when', header: 'When', render: (m) => <span className="whitespace-nowrap text-slate-600">{dateTime(m.ChangedAt)}</span> },
    { key: 'item', header: 'Item', render: (m) => <span className="font-medium text-ink">{m.ItemName}</span> },
    { key: 'type', header: 'Movement', render: (m) => <Badge tone={statusTone(m.MovementType)}>{m.MovementType.replace('_', ' ')}</Badge> },
    {
      key: 'change',
      header: 'Change',
      align: 'right',
      render: (m) => <span className={m.QuantityChange < 0 ? 'text-rose-600' : 'text-emerald-700'}>{m.QuantityChange > 0 ? '+' : ''}{quantity(m.QuantityChange, m.Unit)}</span>,
    },
    { key: 'after', header: 'Stock after', align: 'right', render: (m) => quantity(m.StockAfter, m.Unit) },
    {
      key: 'reason',
      header: 'Reason',
      render: (m) => (
        <span className="text-slate-600">
          {m.Reason}
          {m.OrderNumber && <span className="ml-1 font-mono text-xs text-slate-400">{m.OrderNumber}</span>}
        </span>
      ),
    },
    { key: 'by', header: 'By', render: (m) => m.ChangedByName ?? <span className="text-slate-400">—</span> },
  ]

  return (
    <DataTable
      columns={columns}
      rows={logs.data?.Items ?? []}
      rowKey={(m) => m.Id}
      loading={logs.loading && !logs.data}
      error={logs.error}
      onRetry={logs.reload}
      server={{ total: logs.data?.Total ?? 0, page, pageSize: PAGE_SIZE, onPageChange: setPage }}
      toolbar={
        <select
          className="field-input w-auto"
          value={type}
          onChange={(e) => {
            setType(e.target.value as MovementType | '')
            setPage(1)
          }}
          aria-label="Filter by movement type"
        >
          <option value="">All movements</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace('_', ' ')}
            </option>
          ))}
        </select>
      }
      emptyTitle="No stock movements yet"
    />
  )
}
