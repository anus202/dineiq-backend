import { motion } from 'framer-motion'
import type { CustomerMe } from '../../types/api'
import { count, money } from '../../utils/format'

const tierStyle: Record<string, { ring: string; chip: string; emoji: string }> = {
  Silver: { ring: 'from-slate-300 to-slate-500', chip: 'bg-slate-100 text-slate-700', emoji: '🥈' },
  Gold: { ring: 'from-amber-300 to-amber-500', chip: 'bg-amber-100 text-amber-800', emoji: '🥇' },
  Platinum: { ring: 'from-cyan-300 to-violet-500', chip: 'bg-violet-100 text-violet-800', emoji: '💎' },
}

/** Silver → Gold → Platinum bar; each tier's marker sits at its minimum points. */
export function LoyaltyProgress({ me }: { me: CustomerMe }) {
  const tiers = me.Tiers
  const top = tiers[tiers.length - 1]
  // The bar ends a little past the top tier so Platinum members still see movement.
  const scaleMax = Math.max(top.MinPoints * 1.25, me.LoyaltyPoints)
  const fill = Math.min(100, (me.LoyaltyPoints / scaleMax) * 100)
  const style = tierStyle[me.TierStatus.Tier] ?? tierStyle.Silver

  return (
    <div className="card overflow-hidden">
      <div className={`bg-gradient-to-r ${style.ring} px-6 py-5 text-white`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-white/80">Your tier</p>
            <p className="text-3xl font-semibold">
              {style.emoji} {me.TierStatus.Tier}
            </p>
            <p className="text-sm text-white/90">{me.TierStatus.DiscountPercentage}% off every bill</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-white/80">Points balance</p>
            <motion.p className="text-4xl font-bold" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              {count(me.LoyaltyPoints)}
            </motion.p>
            <p className="text-sm text-white/90">worth {money(me.PointsValue)}</p>
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        <div className="relative h-4 rounded-full bg-slate-100">
          <motion.div
            className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${style.ring}`}
            initial={{ width: 0 }}
            animate={{ width: `${fill}%` }}
            transition={{ duration: 1.1, ease: 'easeOut' }}
          />
          {tiers.map((tier) => {
            const at = (tier.MinPoints / scaleMax) * 100
            const reached = me.LoyaltyPoints >= tier.MinPoints
            return (
              <div key={tier.Name} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${Math.max(at, 1.5)}%` }}>
                <span className={`block h-6 w-6 rounded-full border-4 border-white shadow ${reached ? 'bg-brand-600' : 'bg-slate-300'}`} />
              </div>
            )
          })}
        </div>
        <div className="relative mt-3 h-10">
          {tiers.map((tier) => (
            <div key={tier.Name} className="absolute -translate-x-1/2 text-center" style={{ left: `${Math.max((tier.MinPoints / scaleMax) * 100, 4)}%` }}>
              <p className="text-xs font-semibold text-ink">{tier.Name}</p>
              <p className="text-[11px] text-slate-500">
                {count(tier.MinPoints)}+ · {tier.DiscountPercentage}%
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {me.TierStatus.NextTier ? (
            <>
              <b className="text-ink">{count(me.TierStatus.PointsToNextTier ?? 0)} points</b> to {me.TierStatus.NextTier}. You earn points on every bill paid by cash or card.
            </>
          ) : (
            <>You’re at the top tier. Keep your balance above {count(top.MinPoints)} points to stay Platinum.</>
          )}
        </p>
      </div>
    </div>
  )
}
