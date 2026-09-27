import type {
  AdminSummary,
  AnomalyReportResponse,
  AuditLog,
  AuthResponse,
  BranchComparisonResponse,
  BusinessRecommendation,
  Category,
  ChannelMixResponse,
  ChurnRiskResponse,
  Customer,
  DemandForecastItem,
  CustomerDetail,
  CustomerMe,
  CustomerRFM,
  DemandForecastResponse,
  DiningTable,
  DualPipelineComparisonResponse,
  FavoriteListResponse,
  FavoriteToggleResponse,
  HourlyHeatmap,
  InventoryItem,
  InventoryItemInput,
  Invoice,
  MenuItem,
  MenuItemInput,
  MenuQuadrantResponse,
  MLRecommendation,
  MarketBasketRule,
  MovementType,
  MyOrder,
  Order,
  OrderCreateInput,
  Overview,
  Page,
  PaymentPreview,
  PriceSensitivityItem,
  PromotionTrapItem,
  PromoValidateResponse,
  Rating,
  RatingAnomalyItem,
  RatingCreateInput,
  Recipe,
  Recommendations,
  RestaurantBranch,
  RestaurantBranchInput,
  RevenueChart,
  RFMMatrix,
  RoleName,
  SettleInput,
  SignupRequest,
  StaffCreateInput,
  StockAdjustmentResult,
  StockMovement,
  StockStatus,
  TableList,
  TopPerforming,
  SlowMovingDish,
  User,
  WastageRiskItem,
  WastageSummaryResponse,
  WhatIfRequest,
  WhatIfResponse,
} from '../types/api'
import { api } from './api'

type Params = Record<string, string | number | boolean | undefined | null>

/** Drop empty filters so they aren't sent as "?search=". */
const clean = (params: Params): Params =>
  Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))

const get = async <T>(url: string, params: Params = {}): Promise<T> => (await api.get<T>(url, { params: clean(params) })).data
const post = async <T>(url: string, body?: unknown): Promise<T> => (await api.post<T>(url, body)).data
const put = async <T>(url: string, body?: unknown): Promise<T> => (await api.put<T>(url, body)).data
const del = async (url: string): Promise<void> => {
  await api.delete(url)
}

export const authApi = {
  login: (Email: string, Password: string) => post<AuthResponse>('/auth/login', { Email, Password }),
  signup: (body: SignupRequest) => post<AuthResponse>('/auth/signup', body),
  me: () => get<User>('/auth/me'),
}

export const adminDashboardApi = {
  summary: () => get<AdminSummary>('/dashboard/admin/summary'),
  revenueChart: (days = 30, months = 12) => get<RevenueChart>('/dashboard/admin/revenue-chart', { days, months }),
  topPerforming: (days = 30) => get<TopPerforming>('/dashboard/admin/top-performing', { days }),
}

export const analyticsApi = {
  overview: (start_date?: string, end_date?: string) => get<Overview>('/analytics/overview', { start_date, end_date }),
  heatmap: (start_date?: string, end_date?: string) => get<HourlyHeatmap>('/analytics/hourly-heatmap', { start_date, end_date }),
  rfmMatrix: () => get<RFMMatrix>('/analytics/rfm-matrix'),
}

export const branchAnalyticsApi = {
  overview: (params: { start_date?: string; end_date?: string; branch_id?: number } = {}) =>
    get<Overview>('/dashboard/restaurant-manager/overview', params),
  channelMix: (params: { start_date?: string; end_date?: string; branch_id?: number } = {}) =>
    get<ChannelMixResponse>('/dashboard/restaurant-manager/channel-mix', params),
  menuQuadrants: (params: { start_date?: string; end_date?: string; branch_id?: number; refresh?: boolean } = {}) =>
    get<MenuQuadrantResponse>('/dashboard/restaurant-manager/menu-quadrants', params),
  recommendations: (params: { start_date?: string; end_date?: string; branch_id?: number } = {}) =>
    get<BusinessRecommendation[]>('/dashboard/restaurant-manager/recommendations', params),
  wastage: (params: { start_date?: string; end_date?: string; branch_id?: number; refresh?: boolean } = {}) =>
    get<WastageSummaryResponse>('/dashboard/inventory-manager/wastage', params),
  demandForecast: (params: { days?: number; branch_id?: number } = {}) =>
    get<DemandForecastResponse>('/dashboard/inventory-manager/demand-forecast', params),
  branchComparison: (params: { start_date?: string; end_date?: string } = {}) =>
    get<BranchComparisonResponse>('/dashboard/admin/branch-comparison', params),
  anomalies: (params: { lookback_days?: number } = {}) => get<AnomalyReportResponse>('/dashboard/admin/anomalies', params),
}

