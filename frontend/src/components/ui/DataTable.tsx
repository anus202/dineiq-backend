import { AnimatePresence, motion } from 'framer-motion'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { ErrorBanner, EmptyState } from './EmptyState'
import { SkeletonRows } from './ShimmerSkeleton'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode

  sortValue?: (row: T) => string | number
  align?: 'left' | 'right' | 'center'
  className?: string
}

export interface ServerPaging {
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  search?: string
  onSearchChange?: (value: string) => void
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  loading?: boolean
  error?: string | null
  onRetry?: () => void

  searchText?: (row: T) => string
  searchPlaceholder?: string
  pageSize?: number
  server?: ServerPaging
  onRowClick?: (row: T) => void
  expandRow?: (row: T) => ReactNode
  toolbar?: ReactNode
  emptyTitle?: string
  emptyMessage?: string
}

type SortState = { key: string; direction: 'asc' | 'desc' } | null

const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' }

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error,
  onRetry,
  searchText,
  searchPlaceholder = 'Search…',
  pageSize = 10,
  server,
  onRowClick,
  expandRow,
  toolbar,
  emptyTitle = 'Nothing here yet',
  emptyMessage,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<SortState>(null)
  const [localSearch, setLocalSearch] = useState('')
  const [localPage, setLocalPage] = useState(1)
  const [expanded, setExpanded] = useState<string | number | null>(null)

  const processed = useMemo(() => {
    if (server) return rows
    let result = rows
    const term = localSearch.trim().toLowerCase()
    if (term && searchText) result = result.filter((row) => searchText(row).toLowerCase().includes(term))
    const column = sort && columns.find((c) => c.key === sort.key)
    if (sort && column?.sortValue) {
      const value = column.sortValue
      result = [...result].sort((a, b) => {
        const va = value(a)
        const vb = value(b)
        const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
        return sort.direction === 'asc' ? cmp : -cmp
      })
    }
    return result
  }, [rows, server, localSearch, searchText, sort, columns])

  const total = server ? server.total : processed.length
  const size = server ? server.pageSize : pageSize
  const page = server ? server.page : Math.min(localPage, Math.max(1, Math.ceil(total / size)))
  const pages = Math.max(1, Math.ceil(total / size))
  const visible = server ? processed : processed.slice((page - 1) * size, page * size)
  const setPage = (p: number) => (server ? server.onPageChange(p) : setLocalPage(p))

  const searchValue = server ? (server.search ?? '') : localSearch
  const showSearch = server ? Boolean(server.onSearchChange) : Boolean(searchText)
  const onSearch = (value: string) => {
    if (server?.onSearchChange) server.onSearchChange(value)
    else {
      setLocalSearch(value)
      setLocalPage(1)
    }
  }

  const toggleSort = (column: Column<T>) => {
    if (!column.sortValue || server) return
    setSort((current) =>
      current?.key !== column.key ? { key: column.key, direction: 'asc' } : current.direction === 'asc' ? { key: column.key, direction: 'desc' } : null,
    )
  }

  return (
    <div className="card overflow-hidden">
      {(showSearch || toolbar) && (
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          {showSearch && (
            <div className="relative min-w-56 flex-1">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400 dark:text-slate-500">⌕</span>
              <input
                value={searchValue}
                onChange={(e) => onSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="field-input pl-8"
                aria-label="Search table"
              />
            </div>
          )}
          {toolbar}
        </div>
      )}

      {error && (
        <div className="p-4">
          <ErrorBanner message={error} onRetry={onRetry} />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs tracking-wide text-slate-500 uppercase dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  onClick={() => toggleSort(column)}
                  className={`px-4 py-3 font-medium whitespace-nowrap ${alignClass[column.align ?? 'left']} ${column.sortValue && !server ? 'cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200' : ''}`}
                  aria-sort={sort?.key === column.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {column.header}
                  {sort?.key === column.key && <span className="ml-1">{sort.direction === 'asc' ? '▲' : '▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 dark:text-slate-200">
            {!loading &&
              visible.map((row, rowIndex) => {
                const key = rowKey(row)
                const isOpen = expanded === key
                return (
                  <Fragment key={key}>
                    <motion.tr
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(rowIndex, 12) * 0.025, duration: 0.25 }}
                      onClick={() => {
                        if (expandRow) setExpanded(isOpen ? null : key)
                        onRowClick?.(row)
                      }}
                      className={`transition-colors ${onRowClick || expandRow ? 'cursor-pointer hover:bg-brand-50/50 dark:hover:bg-brand-900/20' : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'} ${isOpen ? 'bg-brand-50/40 dark:bg-brand-900/20' : ''}`}
                    >
                      {columns.map((column) => (
                        <td key={column.key} className={`px-4 py-3 align-middle ${alignClass[column.align ?? 'left']} ${column.className ?? ''}`}>
                          {column.render(row)}
                        </td>
                      ))}
                    </motion.tr>
                    <AnimatePresence>
                      {expandRow && isOpen && (
                        <tr>
                          <td colSpan={columns.length} className="bg-slate-50 p-0 dark:bg-slate-800/60">
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                              <div className="px-4 py-3">{expandRow(row)}</div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </Fragment>
                )
              })}
          </tbody>
        </table>
        {loading && <SkeletonRows rows={Math.min(size, 6)} cols={Math.min(columns.length, 6)} />}
        {!loading && !error && visible.length === 0 && <EmptyState title={emptyTitle} message={emptyMessage} />}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span>
          {total === 0 ? 'No results' : `Showing ${(page - 1) * size + 1}–${Math.min(page * size, total)} of ${total.toLocaleString('en')}`}
        </span>
        <div className="flex items-center gap-1">
          <PagerButton label="«" disabled={page <= 1 || loading} onClick={() => setPage(1)} />
          <PagerButton label="‹ Prev" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)} />
          <span className="px-2 font-medium text-slate-700 dark:text-slate-300">
            Page {page.toLocaleString('en')} of {pages.toLocaleString('en')}
          </span>
          <PagerButton label="Next ›" disabled={page >= pages || loading} onClick={() => setPage(page + 1)} />
          <PagerButton label="»" disabled={page >= pages || loading} onClick={() => setPage(pages)} />
        </div>
      </div>
    </div>
  )
}

function PagerButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md px-2 py-1 font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      {label}
    </button>
  )
}
