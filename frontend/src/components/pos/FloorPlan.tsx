import { motion } from 'framer-motion'
import type { DiningTable } from '../../types/api'
import { money, timeAgo } from '../../utils/format'
import { Badge, EmptyState, ShimmerSkeleton, statusTone } from '../ui'

interface Props {
  tables: DiningTable[]
  loading: boolean
  onSelect: (table: DiningTable) => void
}

const surface: Record<DiningTable['Status'], string> = {
  AVAILABLE: 'border-emerald-200 bg-emerald-50/60 hover:border-emerald-400',
  OCCUPIED: 'border-sky-300 bg-sky-50 hover:border-sky-500',
  RESERVED: 'border-amber-300 bg-amber-50/70 hover:border-amber-500',
}

export function FloorPlan({ tables, loading, onSelect }: Props) {
  if (loading && !tables.length) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <ShimmerSkeleton key={i} className="h-32" rounded="rounded-2xl" />
        ))}
      </div>
    )
  }
  if (!tables.length) return <EmptyState title="No tables yet" message="An admin can add tables with POST /api/v1/tables." icon="▦" />

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {tables.map((table) => {
        const seated = table.CurrentOrder
        const pax = seated?.GuestCount ?? 0
        return (
          <motion.button
            key={table.Id}
            layout
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(table)}
            className={`flex flex-col rounded-2xl border-2 p-4 text-left transition-colors ${surface[table.Status]}`}
            aria-label={`Table ${table.TableNumber}, ${table.Status.toLowerCase()}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-ink dark:text-white">{table.TableNumber}</span>
              <Badge tone={statusTone(table.Status)} dot>
                {table.Status}
              </Badge>
            </div>

            <div className="mt-3 flex flex-wrap gap-1" aria-hidden>
              {Array.from({ length: table.Capacity }, (_, i) => (
                <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < pax ? 'bg-sky-500' : 'bg-slate-300/80'}`} />
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
              Pax <b>{pax}</b> / {table.Capacity} seats
            </p>
            {seated ? (
              <p className="mt-1 truncate text-xs text-slate-500">
                <span className="font-mono">{seated.OrderNumber}</span> · {money(seated.NetAmount)} · {timeAgo(seated.OrderDate)}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-400">{table.Status === 'RESERVED' ? 'Held for a booking' : 'Tap to start an order'}</p>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}