export const mlAnalyticsApi = {
  marketBasket: () => get<MarketBasketRule[]>('/ml-analytics/market-basket'),
  priceSensitivity: () => get<PriceSensitivityItem[]>('/ml-analytics/price-sensitivity'),
  promotionTraps: () => get<PromotionTrapItem[]>('/ml-analytics/promotion-traps'),
  recommendations: () => get<MLRecommendation[]>('/ml-analytics/recommendations'),
  churnRisk: (limit = 50) => get<ChurnRiskResponse>('/ml-analytics/churn-risk', { limit }),
  whatIf: (body: WhatIfRequest) => post<WhatIfResponse>('/ml-analytics/what-if', body),
  ratingAnomalies: () => get<RatingAnomalyItem[]>('/ml-analytics/rating-anomalies'),
  slowMovingDishes: () => get<SlowMovingDish[]>('/ml-analytics/slow-moving-dishes'),
  wastageRisk: (limit = 50) => get<WastageRiskItem[]>('/ml-analytics/wastage-risk', { limit }),
  demandForecastMl: (limit = 50) => get<DemandForecastItem[]>('/ml-analytics/demand-forecast', { limit }),
  dualPipelineComparison: () => get<DualPipelineComparisonResponse>('/ml-analytics/dual-pipeline-comparison'),
}

export const ratingApi = {
  create: (body: RatingCreateInput) => post<Rating>('/ratings', body),
  forMenuItem: (menuItemId: number, params: { skip: number; limit: number }) => get<Page<Rating>>(`/ratings/menu-item/${menuItemId}`, params),
  mine: (params: { skip: number; limit: number }) => get<Page<Rating>>('/ratings/me', params),
}

export const categoryApi = {
  list: () => get<Category[]>('/categories'),
  create: (Name: string) => post<Category>('/categories', { Name }),
  update: (id: number, Name: string) => put<Category>(`/categories/${id}`, { Name }),
  remove: (id: number) => del(`/categories/${id}`),
}

export const menuApi = {
  list: (params: { skip: number; limit: number; search?: string; category_id?: number; is_available?: boolean }) =>
    get<Page<MenuItem>>('/menu-items', params),
  create: (body: MenuItemInput) => post<MenuItem>('/menu-items', body),
  update: (id: number, body: Partial<MenuItemInput>) => put<MenuItem>(`/menu-items/${id}`, body),
  remove: (id: number) => del(`/menu-items/${id}`),
  /** Every available item (the API pages at 100). */
  async all(onlyAvailable = true): Promise<MenuItem[]> {
    const items: MenuItem[] = []
    for (let skip = 0; ; skip += 100) {
      const page = await menuApi.list({ skip, limit: 100, is_available: onlyAvailable ? true : undefined })
      items.push(...page.Items)
      if (items.length >= page.Total || page.Items.length === 0) return items
    }
  },
}

export const customerApi = {
  list: (params: { skip: number; limit: number; search?: string }) => get<Page<Customer>>('/customers', params),
  detail: (id: number) => get<CustomerDetail>(`/customers/${id}`),
  rfm: (id: number) => get<CustomerRFM>(`/customers/${id}/analytics`),
}

export const auditApi = {
  list: (params: { skip: number; limit: number; action?: string; entity_name?: string }) => get<Page<AuditLog>>('/audit-logs', params),
  filters: () => get<{ Actions: string[]; Entities: string[] }>('/audit-logs/filters'),
}

