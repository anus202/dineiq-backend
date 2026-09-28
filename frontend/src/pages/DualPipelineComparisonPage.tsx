import { PageHeader } from '../components/layout/AppLayout'
import { Badge, DataTable, ErrorBanner, StatsCard, type Column } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { mlAnalyticsApi } from '../services/endpoints'
import type {
  ClassifierMetrics,
  DemandForecastComparisonRecord,
  MenuClassComparisonRecord,
  RegressorMetrics,
} from '../types/api'

function pct(value: number, digits = 1): string {
  return `${(value * 100).toFixed(digits)}%`
}

function splitLabel(trainRows: number, testRows: number): string {
  const total = trainRows + testRows
  if (!total) return '—'
  const trainPct = Math.round((trainRows / total) * 100)
  return `${trainRows.toLocaleString()} train / ${testRows.toLocaleString()} test (${trainPct}/${100 - trainPct})`
}

function ClassifierCard({ title, metrics, isBest }: { title: string; metrics: ClassifierMetrics; isBest?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${isBest ? 'border-brand-400 bg-brand-50/50' : 'border-slate-200 bg-white'}`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="font-medium text-ink dark:text-white">{title}</p>
        {isBest && <Badge tone="green">Selected</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <span className="text-slate-500">Accuracy</span>
        <span className="text-right font-medium text-ink dark:text-white">{pct(metrics.accuracy)}</span>
        <span className="text-slate-500">Macro F1</span>
        <span className="text-right font-medium text-ink dark:text-white">{metrics.macro_f1.toFixed(3)}</span>
        <span className="text-slate-500">Weighted Precision</span>
        <span className="text-right text-ink dark:text-white">{pct(metrics.weighted_precision)}</span>
        <span className="text-slate-500">Weighted Recall</span>
        <span className="text-right text-ink dark:text-white">{pct(metrics.weighted_recall)}</span>
      </div>
      <p className="mt-2 text-xs text-slate-400">{splitLabel(metrics.train_rows, metrics.test_rows)}</p>
    </div>
  )
}

function RegressorCard({ title, metrics, extra }: { title: string; metrics: RegressorMetrics; extra?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white p-4">
      <p className="mb-2 font-medium text-ink dark:text-white">{title}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <span className="text-slate-500">MAE</span>
        <span className="text-right font-medium text-ink dark:text-white">{metrics.mae.toFixed(2)}</span>
        <span className="text-slate-500">RMSE</span>
        <span className="text-right text-ink dark:text-white">{metrics.rmse.toFixed(2)}</span>
        <span className="text-slate-500">MAPE</span>
        <span className="text-right text-ink dark:text-white">{metrics.mape_percent.toFixed(1)}%</span>
        {metrics.improvement_over_baseline_percent !== undefined && (
          <>
            <span className="text-slate-500">vs. naive baseline</span>
            <span className={`text-right font-medium ${metrics.improvement_over_baseline_percent >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {metrics.improvement_over_baseline_percent >= 0 ? '+' : ''}
              {metrics.improvement_over_baseline_percent.toFixed(1)}%
            </span>
          </>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-400">{splitLabel(metrics.train_rows, metrics.test_rows)}</p>
      {extra && <p className="mt-1 text-xs text-slate-400">{extra}</p>}
    </div>
  )
}

export function DualPipelineComparisonPage() {
  const result = useApi(() => mlAnalyticsApi.dualPipelineComparison(), [])
  const data = result.data

  const menuComparisonColumns: Column<MenuClassComparisonRecord>[] = [
    { key: 'item', header: 'Menu Item', render: (r) => <span className="font-medium text-ink dark:text-white">{r.menu_item_name}</span> },
    { key: 'actual', header: 'Actual', render: (r) => r.actual_class },
    { key: 'spark', header: 'Spark Prediction', render: (r) => r.spark_prediction },
    { key: 'python', header: 'Python Prediction', render: (r) => r.xgboost_prediction },
    {
      key: 'match',
      header: 'Match',
      render: (r) => <Badge tone={r.match ? 'green' : 'red'}>{r.match ? 'Match' : 'Mismatch'}</Badge>,
      sortValue: (r) => (r.match ? 1 : 0),
    },
    { key: 'reason', header: 'Disagreement Reason', render: (r) => <span className="text-xs text-slate-500">{r.disagreement_reason ?? '—'}</span> },
  ]

  const demandComparisonColumns: Column<DemandForecastComparisonRecord>[] = [
    { key: 'item', header: 'Menu Item', render: (r) => <span className="font-medium text-ink dark:text-white">{r.menu_item_name}</span> },
    { key: 'month', header: 'Month', render: (r) => r.year_month },
    { key: 'actual', header: 'Actual Qty', align: 'right', render: (r) => r.actual_next_month_quantity.toFixed(0), sortValue: (r) => r.actual_next_month_quantity },
    { key: 'spark', header: 'Spark Prediction', align: 'right', render: (r) => r.spark_prediction.toFixed(1), sortValue: (r) => r.spark_prediction },
    { key: 'python', header: 'Python Prediction', align: 'right', render: (r) => r.python_prediction.toFixed(1), sortValue: (r) => r.python_prediction },
    { key: 'diff', header: 'Difference', align: 'right', render: (r) => r.numerical_difference.toFixed(1), sortValue: (r) => r.numerical_difference },
    {
      key: 'match',
      header: 'Within Tolerance',
      render: (r) => <Badge tone={r.match ? 'green' : 'yellow'}>{r.match ? 'Agree' : 'Disagree'}</Badge>,
      sortValue: (r) => (r.match ? 1 : 0),
    },
  ]

  return (
    <>
      <PageHeader
        title="Dual-Pipeline Comparison"
        subtitle="Two independently engineered ML pipelines — Apache Spark MLlib and Python/XGBoost — trained separately on a 70/30 train/test split and cross-checked on unseen records (SRS Section 4)"
      />
      {result.error && <ErrorBanner message={result.error} onRetry={result.reload} />}

      {data && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatsCard
              index={0}
              label="Menu classification agreement"
              icon="🔀"
              value={`${data.comparison.menu_performance_classification.agreement_percent.toFixed(1)}%`}
            />
            <StatsCard
              index={1}
              label="Menu items compared"
              icon="🍽"
              value={data.comparison.menu_performance_classification.total_records}
            />
            <StatsCard
              index={2}
              label="Demand forecast records compared"
              icon="📈"
              value={data.comparison.demand_forecast_regression.total_records}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-ink dark:text-white">
                <span aria-hidden="true">⚡</span> PySpark + MLlib Pipeline
              </h2>
              <p className="mb-3 text-xs text-slate-500">
                {data.spark_pipeline.menu_performance_classification.candidates
                  ? `${Object.keys(data.spark_pipeline.menu_performance_classification.candidates).length} candidate models trained; best selected by macro F1.`
                  : null}
              </p>
              <div className="space-y-3">
                {Object.entries(data.spark_pipeline.menu_performance_classification.candidates).map(([key, metrics]) => (
                  <ClassifierCard
                    key={key}
                    title={metrics.display_name ?? key}
                    metrics={metrics}
                    isBest={key === data.spark_pipeline.menu_performance_classification.best_model}
                  />
                ))}
                <RegressorCard title="Demand Forecasting (GBTRegressor, chronological split)" metrics={data.spark_pipeline.demand_forecasting} />
              </div>
            </section>

            <section>
              <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-ink dark:text-white">
                <span aria-hidden="true">🐍</span> Python + Scikit-learn / XGBoost Pipeline
              </h2>
              <p className="mb-3 text-xs text-slate-500">Independent pandas/scikit-learn preprocessing and split, XGBoost estimators.</p>
              <div className="space-y-3">
                <ClassifierCard title="Menu Performance Classifier (XGBoost)" metrics={data.python_pipeline.menu_performance_classification} isBest />
                <RegressorCard title="Demand Forecasting (XGBoost, chronological split)" metrics={data.python_pipeline.demand_forecasting} />
                <RegressorCard title="Wastage Prediction (XGBoost)" metrics={data.python_pipeline.wastage_prediction} />
                <ClassifierCard title="Customer Churn-Risk Classifier (XGBoost)" metrics={data.python_pipeline.churn_risk_classification} isBest />
              </div>
            </section>
          </div>

          <h2 className="mt-8 mb-3 text-lg font-semibold text-ink dark:text-white">Menu performance: record-by-record agreement</h2>
          <p className="mb-3 text-sm text-slate-500">
            Spark accuracy vs. actual: <b>{data.comparison.menu_performance_classification.spark_accuracy_vs_actual.toFixed(1)}%</b> · Python accuracy
            vs. actual: <b>{data.comparison.menu_performance_classification.xgboost_accuracy_vs_actual.toFixed(1)}%</b> ·{' '}
            {data.comparison.menu_performance_classification.matched_count} matched / {data.comparison.menu_performance_classification.mismatched_count}{' '}
            mismatched
          </p>
          <div className="mb-8">
            <DataTable
              columns={menuComparisonColumns}
              rows={data.comparison.menu_performance_classification.comparisons}
              rowKey={(r) => r.menu_item_id}
              pageSize={15}
              searchText={(r) => r.menu_item_name}
              searchPlaceholder="Search menu items…"
              emptyTitle="No comparison records"
            />
          </div>

          <h2 className="mb-3 text-lg font-semibold text-ink dark:text-white">Demand forecast: record-by-record agreement</h2>
          <p className="mb-3 text-sm text-slate-500">
            Mean absolute difference between the two pipelines:{' '}
            <b>{data.comparison.demand_forecast_regression.mean_absolute_difference.toFixed(1)} units</b> ·{' '}
            {data.comparison.demand_forecast_regression.matched_count} within tolerance /{' '}
            {data.comparison.demand_forecast_regression.mismatched_count} outside tolerance
          </p>
          <DataTable
            columns={demandComparisonColumns}
            rows={data.comparison.demand_forecast_regression.records}
            rowKey={(r) => `${r.menu_item_id}-${r.year_month}`}
            pageSize={15}
            searchText={(r) => r.menu_item_name}
            searchPlaceholder="Search menu items…"
            emptyTitle="No comparison records"
          />
        </>
      )}
    </>
  )
}
