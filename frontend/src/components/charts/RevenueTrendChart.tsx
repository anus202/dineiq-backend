import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { RevenueChart } from '../../types/api'
import { count, money, moneyCompact } from '../../utils/format'
import { ShimmerSkeleton } from '../ui'

type View = 'Daily' | 'Monthly'

export function RevenueTrendChart({ data, loading }: { data?: RevenueChart; loading: boolean }) {
  const [view, setView] = useState<View>('Daily')
  const points = (data?.[view] ?? []).map((p) => ({
    ...p,
    label: view === 'Daily' ? p.Period.slice(5) : new Date(`${p.Period}-01T00:00:00`).toLocaleDateString('en', { month: 'short', year: '2-digit' }),
  }))

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-ink">Revenue trend</h3>
          <p className="text-xs text-slate-500">Completed orders, net of discounts</p>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
          {(['Daily', 'Monthly'] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1 font-medium ${view === v ? 'bg-white text-ink shadow-sm' : 'text-slate-500'}`}>
              {v}
            </button>
          ))}
        </div>
      </div>
      {loading && !data ? (
        <ShimmerSkeleton className="h-64" rounded="rounded-xl" />
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ left: 4, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis tickFormatter={moneyCompact} tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} axisLine={false} width={70} />
              <Tooltip
                formatter={(value, name) => (name === 'Revenue' ? money(Number(value)) : count(Number(value)))}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.Period ?? ''}
                contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
              />
              <Area type="monotone" dataKey="Revenue" stroke="#0d9488" strokeWidth={2} fill="url(#revenueFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
