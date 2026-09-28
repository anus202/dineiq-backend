from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.controllers import (
    analytics_controller,
    assistant_controller,
    audit_controller,
    auth_controller,
    branch_analytics_controller,
    category_controller,
    customer_controller,
    dashboard_controller,
    favorite_controller,
    inventory_controller,
    menu_controller,
    ml_analytics_controller,
    order_controller,
    payment_controller,
    promotion_controller,
    rating_controller,
    restaurant_branch_controller,
    table_controller,
)

from app.core import audit
from app.core.cache_warmup import start_background_warmup
from app.core.config import CORS_ORIGINS
from app.db.init_db import init_db
from app.db.session import engine

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()

    warmup_tasks = start_background_warmup()
    yield
    for task in warmup_tasks:
        task.cancel()
    await engine.dispose()

app = FastAPI(
    title="DineIQ API",
    version="1.0.0",
    description="DineIQ backend API.",
    lifespan=lifespan,
)

app.add_middleware(audit.AuditContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_controller.router)
app.include_router(auth_controller.users_router)
app.include_router(category_controller.router)
app.include_router(menu_controller.router)
app.include_router(order_controller.router)
app.include_router(customer_controller.router)
app.include_router(inventory_controller.router)
app.include_router(analytics_controller.router)
app.include_router(dashboard_controller.admin_router)
app.include_router(dashboard_controller.inventory_router)
app.include_router(dashboard_controller.customer_router)
app.include_router(table_controller.router)
app.include_router(payment_controller.router)
app.include_router(audit_controller.router)
app.include_router(restaurant_branch_controller.router)
app.include_router(rating_controller.router)
app.include_router(branch_analytics_controller.router)
app.include_router(ml_analytics_controller.router)
app.include_router(favorite_controller.router)
app.include_router(promotion_controller.router)
app.include_router(assistant_controller.router)

@app.get("/", tags=["Health"], summary="Health check")
def root():
    return {"status": "ok"}

def _print_startup_banner(host: str, port: int) -> None:
    base = f"http://{host}:{port}"
    lines = [
        "DineIQ API - starting up",
        "",
        f"  Base API URL     {base}",
        f"  Swagger Docs     {base}/docs",
        f"  ReDoc Docs       {base}/redoc",
    ]
    width = max(len(line) for line in lines) + 4
    print("+" + "-" * width + "+", flush=True)
    for line in lines:
        print("|  " + line.ljust(width - 2) + "|", flush=True)
    print("+" + "-" * width + "+", flush=True)

if __name__ == "__main__":
    import uvicorn

    HOST, PORT = "127.0.0.1", 8000
    _print_startup_banner(HOST, PORT)
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)

