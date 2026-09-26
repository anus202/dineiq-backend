import { PageHeader } from '../components/layout/AppLayout'
import { Badge, ErrorBanner, ShimmerSkeleton } from '../components/ui'
import { ExportButtons } from '../components/common/ExportButtons'
import { useApi } from '../hooks/useApi'
import { mlAnalyticsApi } from '../services/endpoints'
import type { PromotionTrapItem } from '../types/api'

function priorityTone(priority: string) {
  if (priority === 'CRITICAL' || priority === 'HIGH') return 'red' as const
  if (priority === 'MEDIUM') return 'yellow' as const
  return 'blue' as const
}

export function PromotionTrapsPage() {
  const traps = useApi(() => mlAnalyticsApi.promotionTraps(), [])

  return (
    <>
      <PageHeader
        title="Promotion Traps"
        subtitle="Promotions that grew sales volume while quietly destroying margin"
        actions={
          <ExportButtons<PromotionTrapItem>
            filename="promotion_traps"
            data={traps.data}
            columns={[
              { header: 'Promotion', accessor: (r) => r.promotion_name },
              { header: 'Menu Item', accessor: (r) => r.menu_item_name },
              { header: 'Revenue Lift %', accessor: (r) => r.revenue_lift_percent },
              { header: 'Volume Lift %', accessor: (r) => r.volume_lift_percent },
              { header: 'Margin %', accessor: (r) => r.margin_percent },
              { header: 'Severity', accessor: (r) => r.severity },
            ]}
          />
        }
      />
      {traps.error && <ErrorBanner message={traps.error} onRetry={traps.reload} />}
      {traps.loading && !traps.data && <ShimmerSkeleton className="h-64" rounded="rounded-2xl" />}
      {traps.data?.length === 0 && <p className="text-sm text-slate-500">No promotion traps detected.</p>}
      <div className="space-y-3">
        {traps.data?.map((t, idx) => (
          <div key={idx} className="card p-4">
            <div className="mb-1 flex items-center justify-between gap-3">
              <p className="font-medium text-ink">
                {t.promotion_name} — {t.menu_item_name}
              </p>
              <Badge tone={priorityTone(t.severity)}>{t.severity}</Badge>
            </div>
            <p className="text-sm text-slate-500">
              Volume +{t.volume_lift_percent.toFixed(1)}% but margin dropped to {t.margin_percent.toFixed(1)}%
            </p>
          </div>
        ))}
      </div>
    </>
  )
}
