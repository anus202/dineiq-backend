"""Background cache pre-warming for the heavy Admin/Analytics/ML endpoints.

`app.core.cache.TTLCache` already makes a *repeat* request to a cached endpoint fast --
but the very first request after the TTL expires still pays the full cold-scan cost (up to
tens of seconds on the largest aggregations). This module keeps those caches warm in the
background so a real dashboard click rarely hits that cold path.

Two important lessons from load-testing this against the live 1M+-row database, both baked
into the design below rather than left as footguns:

1. Pacing matters. Running all ~17 heavy aggregation queries back-to-back with zero gaps
   saturates SQL Server badly enough that *concurrent real requests* (for entirely different
   endpoints) slow down too -- the warm-up was, ironically, the biggest source of latency.
   A short `await asyncio.sleep()` between each warm call gives real request handlers room
   to interleave instead of the warm-up loop monopolizing the database.
2. Refresh cadence should match each group's own TTL, not the shortest one. The heavy
   analytical endpoints (5-10 minute TTLs) don't need re-warming every minute -- doing so
   just repeats expensive work for no freshness benefit. Only the cheap, fast-changing
   "today at a glance" summary needs a tight refresh loop.

Each warm call is isolated in its own try/except: one endpoint failing (e.g. a still-
training ML model) never blocks the rest.
"""
from __future__ import annotations

import asyncio
import logging
import time

from app.db.session import SessionLocal
from app.services import analytics_service, branch_analytics_service, dashboard_service, ml_analytics_service

logger = logging.getLogger("dineiq.cache_warmup")

# Gap between each individual warm call, so the database and connection pool always have
# room for real, concurrent user requests instead of one continuous background query storm.
WARM_STEP_DELAY_SECONDS = 1.5

# admin_summary's own TTL is 60s ("today at a glance"); refresh a little inside that window
# so it's never seen stale, without adding real load (it's a single cheap aggregation).
FAST_REFRESH_INTERVAL_SECONDS = 45

# The heavy analytical endpoints all use 300-600s TTLs; refreshing every 4 minutes keeps
# every one of them warm before it would naturally expire, without re-running the full,
# expensive battery of queries anywhere near as often as the fast loop.
HEAVY_REFRESH_INTERVAL_SECONDS = 240

# (name, coroutine factory) -- a factory, not a coroutine, because each one must be created
# fresh on every warm cycle (a coroutine object can only be awaited once). Limits match what
# the frontend dashboards actually request (see ChurnRiskPage / ForecastDashboardPage) so
# the warmed cache key is the one real page loads will hit.
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

# Sync, non-DB pipeline-backed caches (market-basket / price-sensitivity / promotion-traps /
# recommendations read pre-trained model artifacts from disk, not the database) -- cheap
# enough to not need pacing between them.
_SYNC_WARMERS = [
    ("market-basket", ml_analytics_service.get_market_basket_rules),
    ("price-sensitivity", ml_analytics_service.get_price_sensitivity),
    ("promotion-traps", ml_analytics_service.get_promotion_traps),
    ("ml-recommendations", ml_analytics_service.get_ml_recommendations),
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
            fn()
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
    """Launches both refresh loops as fire-and-forget tasks. Callers should cancel the
    returned tasks on shutdown."""
    return [
        asyncio.create_task(_loop(_warm_fast, FAST_REFRESH_INTERVAL_SECONDS)),
        asyncio.create_task(_loop(_warm_heavy, HEAVY_REFRESH_INTERVAL_SECONDS)),
    ]
