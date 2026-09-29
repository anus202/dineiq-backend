from __future__ import annotations

import asyncio
import logging
import time

from app.db.session import SessionLocal
from app.services import analytics_service, branch_analytics_service, dashboard_service, ml_analytics_service

logger = logging.getLogger("dineiq.cache_warmup")

WARM_STEP_DELAY_SECONDS = 1.5

FAST_REFRESH_INTERVAL_SECONDS = 45

HEAVY_REFRESH_INTERVAL_SECONDS = 240

_HEAVY_ASYNC_WARMERS = [
    ("overview", lambda db: analytics_service.get_overview(db, None, None)),
    ("rfm-segmentation", lambda db: analytics_service.get_rfm_segmentation(db, None)),
    ("rfm-matrix", lambda db: analytics_service.get_rfm_matrix(db, None)),
    ("revenue-chart", lambda db: dashboard_service.revenue_chart(db, 30, 12)),
    ("top-performing", lambda db: dashboard_service.admin_top_performing(db, 30, 3)),
    ("branch-comparison", lambda db: branch_analytics_service.get_branch_comparison(db, None, None)),
    ("channel-mix", lambda db: branch_analytics_service.get_channel_mix(db, None, None, None)),
    ("menu-quadrants", lambda db: branch_analytics_service.get_menu_quadrants(db, None, None, None)),
    ("wastage-summary", lambda db: branch_analytics_service.get_wastage_summary(db, None, None, None)),
    ("branch-demand-forecast", lambda db: branch_analytics_service.get_demand_forecast(db, None, 30)),
    ("sales-anomalies", lambda db: branch_analytics_service.detect_sales_anomalies(db, 30, 7)),
    ("churn-risk", lambda db: ml_analytics_service.get_churn_risk(db, 500)),
    ("wastage-risk", lambda db: ml_analytics_service.get_wastage_risk(db, 200)),
    ("demand-forecast-ml", lambda db: ml_analytics_service.get_demand_forecast_ml(db, 200)),
    ("rating-anomalies", lambda db: ml_analytics_service.get_rating_anomalies(db)),
    ("slow-moving-dishes", lambda db: ml_analytics_service.get_slow_moving_dishes(db)),
]

_SYNC_WARMERS = [
    ("market-basket", ml_analytics_service.get_market_basket_rules),
    ("price-sensitivity", ml_analytics_service.get_price_sensitivity),
    ("promotion-traps", ml_analytics_service.get_promotion_traps),
    ("ml-recommendations", ml_analytics_service.get_ml_recommendations),
    ("dual-pipeline-comparison", ml_analytics_service.get_dual_pipeline_comparison),
]

async def _warm_fast() -> None:
    async with SessionLocal() as db:
        try:
            await dashboard_service.admin_summary(db)
        except Exception:
            logger.warning("cache warm-up failed for 'admin-summary'", exc_info=True)

async def _warm_heavy() -> None:
    started = time.monotonic()
    async with SessionLocal() as db:
        for name, make_coro in _HEAVY_ASYNC_WARMERS:
            try:
                await make_coro(db)
            except Exception:
                logger.warning("cache warm-up failed for %r", name, exc_info=True)
            await asyncio.sleep(WARM_STEP_DELAY_SECONDS)

    for name, fn in _SYNC_WARMERS:
        try:
            # CPU-bound (pandas / mlxtend): off the event loop, or every API request stalls
            # until the whole batch finishes.
            await asyncio.to_thread(fn)
        except Exception:
            logger.warning("cache warm-up failed for %r", name, exc_info=True)

    logger.info("heavy cache warm-up cycle finished in %.1fs", time.monotonic() - started)

async def _loop(step, interval_seconds: float) -> None:
    while True:
        try:
            await step()
        except Exception:
            logger.warning("cache warm-up cycle raised", exc_info=True)
        await asyncio.sleep(interval_seconds)

def start_background_warmup() -> list[asyncio.Task]:
    return [
        asyncio.create_task(_loop(_warm_fast, FAST_REFRESH_INTERVAL_SECONDS)),
        asyncio.create_task(_loop(_warm_heavy, HEAVY_REFRESH_INTERVAL_SECONDS)),
    ]
