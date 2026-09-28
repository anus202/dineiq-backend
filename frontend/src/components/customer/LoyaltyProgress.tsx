import { motion } from 'framer-motion'
import type { CustomerMe } from '../../types/api'
import { count, money } from '../../utils/format'

const tierEmoji: Record<string, string> = { Silver: '🥈', Gold: '🥇', Platinum: '💎' }

/** Silver → Gold → Platinum progress, styled to match the rest of the dashboard's plain
 * white stat-card look (no tier-colored banner) instead of standing out as its own
 * theme. */
export function LoyaltyProgress({ me }: { me: CustomerMe }) {
  const tiers = me.Tiers
  const top = tiers[tiers.length - 1]
  // The bar ends a little past the top tier so Platinum members still see movement.
  const scaleMax = Math.max(top.MinPoints * 1.25, me.LoyaltyPoints)
  const fill = Math.min(100, (me.LoyaltyPoints / scaleMax) * 100)
  const emoji = tierEmoji[me.TierStatus.Tier] ?? '🥈'

  return (
    <div className="card p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-base text-brand-700">{emoji}</span>
          <p className="mt-2.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Your tier</p>
          <p className="mt-0.5 text-xl font-bold text-ink dark:text-white">{me.TierStatus.Tier}</p>
          <span className="mt-1 inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">{me.TierStatus.DiscountPercentage}% off every bill</span>
        </div>
        <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-base text-amber-700">★</span>
          <p className="mt-2.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Points balance</p>
          <motion.p className="mt-0.5 text-xl font-bold text-ink dark:text-white" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            {count(me.LoyaltyPoints)}
          </motion.p>
          <p className="mt-1 text-xs text-slate-500">worth {money(me.PointsValue)}</p>
        </div>
        <div className="rounded-xl border border-slate-100 dark:border-slate-800 p-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-base text-sky-700">→</span>
          <p className="mt-2.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">Next tier</p>
          <p className="mt-0.5 text-xl font-bold text-ink dark:text-white">{me.TierStatus.NextTier ?? 'Top tier'}</p>
          <p className="mt-1 text-xs text-slate-500">
            {me.TierStatus.NextTier ? `${count(me.TierStatus.PointsToNextTier ?? 0)} points to go` : `Stay above ${count(top.MinPoints)} pts`}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <div className="relative h-2 rounded-full bg-slate-100">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-teal-300 to-brand-600"
            initial={{ width: 0 }}
            animate={{ width: `${fill}%` }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
          />
          {tiers.map((tier) => {
            const at = (tier.MinPoints / scaleMax) * 100
            const reached = me.LoyaltyPoints >= tier.MinPoints
            return (
              <div key={tier.Name} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${Math.max(at, 1.5)}%` }}>
                <span className={`block h-3.5 w-3.5 rounded-full border-2 border-white shadow ${reached ? 'bg-brand-600' : 'bg-slate-300'}`} />
              </div>
            )
          })}
        </div>
        <div className="relative mt-3 h-10">
          {tiers.map((tier) => (
            <div key={tier.Name} className="absolute -translate-x-1/2 text-center" style={{ left: `${Math.max((tier.MinPoints / scaleMax) * 100, 4)}%` }}>
              <p className="text-xs font-semibold text-ink dark:text-white">{tier.Name}</p>
              <p className="text-[11px] text-slate-500">
                {count(tier.MinPoints)}+ · {tier.DiscountPercentage}%
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
