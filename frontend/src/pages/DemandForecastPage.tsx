import { useBranch } from '../context/BranchContext'
import { PageHeader } from '../components/layout/AppLayout'
import { ErrorBanner, ShimmerSkeleton } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { branchAnalyticsApi } from '../services/endpoints'

export function DemandForecastPage() {
  const { selectedBranchId } = useBranch()
  const forecast = useApi(() => branchAnalyticsApi.demandForecast({ branch_id: selectedBranchId }), [selectedBranchId])
  const f = forecast.data
  const maxQty = Math.max(1, ...(f?.HourlyPattern.map((h) => h.AverageQuantityConsumed) ?? [1]))

  return (
    <>
      <PageHeader
        title="Demand Forecast"
        subtitle="Simple hourly consumption pattern and stocking suggestions — statistical, not a trained ML model"
      />
      {forecast.error && <ErrorBanner message={forecast.error} onRetry={forecast.reload} />}
      {forecast.loading && !f && <ShimmerSkeleton className="h-64" rounded="rounded-2xl" />}
      {f && (
        <>
          <div className="card mb-6 p-5">
            <p className="mb-4 text-sm font-medium text-slate-500">
              Average ingredient consumption by hour of day {f.PeakHour !== null && <>· peak at <b>{f.PeakHour.toString().padStart(2, '0')}:00</b></>}
            </p>
            <div className="flex h-40 items-end gap-1">
              {f.HourlyPattern.map((h) => (
                <div key={h.Hour} className="flex flex-1 flex-col items-center gap-1" title={`${h.Hour}:00 — ${h.AverageQuantityConsumed}`}>
                  <div
                    className={`w-full rounded-t ${h.Hour === f.PeakHour ? 'bg-brand-600' : 'bg-brand-200'}`}
                    style={{ height: `${Math.max(2, (h.AverageQuantityConsumed / maxQty) * 100)}%` }}
                  />
                  {h.Hour % 3 === 0 && <span className="text-[10px] text-slate-400">{h.Hour}</span>}
                </div>
              ))}
            </div>
          </div>

          <h2 className="mb-3 text-lg font-semibold text-ink">Stocking recommendations</h2>
          {f.Recommendations.length === 0 && <p className="text-sm text-slate-500">Not enough recent order-consumption history for this branch yet.</p>}
          <div className="space-y-3">
            {f.Recommendations.map((r, idx) => (
              <div key={idx} className="card p-4">
                <p className="font-medium text-ink">
                  {r.ItemName}: prep <b>{r.RecommendedPrepQuantity} {r.Unit}</b>
                </p>
                <p className="mt-1 text-sm text-slate-500">{r.Reasoning}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
