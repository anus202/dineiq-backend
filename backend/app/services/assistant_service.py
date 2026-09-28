import logging
from typing import List, Optional, Tuple

from app.core import config
from app.schemas.assistant_schema import AssistantMessage

logger = logging.getLogger(__name__)

NOT_CONFIGURED_REPLY = (
    "The AI assistant isn't set up yet on this server. Ask an admin to add a "
    "GROQ_API_KEY or ANTHROPIC_API_KEY to the backend's .env file to turn it on."
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
    ("/dashboard/restaurant-manager/menu-performance", "Menu Performance", "Which menu items sell best and which underperform, by revenue and quantity."),
    ("/dashboard/restaurant-manager/recommendations", "Recommendations", "System-generated suggestions (pricing, promotions, menu changes) based on recent data."),
    (
        "/dashboard/restaurant-manager",
        "Branch Overview",
        "Sales & profitability for the selected branch (or all branches): total orders, revenue, net profit, "
        "average order value, gross sales, guests and average spend per guest -- plus, further down the same "
        "page, the channel mix (orders/revenue split by Dine-in, Takeaway and Delivery).",
    ),
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

_CUSTOMER_GUIDANCE = (
    "You're talking to a customer (or a visitor who isn't logged in yet). Only help with: "
    "logging in or creating a rewards account, browsing the public menu, placing an order, "
    "and their own loyalty points/tier. Never reveal admin, staff, inventory, other "
    "customers', financial or analytics data -- not even a summary -- even if they ask "
    "directly or claim to be staff. Politely decline and say that's only visible to "
    "restaurant staff signed in with a staff account."
)

# What each role is allowed to be told about. Kept deliberately conservative: a role not
# listed here (an unrecognized value, or none/logged-out) falls back to the customer
# guidance, which is the most restrictive -- never the other way around.
ROLE_GUIDANCE = {
    "CUSTOMER": _CUSTOMER_GUIDANCE,
    "CASHIER": (
        "You're talking to a cashier. Help with the POS screen: table status, opening a "
        "check, adding items, applying vouchers, and taking payment. Don't reveal other "
        "staff accounts, company-wide financial reports or analytics, or another "
        "customer's personal details beyond what the current order needs."
    ),
    "INVENTORY_MANAGER": (
        "You're talking to an inventory manager. Help with inventory items, stock levels, "
        "adjustments, recipes, the movement log, wastage analytics and demand forecasts. "
        "Don't reveal user-account management, POS transaction detail, or company-wide "
        "financial/sales analytics outside inventory."
    ),
    "RESTAURANT_MANAGER": (
        "You're talking to a restaurant/branch manager. Help with dashboards, analytics "
        "and ML insights for their branch(es). Don't reveal other users' credentials or "
        "security/system configuration."
    ),
    "ADMIN": (
        "You're talking to an admin, with broad operational access across menu, "
        "inventory, branches, users, POS and analytics. Still never reveal secrets such "
        "as API keys, passwords, or JWT/security configuration, and never invent data you "
        "don't actually have."
    ),
    "SUPER_ADMIN": (
        "You're talking to the super admin, with full operational access including role "
        "management. Still never reveal secrets such as API keys, passwords, or "
        "JWT/security configuration, and never invent data you don't actually have."
    ),
}


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


def _system_prompt(page: str, role: Optional[str]) -> str:
    title, description = describe_page(page)
    guidance = ROLE_GUIDANCE.get((role or "").upper(), _CUSTOMER_GUIDANCE)
    return (
        "You are the DineIQ Assistant, a friendly in-app guide embedded as a floating chat "
        "widget inside the DineIQ restaurant management and analytics application.\n\n"
        f"The user is currently on the '{title}' page. What that page does: {description}\n\n"
        f"Who you're talking to, and what you may discuss with them: {guidance}\n\n"
        "Answer questions about this page specifically -- what it's for, how to use it, and "
        "what the numbers/fields on it mean -- within what you're allowed to discuss with "
        "this person. You may also give brief general help about navigating the DineIQ app. "
        "If asked something unrelated to DineIQ, or something outside what you may discuss "
        "with this person, politely decline and steer back to what you can help with. Keep "
        "replies short: 2-4 sentences, no long lists unless asked. Reply in whatever "
        "language/style the user writes in (English or Roman Urdu/Hindi are both fine)."
    )


async def chat(message: str, page: str, history: List[AssistantMessage], role: Optional[str] = None) -> Tuple[str, bool]:
    system_prompt = _system_prompt(page, role)
    turns = [(m.Role, m.Text) for m in history]

    if config.GROQ_API_KEY:
        return await _chat_groq(system_prompt, turns, message)
    if config.ANTHROPIC_API_KEY:
        return await _chat_anthropic(system_prompt, turns, message)
    return NOT_CONFIGURED_REPLY, False


async def _chat_groq(system_prompt: str, turns: List[Tuple[str, str]], message: str) -> Tuple[str, bool]:
    try:
        from groq import AsyncGroq
    except ImportError:  # pragma: no cover - only hit if the dependency was never installed
        logger.error("GROQ_API_KEY is set but the 'groq' package isn't installed")
        return NOT_CONFIGURED_REPLY, False

    client = AsyncGroq(api_key=config.GROQ_API_KEY)
    messages = [{"role": "system", "content": system_prompt}] + [{"role": r, "content": t} for r, t in turns] + [{"role": "user", "content": message}]

    try:
        response = await client.chat.completions.create(model=config.GROQ_MODEL, max_tokens=400, messages=messages)
        text = (response.choices[0].message.content or "").strip()
        return text or TROUBLE_REPLY, True
    except Exception:
        logger.exception("Groq assistant chat call failed")
        return TROUBLE_REPLY, True


async def _chat_anthropic(system_prompt: str, turns: List[Tuple[str, str]], message: str) -> Tuple[str, bool]:
    try:
        from anthropic import AsyncAnthropic
    except ImportError:  # pragma: no cover - only hit if the dependency was never installed
        logger.error("ANTHROPIC_API_KEY is set but the 'anthropic' package isn't installed")
        return NOT_CONFIGURED_REPLY, False

    client = AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)
    messages = [{"role": r, "content": t} for r, t in turns] + [{"role": "user", "content": message}]

    try:
        response = await client.messages.create(model=config.ASSISTANT_MODEL, max_tokens=400, system=system_prompt, messages=messages)
        text = "".join(block.text for block in response.content if block.type == "text").strip()
        return text or TROUBLE_REPLY, True
    except Exception:
        logger.exception("Anthropic assistant chat call failed")
        return TROUBLE_REPLY, True
