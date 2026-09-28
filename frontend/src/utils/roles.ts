import type { RoleName, User } from '../types/api'

export type PermissionFlag = 'CanAccessInventory' | 'CanTriggerPipeline' | 'CanAccessMenuManagement' | 'CanAccessBranchAnalytics'

export interface NavItem {
  to: string
  label: string
  icon: string
  roles: RoleName[]

  permission?: PermissionFlag
}

export const hasNavAccess = (user: Pick<User, 'Role'> & Partial<User>, item: NavItem): boolean =>
  item.roles.includes(user.Role) || Boolean(item.permission && user[item.permission])

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Dashboards & Analytics',
    items: [{ to: '/admin', label: 'Executive Overview', icon: '▣', roles: ['SUPER_ADMIN', 'ADMIN'] }],
  },
  {
    title: 'Branch Performance',
    items: [
      { to: '/dashboard/restaurant-manager', label: 'Branch Overview', icon: '📈', roles: ['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_MANAGER'], permission: 'CanAccessBranchAnalytics' },
      {
        to: '/dashboard/restaurant-manager/menu-performance',
        label: 'Menu Performance',
        icon: '🍽',
        roles: ['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_MANAGER'],
        permission: 'CanAccessBranchAnalytics',
      },
      {
        to: '/dashboard/restaurant-manager/recommendations',
        label: 'Business Recommendations',
        icon: '💡',
        roles: ['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_MANAGER'],
        permission: 'CanAccessBranchAnalytics',
      },
    ],
  },
  {
    title: 'ML & Big Data Insights',
    items: [
      { to: '/ml-insights/recommendations', label: 'ML Recommendations', icon: '🧠', roles: ['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_MANAGER'], permission: 'CanAccessBranchAnalytics' },
      { to: '/ml-insights/market-basket', label: 'Market Basket Analysis', icon: '🛒', roles: ['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_MANAGER'], permission: 'CanAccessBranchAnalytics' },
      { to: '/ml-insights/price-sensitivity', label: 'Price Sensitivity', icon: '💲', roles: ['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_MANAGER'], permission: 'CanAccessBranchAnalytics' },
      { to: '/ml-insights/promotion-traps', label: 'Promotion Traps', icon: '⚠', roles: ['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_MANAGER'], permission: 'CanAccessBranchAnalytics' },
      { to: '/ml-insights/churn-risk', label: 'Customer Churn Risk', icon: '📉', roles: ['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_MANAGER'], permission: 'CanAccessBranchAnalytics' },
      { to: '/ml-insights/rating-anomalies', label: 'Rating Anomaly Detection', icon: '🚩', roles: ['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_MANAGER'], permission: 'CanAccessBranchAnalytics' },
      { to: '/ml-insights/slow-moving-dishes', label: 'Slow-Moving Dishes', icon: '🐌', roles: ['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_MANAGER'], permission: 'CanAccessBranchAnalytics' },
      {
        to: '/ml-insights/forecast-dashboard',
        label: 'Forecast & Wastage-Risk',
        icon: '📅',
        roles: ['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_MANAGER', 'INVENTORY_MANAGER'],
        permission: 'CanAccessBranchAnalytics',
      },
      { to: '/ml-insights/what-if', label: 'What-If Scenario Simulator', icon: '🎛', roles: ['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_MANAGER'], permission: 'CanAccessBranchAnalytics' },
      {
        to: '/ml-insights/dual-pipeline-comparison',
        label: 'Dual-Pipeline Comparison',
        icon: '⚖',
        roles: ['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_MANAGER'],
        permission: 'CanAccessBranchAnalytics',
      },
    ],
  },
  {
    title: 'Inventory & Stock Management',
    items: [
      { to: '/inventory', label: 'Inventory Dashboard', icon: '▤', roles: ['SUPER_ADMIN', 'ADMIN', 'INVENTORY_MANAGER'], permission: 'CanAccessInventory' },
      { to: '/inventory/adjust-stock', label: 'Stock Adjustment', icon: '±', roles: ['SUPER_ADMIN', 'ADMIN', 'INVENTORY_MANAGER'], permission: 'CanAccessInventory' },
      { to: '/inventory/recipes', label: 'Recipe Builder', icon: '🍳', roles: ['SUPER_ADMIN', 'ADMIN', 'INVENTORY_MANAGER'], permission: 'CanAccessInventory' },
      { to: '/inventory/movement-log', label: 'Stock Movement Log', icon: '📋', roles: ['SUPER_ADMIN', 'ADMIN', 'INVENTORY_MANAGER'], permission: 'CanAccessInventory' },
      { to: '/dashboard/inventory-manager/wastage', label: 'Wastage Analytics', icon: '🗑', roles: ['SUPER_ADMIN', 'ADMIN', 'INVENTORY_MANAGER'], permission: 'CanAccessInventory' },
      { to: '/dashboard/inventory-manager/demand-forecast', label: 'Demand Forecast', icon: '📦', roles: ['SUPER_ADMIN', 'ADMIN', 'INVENTORY_MANAGER'], permission: 'CanAccessInventory' },
    ],
  },
  {
    title: 'Menu & Category Management',
    items: [
      { to: '/admin/categories', label: 'Category Management', icon: '🗂', roles: ['SUPER_ADMIN', 'ADMIN'], permission: 'CanAccessMenuManagement' },
      { to: '/admin/menu-mapper', label: 'Menu Item Mapper', icon: '🍽', roles: ['SUPER_ADMIN', 'ADMIN'], permission: 'CanAccessMenuManagement' },
    ],
  },
  {
    title: 'POS & Tables',
    items: [
      { to: '/pos', label: 'POS & Tables', icon: '▦', roles: ['SUPER_ADMIN', 'ADMIN', 'CASHIER'] },
      { to: '/pos/new-order', label: 'New Takeaway / Delivery Order', icon: '🧾', roles: ['SUPER_ADMIN', 'ADMIN', 'CASHIER'] },
    ],
  },
  {
    title: 'Customer & Audit',
    items: [
      { to: '/admin/customers', label: 'Customer Search', icon: '🔍', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/admin/audit', label: 'Audit Logs', icon: '📜', roles: ['SUPER_ADMIN', 'ADMIN'] },
    ],
  },
  {
    title: 'Administrative & Setup',
    items: [
      { to: '/admin/branches', label: 'Restaurant Branches (List & Status)', icon: '🏢', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/admin/users', label: 'User Accounts List', icon: '👤', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/admin/branch-comparison', label: 'Multi-Branch Comparison', icon: '🌐', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { to: '/admin/anomalies', label: 'Anomaly & Fraud Detection', icon: '🚨', roles: ['SUPER_ADMIN', 'ADMIN'] },
    ],
  },
  {
    title: 'My Account',
    items: [
      { to: '/customer', label: 'My Rewards', icon: '★', roles: ['CUSTOMER'] },
      { to: '/customer/menu', label: 'Menu Browse', icon: '📖', roles: ['CUSTOMER'] },
      { to: '/customer/order', label: 'Place Order', icon: '🛒', roles: ['CUSTOMER'] },
      { to: '/customer/ratings', label: 'Ratings & Feedback', icon: '⭐', roles: ['CUSTOMER'] },
    ],
  },
]

export const NAV: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)

export const homeFor = (role: RoleName): string => {
  switch (role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
      return '/admin'
    case 'RESTAURANT_MANAGER':
      return '/dashboard/restaurant-manager'
    case 'INVENTORY_MANAGER':
      return '/inventory'
    case 'CASHIER':
      return '/pos'
    case 'CUSTOMER':
      return '/customer'
  }
}

export const roleLabel: Record<RoleName, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  RESTAURANT_MANAGER: 'Restaurant Manager',
  INVENTORY_MANAGER: 'Inventory Manager',
  CASHIER: 'Cashier',
  CUSTOMER: 'Customer',
}
