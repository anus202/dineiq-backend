import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTheme } from '../../context/ThemeContext'
import type { RevenueChart } from '../../types/api'
import { count, money, moneyCompact } from '../../utils/format'
import { ShimmerSkeleton } from '../ui'

type View = 'Daily' | 'Monthly'

export function RevenueTrendChart({ data, loading }: { data?: RevenueChart; loading: boolean }) {
  const [view, setView] = useState<View>('Daily')
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const gridStroke = isDark ? '#334155' : '#e2e8f0'
  const tickFill = isDark ? '#94a3b8' : '#64748b'
  const points = (data?.[view] ?? []).map((p) => ({
    ...p,
    label: view === 'Daily' ? p.Period.slice(5) : new Date(`${p.Period}-01T00:00:00`).toLocaleDateString('en', { month: 'short', year: '2-digit' }),
  }))

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-ink dark:text-white">Revenue trend</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">Completed orders, net of discounts</p>
        </div>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs dark:bg-slate-800">
          {(['Daily', 'Monthly'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                view === v ? 'bg-white text-ink shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
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
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: tickFill }} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis tickFormatter={moneyCompact} tick={{ fontSize: 11, fill: tickFill }} tickLine={false} axisLine={false} width={70} />
              <Tooltip
                formatter={(value, name) => (name === 'Revenue' ? money(Number(value)) : count(Number(value)))}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.Period ?? ''}
                contentStyle={{
                  borderRadius: 12,
                  border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
                  background: isDark ? '#1e293b' : '#fff',
                  color: isDark ? '#f1f5f9' : '#0f172a',
                }}
              />
              <Area type="monotone" dataKey="Revenue" stroke="#0d9488" strokeWidth={2} fill="url(#revenueFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
