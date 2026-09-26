import { useState } from 'react'
import { useApi } from '../../hooks/useApi'
import { auditApi } from '../../services/endpoints'
import type { AuditLog } from '../../types/api'
import { dateTime } from '../../utils/format'
import { Badge, DataTable, statusTone, type Column } from '../ui'

const PAGE_SIZE = 25

export function AuditLogTable() {
  const [page, setPage] = useState(1)
  const [action, setAction] = useState('')
  const [entity, setEntity] = useState('')
  const filters = useApi(() => auditApi.filters(), [])
  const logs = useApi(
    () => auditApi.list({ skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE, action: action || undefined, entity_name: entity || undefined }),
    [page, action, entity],
    20_000,
  )

  const columns: Column<AuditLog>[] = [
    { key: 'time', header: 'When', render: (l) => <span className="whitespace-nowrap text-slate-600">{dateTime(l.Timestamp)}</span> },
    {
      key: 'user',
      header: 'User',
      render: (l) =>
        l.UserId ? (
          <div>
            <p className="font-medium text-ink">{l.UserName}</p>
            <p className="text-xs text-slate-400">{l.UserEmail}</p>
          </div>
        ) : (
          <span className="text-slate-400">System</span>
        ),
    },
    { key: 'action', header: 'Action', render: (l) => <Badge tone={statusTone(l.Action)}>{l.Action}</Badge> },
    {
      key: 'entity',
      header: 'Entity',
      render: (l) => (
        <span>
          {l.EntityName} <span className="text-slate-400">#{l.EntityId}</span>
        </span>
      ),
    },
    { key: 'summary', header: 'Changes', render: (l) => <span className="text-xs text-slate-500">{summarize(l)}</span> },
    { key: 'ip', header: 'IP', render: (l) => <span className="font-mono text-xs text-slate-500">{l.IPAddress ?? '—'}</span> },
  ]

  const select = (value: string, onChange: (v: string) => void, options: string[] | undefined, placeholder: string) => (
    <select
      className="field-input w-auto"
      value={value}
      onChange={(e) => {
        onChange(e.target.value)
        setPage(1)
      }}
      aria-label={placeholder}
    >
      <option value="">{placeholder}</option>
      {options?.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )

  return (
    <DataTable
      columns={columns}
      rows={logs.data?.Items ?? []}
      rowKey={(l) => l.Id}
      loading={logs.loading && !logs.data}
      error={logs.error}
      onRetry={logs.reload}
      server={{ total: logs.data?.Total ?? 0, page, pageSize: PAGE_SIZE, onPageChange: setPage }}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          {select(action, setAction, filters.data?.Actions, 'All actions')}
          {select(entity, setEntity, filters.data?.Entities, 'All entities')}
          <span className="text-xs text-slate-400">Click a row for old / new values · refreshes every 20 s</span>
        </div>
      }
      expandRow={(l) => (
        <div className="grid gap-3 md:grid-cols-2">
          <JsonBlock title="Old values" value={l.OldValues} />
          <JsonBlock title="New values" value={l.NewValues} />
        </div>
      )}
      emptyTitle="No audit entries"
    />
  )
}

function summarize(log: AuditLog): string {
  const keys = Object.keys(log.NewValues ?? log.OldValues ?? {}).filter((k) => !['Id', 'CreatedAt', 'CreatedBy', 'IsActive', 'IsDeleted'].includes(k))
  return keys.length ? keys.slice(0, 4).join(', ') + (keys.length > 4 ? ` +${keys.length - 4}` : '') : '—'
}

function JsonBlock({ title, value }: { title: string; value: Record<string, unknown> | null }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-500">{title}</p>
      <pre className="max-h-56 overflow-auto rounded-lg bg-ink p-3 text-xs text-emerald-200">{value ? JSON.stringify(value, null, 2) : '—'}</pre>
    </div>
  )
}
