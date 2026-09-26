import { useState } from 'react'
import type { RFMMatrix as RFMData, RFMMatrixCell } from '../../types/api'
import { count, money } from '../../utils/format'
import { ShimmerSkeleton } from '../ui'

type Axis = 'Frequency' | 'Monetary'

const shade = (value: number, max: number): string => {
  if (!max || !value) return 'rgb(248 250 252)'
  const t = Math.sqrt(value / max) // sqrt: small cells stay visible next to one huge cell
  return `rgba(13, 148, 136, ${0.08 + t * 0.85})`
}

export function RFMMatrix({ data, loading }: { data?: RFMData; loading: boolean }) {
  const [axis, setAxis] = useState<Axis>('Monetary')
  const cells: RFMMatrixCell[] = (axis === 'Frequency' ? data?.FrequencyMatrix : data?.MonetaryMatrix) ?? []
  const max = Math.max(0, ...cells.map((c) => c.Customers))
  const cell = (r: number, s: number) => cells.find((c) => c.RScore === r && c.Score === s)

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-ink">Customer RFM matrix</h3>
          <p className="text-xs text-slate-500">
            {data ? `${count(data.PurchasingCustomers)} purchasing customers` : 'Scores 1–5 relative to all purchasing customers'}
          </p>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
          {(['Monetary', 'Frequency'] as Axis[]).map((a) => (
            <button key={a} onClick={() => setAxis(a)} className={`rounded-md px-3 py-1 font-medium ${axis === a ? 'bg-white text-ink shadow-sm' : 'text-slate-500'}`}>
              R × {a[0]}
            </button>
          ))}
        </div>
      </div>
      {loading && !data ? (
        <ShimmerSkeleton className="h-64" rounded="rounded-xl" />
      ) : (
        <div className="flex gap-3">
          <div className="flex flex-col justify-center">
            <span className="-rotate-90 text-xs font-medium whitespace-nowrap text-slate-500">{axis} score →</span>
          </div>
          <div className="flex-1">
            <div className="grid grid-cols-5 gap-1.5">
              {[5, 4, 3, 2, 1].map((s) =>
                [1, 2, 3, 4, 5].map((r) => {
                  const c = cell(r, s)
                  const strong = c && max && c.Customers / max > 0.45
                  return (
                    <div
                      key={`${r}-${s}`}
                      className="flex aspect-[4/3] flex-col items-center justify-center rounded-lg text-center transition-transform hover:scale-105"
                      style={{ background: shade(c?.Customers ?? 0, max) }}
                      title={c ? `R${r} ${axis[0]}${s}: ${c.Customers} customers, avg ${money(c.AverageMonetary)}` : undefined}
                    >
                      <span className={`text-sm font-semibold ${strong ? 'text-white' : 'text-ink'}`}>{count(c?.Customers ?? 0)}</span>
                      <span className={`text-[10px] ${strong ? 'text-white/80' : 'text-slate-500'}`}>{c?.Customers ? money(c.AverageMonetary) : '—'}</span>
                    </div>
                  )
                }),
              )}
            </div>
            <div className="mt-2 grid grid-cols-5 text-center text-xs text-slate-500">
              {[1, 2, 3, 4, 5].map((r) => (
                <span key={r}>R{r}</span>
              ))}
            </div>
            <p className="mt-1 text-center text-xs font-medium text-slate-500">Recency score → (5 = most recent)</p>
          </div>
        </div>
      )}
    </div>
  )
}
