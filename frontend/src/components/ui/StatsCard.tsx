import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { ShimmerSkeleton } from './ShimmerSkeleton'

export interface StatsCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'teal' | 'amber' | 'rose' | 'sky' | 'violet' | 'slate'
  loading?: boolean
  index?: number
  /** A real recent-history series (e.g. last N days of this metric) to draw as a tiny
   * inline trend line. Omit rather than fabricate one when no such history exists. */
  sparkline?: number[]
  /** A real period-over-period change (e.g. today vs yesterday), as a signed percentage.
   * Omit rather than compute one from data that doesn't actually support it. */
  trend?: number
}

const toneClasses = {
  teal: 'bg-brand-50 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  sky: 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

const sparkColor: Record<StatsCardProps['tone'] & string, string> = {
  teal: '#0d9488',
  amber: '#d97706',
  rose: '#e11d48',
  sky: '#0284c7',
  violet: '#7c3aed',
  slate: '#475569',
}

/** Tiny inline SVG trend line from a handful of real data points -- no chart library
 * needed for something this small. */
function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 1
  const w = 100
  const h = 28
  const coords = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p - min) / range) * (h - 4) - 2}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2.5 h-7 w-full">
      <motion.polyline
        points={coords}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: 'easeOut', delay: 0.3 }}
      />
    </svg>
  )
}

export function StatsCard({ label, value, hint, icon, tone = 'teal', loading = false, index = 0, sparkline, trend }: StatsCardProps) {
  return (
    <motion.div
      className="card group relative overflow-hidden p-5"
      style={{ transformPerspective: 1000 }}
      initial={{ opacity: 0, y: 34, scale: 0.9, rotateX: -18 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
      transition={{ delay: index * 0.08, type: 'spring', stiffness: 220, damping: 20 }}
      whileHover={{ y: -6, scale: 1.015, transition: { type: 'spring', stiffness: 400, damping: 18 } }}
    >
      {/* one-shot light sweep across the card on first mount -- a small, tasteful nod to
          the "attractive" ask without becoming a permanent distraction. */}
      <motion.div
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/10"
        animate={{ x: ['-100%', '160%'] }}
        transition={{ duration: 1.1, delay: 0.25 + index * 0.08, ease: 'easeInOut' }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
        {icon && (
          <motion.span
            whileHover={{ scale: 1.18, rotate: -8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 12 }}
            className={`flex h-9 w-9 items-center justify-center rounded-xl text-base shadow-sm transition-shadow group-hover:shadow-md ${toneClasses[tone]}`}
          >
            {icon}
          </motion.span>
        )}
      </div>
      {loading ? (
        <ShimmerSkeleton className="relative mt-3 h-8 w-32" />
      ) : (
        <>
          <div className="relative mt-2 flex items-baseline gap-2">
            <motion.p
              key={String(value)}
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="text-2xl font-semibold tracking-tight text-ink dark:text-white"
            >
              {value}
            </motion.p>
            {trend !== undefined && (
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                  trend >= 0
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                }`}
              >
                {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
              </span>
            )}
          </div>
          {sparkline && sparkline.length > 1 && <Sparkline points={sparkline} color={sparkColor[tone]} />}
        </>
      )}
      {hint && !loading && <p className="relative mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </motion.div>
  )
}
