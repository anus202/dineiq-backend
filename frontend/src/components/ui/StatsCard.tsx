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
      className="card group relative overflow-hidden p-5"
      initial={{ opacity: 0, y: 26, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.07, type: 'spring', stiffness: 260, damping: 20 }}
      whileHover={{ y: -6, scale: 1.015, transition: { type: 'spring', stiffness: 400, damping: 18 } }}
    >
      {/* one-shot light sweep across the card on first mount -- a small, tasteful nod to
          the "attractive" ask without becoming a permanent distraction. */}
      <motion.div
        className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/10"
        animate={{ x: ['-100%', '160%'] }}
        transition={{ duration: 1.1, delay: 0.15 + index * 0.07, ease: 'easeInOut' }}
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
        <motion.p
          key={String(value)}
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="relative mt-2 text-2xl font-semibold tracking-tight text-ink dark:text-white"
        >
          {value}
        </motion.p>
      )}
      {hint && !loading && <p className="relative mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </motion.div>
  )
}
