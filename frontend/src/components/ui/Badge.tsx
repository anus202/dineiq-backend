import type { ReactNode } from 'react'

export type BadgeTone = 'green' | 'yellow' | 'red' | 'blue' | 'gray' | 'purple' | 'teal'

const tones: Record<BadgeTone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-400/20',
  yellow: 'bg-amber-50 text-amber-700 ring-amber-600/25 dark:bg-amber-900/40 dark:text-amber-300 dark:ring-amber-400/20',
  red: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-900/40 dark:text-rose-300 dark:ring-rose-400/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-900/40 dark:text-sky-300 dark:ring-sky-400/20',
  gray: 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-500/30',
  purple: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-900/40 dark:text-violet-300 dark:ring-violet-400/20',
  teal: 'bg-brand-50 text-brand-700 ring-brand-600/20 dark:bg-brand-900/40 dark:text-brand-300 dark:ring-brand-400/20',
}

export function Badge({ tone = 'gray', children, dot = false }: { tone?: BadgeTone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/** Consistent colours for statuses used across the app. */
export const statusTone = (status: string): BadgeTone => {
  switch (status) {
    case 'AVAILABLE':
    case 'Completed':
    case 'MANUAL_ADDITION':
    case 'INITIAL_STOCK':
    case 'CREATE':
      return 'green'
    case 'RESERVED':
    case 'Pending':
    case 'UPDATE':
      return 'yellow'
    case 'OCCUPIED':
    case 'ORDER_CONSUMPTION':
      return 'blue'
    case 'Cancelled':
    case 'MANUAL_DEDUCTION':
    case 'DELETE':
      return 'red'
    case 'LOGIN':
      return 'purple'
    default:
      return 'gray'
  }
}
