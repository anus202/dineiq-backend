import logging
from typing import List, Tuple

from app.core import config
from app.schemas.assistant_schema import AssistantMessage

logger = logging.getLogger(__name__)

NOT_CONFIGURED_REPLY = (
    "The AI assistant isn't set up yet on this server. Ask an admin to add an "
    "ANTHROPIC_API_KEY to the backend's .env file to turn it on."
)

TROUBLE_REPLY = "Sorry, I couldn't reach the AI service just now. Please try again in a moment."

# Longest-prefix match against the route the user is on -- keeps each answer scoped to
# "this page" instead of the whole app, per the brief (login page explains login, a
# dashboard only talks about that dashboard, etc). Mirrors frontend/src/utils/roles.ts,
# kept as an independent copy since the two apps don't share code.
PAGE_CONTEXT: List[Tuple[str, str, str]] = [
    ("/login", "Login", "Signing in with an email and password to reach the right dashboard for the user's role."),
    ("/register", "Create account", "Signing up for a free DineIQ Rewards customer account (name, email, phone, password) to start earning loyalty points."),
    ("/admin/categories", "Category Management", "Creating, renaming and retiring menu categories (e.g. Starters, Desserts) that menu items are grouped under."),
    ("/admin/menu-mapper", "Menu Item Mapper", "Creating and editing menu items: name, category, price, cost and availability."),
    ("/admin/customers", "Customer Search", "Looking up a customer's profile, order history and loyalty tier by name, phone or email."),
    ("/admin/audit", "Audit Logs", "A read-only trail of who changed what in the system and when, for accountability."),
    ("/admin/branches", "Restaurant Branches", "The list of restaurant branches, their manager, active status and revenue. Use '+ Add Branch' (top right) to create one, or Edit on a row."),
    ("/admin/users", "User Accounts", "The list of staff accounts, their role and branch scope. Use '+ Add User' (top right) to create one, or Edit Role on a row."),
    ("/admin/branch-comparison", "Multi-Branch Comparison", "Comparing revenue, orders and other KPIs side by side across branches."),
    ("/admin/anomalies", "Anomaly & Fraud Detection", "Flagged unusual order/refund/discount patterns worth reviewing for fraud or mistakes."),
    ("/inventory/adjust-stock", "Stock Adjustment", "Logging a manual stock change (e.g. spoilage, recount) with a reason, so the change is auditable."),
    ("/inventory/recipes", "Recipe Builder", "Defining how much of each raw-material inventory item a menu item consumes, so stock deducts automatically on sale."),
    ("/inventory/movement-log", "Stock Movement Log", "The history of every stock in/out movement: sales deductions, adjustments, initial stock."),
    ("/inventory", "Inventory Dashboard", "Stock health at a glance: items tracked, valuation, low-stock and out-of-stock counts, plus the stock status matrix. Use '+ Add Item' (top right) to create a new inventory item."),
    ("/dashboard/inventory-manager/wastage", "Wastage Analytics", "Trends in stock written off as waste/spoilage, to spot what's being over-ordered or mishandled."),
    ("/dashboard/inventory-manager/demand-forecast", "Demand Forecast", "A model's prediction of near-future ingredient demand, to plan purchasing and avoid stockouts."),
    ("/pos/new-order", "New Takeaway / Delivery Order", "Building an off-premise order for a walk-in or delivery customer at the till."),
    ("/pos", "POS & Tables", "The point-of-sale screen: table status, opening a check, adding items and taking payment."),
    ("/dashboard/restaurant-manager/channel-mix", "Channel Mix", "The revenue split between dine-in, takeaway and delivery channels."),
    ("/dashboard/restaurant-manager/menu-performance", "Menu Performance", "Which menu items sell best and which underperform, by revenue and quantity."),
    ("/dashboard/restaurant-manager/recommendations", "Recommendations", "System-generated suggestions (pricing, promotions, menu changes) based on recent data."),
    ("/dashboard/restaurant-manager", "Executive Overview", "The main KPI dashboard: today's revenue, orders, active tables, low-stock alerts, revenue trend and demand heatmap."),
    ("/ml-insights/market-basket", "Market Basket Analysis", "Which menu items are frequently bought together, useful for combo/upsell ideas."),
    ("/ml-insights/price-sensitivity", "Price Sensitivity", "How demand for an item responds to price changes."),
    ("/ml-insights/promotion-traps", "Promotion Traps", "Promotions that quietly lose money per-day versus the non-promo baseline, once normalized for time."),
    ("/ml-insights/churn-risk", "Churn Risk", "Customers predicted likely to stop ordering, so they can be re-engaged."),
    ("/ml-insights/rating-anomalies", "Rating Anomalies", "Unusual dips or spikes in item/branch ratings worth investigating."),
    ("/ml-insights/slow-moving-dishes", "Slow-Moving Dishes", "Menu items that rarely sell -- candidates to reprice, promote or retire."),
    ("/ml-insights/forecast-dashboard", "Forecast & Wastage-Risk", "Forecasted demand and the resulting wastage risk if stock isn't adjusted."),
    ("/ml-insights/what-if", "What-If Scenario Simulator", "Simulating the effect of a hypothetical change (e.g. a price change) before making it."),
    ("/ml-insights/dual-pipeline-comparison", "Dual-Pipeline Comparison", "Comparing the two ML pipelines' (PySpark vs XGBoost) outputs against each other."),
    ("/customer/menu", "Browse Menu", "The customer-facing menu: browsing items by category, favoriting items, and starting an order."),
    ("/customer/order", "Place an Order", "Checking out an order: picking up items, applying a voucher, choosing a branch/table."),
    ("/customer/ratings", "My Ratings", "A customer's own past ratings and feedback on orders."),
    ("/customer", "My Rewards", "A customer's loyalty summary: points balance, tier (Silver/Gold/Platinum) and recent orders."),
    ("/admin", "Admin Overview", "The admin's main KPI dashboard, same idea as the restaurant manager's overview."),
]

