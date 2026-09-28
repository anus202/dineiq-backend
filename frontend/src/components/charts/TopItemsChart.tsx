import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTheme } from '../../context/ThemeContext'
import type { TopPerforming } from '../../types/api'
import { count, money, moneyCompact, percent } from '../../utils/format'
import { Badge, ShimmerSkeleton } from '../ui'

export function TopItemsChart({ data, loading }: { data?: TopPerforming; loading: boolean }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const gridStroke = isDark ? '#334155' : '#e2e8f0'
  const axisTick = isDark ? '#94a3b8' : '#64748b'
  const categoryTick = isDark ? '#e2e8f0' : '#334155'

  return (
    <div className="card p-5">
      <h3 className="font-semibold text-ink dark:text-white">Top performers</h3>
      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
        Top 5 dishes by revenue and the highest-spending customer segments{data ? `, last ${data.PeriodDays} days` : ''}
      </p>
      {loading && !data ? (
        <ShimmerSkeleton className="h-64" rounded="rounded-xl" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="h-60 lg:col-span-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.TopItems ?? []} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                <XAxis type="number" tickFormatter={moneyCompact} tick={{ fontSize: 11, fill: axisTick }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="MenuItemName" width={140} tick={{ fontSize: 11, fill: categoryTick }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value) => money(Number(value))}
                  labelFormatter={(label, payload) => `${label} · ${count(payload?.[0]?.payload?.QuantitySold ?? 0)} sold`}
                  contentStyle={{
                    borderRadius: 12,
                    border: `1px solid ${gridStroke}`,
                    background: isDark ? '#1e293b' : '#fff',
                    color: isDark ? '#f1f5f9' : '#0f172a',
                  }}
                />
                <Bar dataKey="Revenue" fill="#0d9488" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-3 lg:col-span-2">
            {data?.TopSpendingSegments.map((s, i) => (
              <li key={s.Segment} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink dark:text-white">
                    {i + 1}. {s.Segment}
                  </span>
                  <Badge tone={i === 0 ? 'teal' : 'gray'}>{percent(s.ShareOfCustomersPercentage)} of buyers</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {count(s.Customers)} customers · {money(s.Revenue)} revenue
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
