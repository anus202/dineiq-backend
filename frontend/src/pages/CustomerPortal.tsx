import { LoyaltyProgress } from '../components/customer/LoyaltyProgress'
import { OrderTracker } from '../components/customer/OrderTracker'
import { Recommendations } from '../components/customer/Recommendations'
import { PageHeader } from '../components/layout/AppLayout'
import { ErrorBanner, ShimmerSkeleton, StatsCard } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { customerPortalApi } from '../services/endpoints'
import { count, dateOnly, money } from '../utils/format'

export function CustomerPortal() {
  const me = useApi(() => customerPortalApi.me(), [], 30_000)
  const m = me.data

  return (
    <>
      <PageHeader title={m ? `Welcome back, ${m.Name.split(' ')[0]}` : 'My Rewards'} subtitle="Your points, tier, live orders and dishes picked for you" />
      {me.error && <ErrorBanner message={me.error} onRetry={me.reload} />}
      <div className="space-y-6">
        {m ? <LoyaltyProgress me={m} /> : !me.error && <ShimmerSkeleton className="h-64" rounded="rounded-2xl" />}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatsCard index={0} label="Completed orders" icon="🧾" loading={!m} value={m && count(m.TotalOrders)} hint={m?.LastOrderDate ? `Last on ${dateOnly(m.LastOrderDate)}` : undefined} />
          <StatsCard index={1} label="Total spent" icon="₨" tone="sky" loading={!m} value={m && money(m.TotalSpent)} />
          <StatsCard index={2} label="Member since" icon="★" tone="amber" loading={!m} value={m && dateOnly(m.MemberSince)} hint={m?.Phone} />
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <OrderTracker />
          <Recommendations />
        </div>
      </div>
    </>
  )
}