DEFAULT_CONTEXT = ("DineIQ Analytics", "A restaurant management and analytics platform covering menu, inventory, POS, staff and ML-driven insights.")


def describe_page(page: str) -> Tuple[str, str]:
    page = (page or "").split("?")[0].rstrip("/") or "/"
    best: Tuple[str, str] | None = None
    best_len = -1
    for prefix, title, description in PAGE_CONTEXT:
        if page == prefix or page.startswith(prefix + "/"):
            if len(prefix) > best_len:
                best = (title, description)
                best_len = len(prefix)
    return best or DEFAULT_CONTEXT


def _system_prompt(page: str) -> str:
    title, description = describe_page(page)
    return (
        "You are the DineIQ Assistant, a friendly in-app guide embedded as a floating chat "
        "widget inside the DineIQ restaurant management and analytics application.\n\n"
        f"The user is currently on the '{title}' page. What that page does: {description}\n\n"
        "Answer questions about this page specifically -- what it's for, how to use it, and "
        "what the numbers/fields on it mean. You may also give brief general help about "
        "navigating the DineIQ app. If asked something unrelated to DineIQ, politely say you "
        "can only help with this app and steer back to it. Keep replies short: 2-4 sentences, "
        "no long lists unless asked. Reply in whatever language/style the user writes in "
        "(English or Roman Urdu/Hindi are both fine)."
    )


async def chat(message: str, page: str, history: List[AssistantMessage]) -> Tuple[str, bool]:
    if not config.ANTHROPIC_API_KEY:
        return NOT_CONFIGURED_REPLY, False

    try:
        from anthropic import AsyncAnthropic
    except ImportError:  # pragma: no cover - only hit if the dependency was never installed
        logger.error("ANTHROPIC_API_KEY is set but the 'anthropic' package isn't installed")
        return NOT_CONFIGURED_REPLY, False

    client = AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)
    messages = [{"role": m.Role, "content": m.Text} for m in history] + [{"role": "user", "content": message}]

    try:
        response = await client.messages.create(
            model=config.ASSISTANT_MODEL,
            max_tokens=400,
            system=_system_prompt(page),
            messages=messages,
        )
        text = "".join(block.text for block in response.content if block.type == "text").strip()
        return text or TROUBLE_REPLY, True
    except Exception:
        logger.exception("Assistant chat call failed")
        return TROUBLE_REPLY, True
