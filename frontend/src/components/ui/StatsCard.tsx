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
  teal: 'bg-brand-50 text-brand-700 dark:bg-brand-900/50 dark:text-brand-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  sky: 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

export function StatsCard({ label, value, hint, icon, tone = 'teal', loading = false, index = 0 }: StatsCardProps) {
  return (
    <motion.div
      className="card p-5"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ y: -3 }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
        {icon && (
          <motion.span
            whileHover={{ scale: 1.12, rotate: -4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className={`flex h-9 w-9 items-center justify-center rounded-xl text-base ${toneClasses[tone]}`}
          >
            {icon}
          </motion.span>
        )}
      </div>
      {loading ? (
        <ShimmerSkeleton className="mt-3 h-8 w-32" />
      ) : (
        <motion.p
          key={String(value)}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 text-2xl font-semibold tracking-tight text-ink dark:text-white"
        >
          {value}
        </motion.p>
      )}
      {hint && !loading && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </motion.div>
  )
}
