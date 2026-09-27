# AI Tool Usage Declaration — DineIQ Analytics

Required by the SRS, Section 1.8 (items 13–16) and Deliverable 16. This file covers the
whole repository: `backend/`, `frontend/`, and `analytics-pipeline/`. The pipeline's own
[analytics-pipeline/AI_USAGE.md](analytics-pipeline/AI_USAGE.md) adds pipeline-specific
detail and remains valid.

> **Team action required before submission:** the "Verified by" column below must be
> filled in by the team member who actually reviewed, understood and tested each module.
> It is left blank on purpose — it must not be filled in by an AI tool.

## 1. Tools used

| Tool | Vendor | Models | Where |
|---|---|---|---|
| Claude Code (CLI and desktop app) | Anthropic | Claude Sonnet, Claude Opus | Whole repository, during development |

No other AI coding tools were used. No AI-generated images are included in the app.

## 2. No AI in the running application

The application does **not** call any generative-AI or external decision API at run
time (SRS 1.8 item 16). Verified by searching the source tree (excluding dependency
folders) for `anthropic`, `openai`, `generativeai`, `langchain` and `gemini`: the only
match is the pipeline's own `AI_USAGE.md`.

Every analytic, prediction, classification, recommendation and forecast is produced by
the project's own code:

- SQL aggregations in `backend/app/services/`
- PySpark / Spark SQL / Spark MLlib jobs in `analytics-pipeline/spark_jobs/`
- pandas / scikit-learn / XGBoost / mlxtend in `analytics-pipeline/python_pipeline/` and
  `analytics-pipeline/src/analytics/`

## 3. Purpose and type of assistance

Claude Code was used as a pair programmer. The project owner supplied the SRS, the
existing SQL Server database, and a sequence of prompts that set scope and priorities.
Claude Code then:

- wrote first drafts of modules, endpoints, pages and scripts;
- ran them, read the errors and logs, and debugged them;
- audited the codebase against the SRS and reported gaps;
- ran data-generation and training jobs and reported the resulting metrics.

The main prompts, in order, were:

1. Refactor the React app to sidebar-only navigation (no horizontal tabs or form modals).
2. Implement role-based access control and branch-scoped dashboards across 30+ branches.
3. Audit the codebase against the SRS; report completion by module.
4. Auto-create the database and seed the default admin on FastAPI startup.
5. Phase 1: make the PySpark ingestion + dual Spark/Python pipeline run on Windows.
6. Phase 2: scale the live database to 1M+ order lines, 100k+ ratings, 50k+ wastage
   records; add a Promotions table.
7. Phase 3: expose ML outputs through FastAPI; build the What-If simulator; add CSV/Excel
   export.
8. Close remaining SRS gaps: full-scale pipeline run, chronological split, 100+ record
   dual-pipeline comparison, rating anomalies, slow-moving dishes, wastage-risk and
   demand-forecast endpoints, pricing history, this file, and the test suite.

## 4. Files and modules affected

| Area | Files / modules | AI assistance | Verified by |
|---|---|---|---|
| RBAC and branch scoping | `backend/app/core/roles.py`, `backend/app/core/dependencies.py` (`branch_scope`), `frontend/src/context/BranchContext.tsx` | Drafted, then tested with scoped and admin logins | |
| Branch analytics | `backend/app/services/branch_analytics_service.py`, `backend/app/controllers/branch_analytics_controller.py` | Drafted and debugged | |
| Startup DB creation and seeding | `backend/app/db/init_db.py`, `backend/app/db/migrations.py` | Drafted (admin seeding, branch backfills) | |
| Promotions model | `backend/app/models/promotion.py` | Drafted | |
| Data-scaling scripts | `backend/scripts/scale_bigdata_seed.py`, `backend/scripts/seed_pricing_history.py` | Drafted and executed | |
| ML analytics API | `backend/app/services/ml_analytics_service.py`, `backend/app/controllers/ml_analytics_controller.py`, `backend/app/schemas/ml_analytics_schema.py` | Drafted and debugged | |
| Frontend pages | `frontend/src/pages/` — ML Recommendations, Market Basket, Price Sensitivity, Promotion Traps, Churn Risk, Rating Anomalies, Slow-Moving Dishes, Forecast Dashboard, What-If Simulator, branch dashboards | Drafted | |
| Export | `frontend/src/utils/exportData.ts`, `frontend/src/components/common/ExportButtons.tsx` | Drafted | |
| Spark pipeline | `analytics-pipeline/data_pipeline/ingest_sql_data.py`, `analytics-pipeline/spark_jobs/*.py` | Drafted and debugged | |
| Python pipeline | `analytics-pipeline/python_pipeline/train_python_models.py` | Drafted and debugged | |
| Dual-pipeline verifier | `analytics-pipeline/src/analytics/dual_pipeline_verifier.py` | Drafted and extended | |
| Pipeline config | `analytics-pipeline/config/settings.py` | Windows / PySpark fixes | |
| Tests | `tests/` | Drafted and run | |