export const branchApi = {
  list: (params: { search?: string; is_active?: boolean } = {}) => get<RestaurantBranch[]>('/restaurants/branches', params),
  create: (body: RestaurantBranchInput) => post<RestaurantBranch>('/restaurants/branch', body),
  update: (id: number, body: RestaurantBranchInput) => put<RestaurantBranch>(`/restaurants/branch/${id}`, body),
  deactivate: (id: number) => del(`/restaurants/branch/${id}`),
}

export const usersApi = {
  list: (params: { role?: RoleName; branch_id?: number; search?: string; skip: number; limit: number }) =>
    get<Page<User>>('/users', params),
  create: (body: StaffCreateInput) => post<User>('/users', body),
  changeRole: (id: number, Role: RoleName) => put<User>(`/users/${id}/role`, { Role }),
  deactivate: (id: number) => del(`/users/${id}`),
}

export const inventoryApi = {
  items: (params: { skip: number; limit: number; search?: string; low_stock_only?: boolean }) =>
    get<Page<InventoryItem>>('/inventory/items', params),
  create: (body: InventoryItemInput) => post<InventoryItem>('/inventory/items', body),
  update: (id: number, body: Partial<InventoryItemInput>) => put<InventoryItem>(`/inventory/items/${id}`, body),
  remove: (id: number) => del(`/inventory/items/${id}`),
  adjust: (InventoryItemId: number, Quantity: number, Reason: string) =>
    post<StockAdjustmentResult>('/inventory/adjust', { InventoryItemId, Quantity, Reason }),
  recipe: (menuItemId: number) => get<Recipe>(`/inventory/recipes/${menuItemId}`),
  saveRecipe: (menuItemId: number, Lines: { InventoryItemId: number; QuantityRequired: number }[]) =>
    put<Recipe>(`/inventory/recipes/${menuItemId}`, { Lines }),
  stockStatus: () => get<StockStatus>('/dashboard/inventory/stock-status'),
  movements: (params: { skip: number; limit: number; movement_type?: MovementType; inventory_item_id?: number }) =>
    get<Page<StockMovement>>('/dashboard/inventory/movement-logs', params),
}

export const tableApi = {
  list: () => get<TableList>('/tables'),
  assign: (TableId: number, OrderId: number, GuestCount?: number) => post<DiningTable>('/tables/assign', { TableId, OrderId, GuestCount }),
  setStatus: (id: number, Status: 'AVAILABLE' | 'RESERVED') => put<DiningTable>(`/tables/${id}/status`, { Status }),
}

export const orderApi = {
  list: (params: { skip: number; limit: number; status?: string; order_type?: string }) => get<Page<Order>>('/orders', params),
  get: (id: number) => get<Order>(`/orders/${id}`),
  create: (body: OrderCreateInput) => post<Order>('/orders', body),
  cancel: (id: number) => put<Order>(`/orders/${id}/status`, { Status: 'Cancelled' }),
}

/** The heart-toggle favorite on the customer Menu Browse page. */
export const favoriteApi = {
  mine: () => get<FavoriteListResponse>('/favorites'),
  toggle: (menuItemId: number) => post<FavoriteToggleResponse>(`/favorites/${menuItemId}/toggle`),
}

/** Voucher/discount code lookup for the self-checkout "Apply" box. */
export const promotionApi = {
  validate: (code: string, branchId?: number) => get<PromoValidateResponse>(`/promotions/validate/${encodeURIComponent(code)}`, { branch_id: branchId }),
}

export const paymentApi = {
  preview: (body: SettleInput) => post<PaymentPreview>('/payments/preview', body),
  settle: (body: SettleInput) => post<Invoice>('/payments/settle', body),
}

export const customerPortalApi = {
  me: () => get<CustomerMe>('/dashboard/customer/me'),
  myOrders: (params: { skip: number; limit: number; open_only?: boolean }) => get<Page<MyOrder>>('/dashboard/customer/my-orders', params),
  recommendations: () => get<Recommendations>('/dashboard/customer/recommendations'),
}
