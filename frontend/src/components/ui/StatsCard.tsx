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
}

const toneClasses = {
  teal: 'bg-brand-50 text-brand-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
  sky: 'bg-sky-50 text-sky-700',
  violet: 'bg-violet-50 text-violet-700',
  slate: 'bg-slate-100 text-slate-700',
}

export function StatsCard({ label, value, hint, icon, tone = 'teal', loading = false, index = 0 }: StatsCardProps) {
  return (
    <motion.div
      className="card p-5"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ y: -2 }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {icon && <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-base ${toneClasses[tone]}`}>{icon}</span>}
      </div>
      {loading ? (
        <ShimmerSkeleton className="mt-3 h-8 w-32" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      )}
      {hint && !loading && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </motion.div>
  )
}
