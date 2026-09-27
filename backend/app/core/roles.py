from enum import Enum


class RoleName(str, Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    RESTAURANT_MANAGER = "RESTAURANT_MANAGER"
    INVENTORY_MANAGER = "INVENTORY_MANAGER"
    CASHIER = "CASHIER"
    CUSTOMER = "CUSTOMER"


ROLE_DESCRIPTIONS = {
    RoleName.SUPER_ADMIN: "Full access, including managing admins",
    RoleName.ADMIN: "Runs the restaurant: menu, staff, analytics, dashboards",
    RoleName.RESTAURANT_MANAGER: "Branch-level sales, profitability and menu performance for their assigned branch",
    RoleName.INVENTORY_MANAGER: "Stock, wastage and procurement for their assigned branch",
    RoleName.CASHIER: "Orders, tables, customers and payments",
    RoleName.CUSTOMER: "Registered diner using the customer portal",
}

# Roles that only a SUPER_ADMIN may grant, or change a user away from.
PRIVILEGED_ROLES = {RoleName.SUPER_ADMIN, RoleName.ADMIN}

# Roles whose data access is scoped to a single assigned branch (see
# core/dependencies.py's branch_scope() dependency).
BRANCH_SCOPED_ROLES = {RoleName.RESTAURANT_MANAGER, RoleName.INVENTORY_MANAGER}

# Shorthand lists for require_roles(); SUPER_ADMIN passes every staff check implicitly.
ADMIN_ONLY = [RoleName.ADMIN]
MENU_MANAGERS = [RoleName.ADMIN]
FRONT_OF_HOUSE = [RoleName.ADMIN, RoleName.CASHIER]
STOCK_MANAGERS = [RoleName.ADMIN, RoleName.INVENTORY_MANAGER]
BRANCH_MANAGERS = [RoleName.ADMIN, RoleName.RESTAURANT_MANAGER]
# Demand/wastage-risk forecasts are useful to both branch and stock management, unlike the
# rest of ml_analytics_controller (churn, basket, pricing, promotions) which is sales/
# marketing-facing and stays BRANCH_MANAGERS-only.
FORECAST_VIEWERS = [RoleName.ADMIN, RoleName.RESTAURANT_MANAGER, RoleName.INVENTORY_MANAGER]
ALL_STAFF = [RoleName.ADMIN, RoleName.RESTAURANT_MANAGER, RoleName.INVENTORY_MANAGER, RoleName.CASHIER]
EVERYONE = [*ALL_STAFF, RoleName.CUSTOMER]
# POST /orders only: a CASHIER places an order on a walk-in's behalf, a CUSTOMER places
# their own through the Menu Browse -> self-checkout flow. GET/PUT on orders (listing,
# reading any order by id, changing status) stay FRONT_OF_HOUSE-only -- a customer must
# never be able to list or read someone else's order by guessing an id.
ORDER_CREATORS = [RoleName.ADMIN, RoleName.CASHIER, RoleName.CUSTOMER]
