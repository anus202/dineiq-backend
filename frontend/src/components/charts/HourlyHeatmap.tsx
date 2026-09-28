import { useState } from 'react'
import type { HeatmapCell, HourlyHeatmap as HeatmapData } from '../../types/api'
import { count, money } from '../../utils/format'
import { ShimmerSkeleton } from '../ui'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 24 }, (_, h) => h)

/** Teal ramp by share of the busiest cell. */
const cellColor = (orders: number, max: number): string => {
  if (!max || !orders) return 'rgb(241 245 249)'
  const t = orders / max
  const light = [204, 251, 241]
  const dark = [15, 118, 110]
  const mix = light.map((l, i) => Math.round(l + (dark[i] - l) * t))
  return `rgb(${mix.join(' ')})`
}

export function HourlyHeatmap({ data, loading }: { data?: HeatmapData; loading: boolean }) {
  const [hover, setHover] = useState<HeatmapCell | null>(null)
  const byKey = new Map(data?.Cells.map((c) => [`${c.DayOfWeek}-${c.Hour}`, c]))

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-ink dark:text-white">Hourly demand heatmap</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Completed orders by weekday and hour (00:00–23:00, local time), last 90 days</p>
        </div>
        {data?.BusiestSlot && (
          <p className="rounded-lg bg-brand-50 px-3 py-1.5 text-xs text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            Busiest: <b>{data.BusiestSlot.DayName}</b> at <b>{String(data.BusiestSlot.Hour).padStart(2, '0')}:00</b> ({count(data.BusiestSlot.Orders)} orders)
          </p>
        )}
      </div>
      {loading && !data ? (
        <ShimmerSkeleton className="h-56" rounded="rounded-xl" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <div className="grid min-w-[640px] gap-[3px]" style={{ gridTemplateColumns: '36px repeat(24, minmax(0, 1fr))' }}>
              <span />
              {HOURS.map((h) => (
                <span key={h} className="text-center text-[10px] text-slate-400 dark:text-slate-500">
                  {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
                </span>
              ))}
              {DAYS.map((day, d) => (
                <div key={day} className="contents">
                  <span className="self-center text-xs font-medium text-slate-500 dark:text-slate-400">{day}</span>
                  {HOURS.map((h) => {
                    const cell = byKey.get(`${d}-${h}`)
                    return (
                      <div
                        key={h}
                        onMouseEnter={() => cell && setHover(cell)}
                        onMouseLeave={() => setHover(null)}
                        className="aspect-square rounded-[4px] transition-transform hover:scale-125 hover:ring-2 hover:ring-brand-700"
                        style={{ background: cellColor(cell?.Orders ?? 0, data?.MaxOrders ?? 0) }}
                        title={cell ? `${cell.DayName} ${String(h).padStart(2, '0')}:00 — ${cell.Orders} orders` : undefined}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex h-5 items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              {hover
                ? `${hover.DayName} ${String(hover.Hour).padStart(2, '0')}:00 — ${count(hover.Orders)} orders, ${money(hover.Revenue)}`
                : 'Hover a cell for details'}
            </span>
            <span className="flex items-center gap-1">
              Less
              {[0.1, 0.35, 0.6, 0.85, 1].map((t) => (
                <span key={t} className="h-3 w-3 rounded-sm" style={{ background: cellColor(t, 1) }} />
              ))}
              More
            </span>
          </div>
        </>
      )}
    </div>
  )
}
