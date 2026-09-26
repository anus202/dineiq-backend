import { PageHeader } from '../components/layout/AppLayout'
import { ErrorBanner, ShimmerSkeleton } from '../components/ui'
import { ExportButtons } from '../components/common/ExportButtons'
import { useApi } from '../hooks/useApi'
import { mlAnalyticsApi } from '../services/endpoints'
import type { MarketBasketRule } from '../types/api'

export function MarketBasketPage() {
  const rules = useApi(() => mlAnalyticsApi.marketBasket(), [])

  return (
    <>
      <PageHeader
        title="Market Basket Analysis"
        subtitle="Which menu items are bought together, and how strongly (Support / Confidence / Lift)"
        actions={
          <ExportButtons<MarketBasketRule>
            filename="market_basket_rules"
            data={rules.data}
            columns={[
              { header: 'If bought', accessor: (r) => r.antecedent.join(', ') },
              { header: 'Then also bought', accessor: (r) => r.consequent.join(', ') },
              { header: 'Support', accessor: (r) => r.support },
              { header: 'Confidence', accessor: (r) => r.confidence },
              { header: 'Lift', accessor: (r) => r.lift },
            ]}
          />
        }
      />
      {rules.error && <ErrorBanner message={rules.error} onRetry={rules.reload} />}
      {rules.loading && !rules.data && <ShimmerSkeleton className="h-64" rounded="rounded-2xl" />}
      {rules.data?.length === 0 && (
        <p className="text-sm text-slate-500">
          No association rules meet the confidence/lift thresholds yet — this grows more meaningful as the analytics pipeline is
          re-run against more order history.
        </p>
      )}
      <div className="space-y-3">
        {rules.data?.map((r, idx) => (
          <div key={idx} className="card p-4">
            <p className="font-medium text-ink">
              {r.antecedent.join(', ')} → {r.consequent.join(', ')}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Lift {r.lift.toFixed(2)}x · Confidence {(r.confidence * 100).toFixed(0)}% · Support {(r.support * 100).toFixed(1)}%
            </p>
          </div>
        ))}
      </div>
    </>
  )
}