## 5. Modifications made after AI output

AI-drafted code did not ship as first written. Defects found by running it, and the fixes:

| Defect found in testing | Fix |
|---|---|
| PySpark workers crashed on Windows (`WinError 10038`) | Root cause: PySpark started workers with a different Python install than the driver. `config/settings.py` now pins `PYSPARK_PYTHON` to `sys.executable`. |
| `PipelineModel.load()` crashed on Windows | Metadata is now read from the local file instead of through `sc.textFile(...)`. |
| `createDataFrame(pandas)` / `.toPandas()` crashed on Windows | Ingestion and scoring now pass data through local Parquet files. |
| `pyspark.ml` failed to import on Python 3.12 (`distutils` removed) | Added `setuptools<81` to `requirements-bigdata.txt`. |
| Demand model used a random train/test split (data leakage) | Added the `menu_item_monthly_demand` table; both demand models now train on earlier months and test on the latest month (SRS Step 21). |
| Dual-pipeline report compared only 36 records | Added a demand-forecast comparison on 186 held-out records (SRS: 100+). |
| Ratings column mismatch (`Stars` vs `Score`) | Renamed to `Score` to match the backend model. |
| SQL Server rejected `IsDeleted IS 0` | Switched to `== False`, the project's existing convention. |
| Churn-risk endpoint took 6–60 s | Added a 5-minute cache of the scored-customer table. |
| Wastage-risk endpoint queried a non-existent `Order.PromotionId` | Removed; the live `Order` model has no promotion link. |
| What-If ignored prep-quantity, wastage and remove-item inputs | The controller forwarded only 3 of 6 fields; it now forwards all of them. |
| npm `xlsx` package had unpatched high-severity advisories | Replaced with SheetJS's patched build from its official CDN. |
| Tailwind produced no utility classes | A stale `node_modules/.vite` cache; cleared it. |

## 6. Testing performed

- Each pipeline stage was run end to end at full scale, with exit codes checked
  (ingest → clean → features → Spark MLlib → Python models → dual-pipeline verifier).
- Every new API endpoint was called with a real admin token against the live database.
  Responses and arithmetic were checked by hand (for example, the What-If prep-quantity
  cap: 11,025 × 0.7 = 7,717.5 units).
- New frontend pages were opened in a browser, and CSV/Excel export was clicked on the
  ML pages; `tsc --noEmit` passes.
- The automated suite in `tests/` covers API endpoints and RBAC, data-quality rules, ML
  model inference, and the dual-pipeline report. See [tests/README.md](tests/README.md).

## 7. Honest limitations (not hidden)

- **Demand forecast does not beat the naive baseline.** With the leak-free chronological
  split, the next-month demand model's MAE is worse than "next month = this month" on the
  synthetic dataset. Simpler models, linear regression and residual targets were all
  tried; none beat it. This fails NFR-4 and is reported as-is in
  `reports/python_model_metrics.json` (`improvement_over_baseline_percent`), not tuned
  away.
- **Market-basket analysis finds zero rules.** The synthetic order generator (`generate_orders_and_lines` in `ingest_sql_data.py`) draws every line's menu item independently by popularity, with no pairwise affinity, so no itemset reaches minimum support regardless of data volume — confirmed by testing directly against the full-scale parquet (93,065 orders, 69,511 multi-item baskets, 0 rules at 1% support). Re-running at a bigger scale does not fix this; the generator needs a combo-companion bias. Covered by an `xfail` test, not hidden.
- **Slow-moving dish detection currently returns few or no items.** The Phase 2 backfill
  picked menu items uniformly at random, so no dish is genuinely slow. The detector works
  (it flags items when a single signal is enough), but the data lacks realistic
  popularity skew.
- **Transactions are synthetic.** They are generated on top of the real customer, menu
  and category data. This is documented, not presented as real history.
- **The third Spark classifier is a second Random Forest.** MLlib's `GBTClassifier` is
  binary-only, and the menu-class target has 4 classes. This is labelled as such in the
  metrics output.
