// Types mirroring the FastAPI Pydantic schemas (backend/app/schemas). Field names match
// the JSON exactly (PascalCase); money and quantities arrive as plain numbers.

export type RoleName = 'SUPER_ADMIN' | 'ADMIN' | 'RESTAURANT_MANAGER' | 'INVENTORY_MANAGER' | 'CASHIER' | 'CUSTOMER'

export interface Page<T> {
  Total: number
  Skip: number
  Limit: number
  Items: T[]
}

// --- Auth -------------------------------------------------------------------------------

export interface User {
  Id: number
  FullName: string
  Email: string
  PhoneNumber: string | null
  Role: RoleName
  CustomerId: number | null
  BranchId: number | null
  BranchName: string | null
  CanAccessInventory: boolean
  CanTriggerPipeline: boolean
  CanAccessMenuManagement: boolean
  CanAccessBranchAnalytics: boolean
  IsActive: boolean
  CreatedAt: string
}

export interface StaffCreateInput {
  FullName: string
  Email: string
  PhoneNumber?: string | null
  Password: string
  Role: RoleName
  BranchId?: number | null
  CanAccessInventory?: boolean
  CanTriggerPipeline?: boolean
  CanAccessMenuManagement?: boolean
  CanAccessBranchAnalytics?: boolean
}

// --- Restaurant branches -----------------------------------------------------------------

export interface RestaurantBranch {
  Id: number
  BranchName: string
  Address: string
  City: string
  Phone: string
  OperatingHours: string
  ManagerId: number | null
  ManagerName: string | null
  IsActive: boolean
  TotalRevenue: number
  CreatedAt: string
  UpdatedAt: string
}

export interface RestaurantBranchInput {
  BranchName: string
  Address: string
  City: string
  Phone: string
  OperatingHours: string
  ManagerId?: number | null
  IsActive: boolean
}

export interface AuthResponse {
  Success: boolean
  Message: string
  Token: string | null
  TokenType: string | null
  Data: User | null
}

export interface SignupRequest {
  FullName: string
  Email: string
  PhoneNumber?: string
  Password: string
}

// --- Catalog ----------------------------------------------------------------------------

export interface Category {
  Id: number
  Name: string
  IsActive: boolean
  CreatedBy: number | null
  UpdatedBy: number | null
  CreatedAt: string
  UpdatedAt: string
}

export interface MenuItem {
  Id: number
  CategoryId: number
  Name: string
  Description: string | null
  Price: number
  Cost: number
  IsAvailable: boolean
  IsActive: boolean
  Category: { CategoryId: number; CategoryName: string }
  CreatedAt: string
  UpdatedAt: string
  ContributionMargin: number
  ProfitMarginPercentage: number
}

export interface MenuItemInput {
  CategoryId: number
  Name: string
  Description?: string | null
  Price: number
  Cost: number
  IsAvailable: boolean
}

// --- Customers --------------------------------------------------------------------------

export interface Customer {
  Id: number
  Name: string
  Phone: string
  Email: string | null
  Address: string | null
  LoyaltyPoints: number
  IsActive: boolean
  CreatedAt: string
  UpdatedAt: string
}

export interface CustomerStats {
  TotalOrders: number
  TotalSpent: number
  TotalGuests: number
  LastOrderDate: string | null
  AverageOrderValue: number
  AverageSpendPerGuest: number
}

export interface CustomerOrderSummary {
  Id: number
  OrderNumber: string
  OrderDate: string
  OrderType: string
  Status: OrderStatus
  GuestCount: number
  TotalAmount: number
  NetAmount: number
}

export interface CustomerDetail extends Customer {
  Stats: CustomerStats
  RecentOrders: CustomerOrderSummary[]
}

export interface CustomerRFM {
  CustomerId: number
  CustomerName: string
  LastOrderDate: string | null
  RecencyDays: number | null
  Frequency: number
  MonetaryValue: number
  RScore: number | null
  FScore: number | null
  MScore: number | null
  RFMScore: string | null
  Segment: string
  LoyaltyPoints: number
}

// --- Orders -----------------------------------------------------------------------------

export type OrderType = 'Dine-in' | 'Takeaway' | 'Delivery'
export type PaymentMethod = 'Cash' | 'Card' | 'Loyalty Points'
export type OrderStatus = 'Pending' | 'Completed' | 'Cancelled'

export interface OrderLine {
  Id: number
  MenuItemId: number
  MenuItemName: string
  Quantity: number
  UnitPrice: number
  TotalPrice: number
}

export interface Order {
  Id: number
  OrderNumber: string
  OrderDate: string
  OrderType: OrderType
  PaymentMethod: PaymentMethod
  Status: OrderStatus
  CustomerId: number | null
  Customer: { CustomerName: string; Phone: string } | null
  GuestCount: number
  TableId: number | null
  TableNumber: string | null
  TotalAmount: number
  Discount: number
  NetAmount: number
  InvoiceNumber: string | null
  items: OrderLine[]
  AverageSpendPerGuest: number
}

export interface OrderCreateInput {
  OrderType: OrderType
  PaymentMethod: 'Cash' | 'Card'
  Discount: number
  CustomerId?: number
  /** Required for a CUSTOMER placing their own order (self-checkout has no assigned
   * branch to fall back on); optional for staff, who default to their own branch. */
  BranchId?: number
  GuestCount: number
  items: { MenuItemId: number; Quantity: number }[]
}

// --- Favorites (Menu Browse heart toggle) ------------------------------------------------

export interface FavoriteListResponse {
  MenuItemIds: number[]
}

export interface FavoriteToggleResponse {
  MenuItemId: number
  IsFavorite: boolean
}

// --- Promotions / voucher codes ----------------------------------------------------------

export interface PromoValidateResponse {
  Valid: boolean
  Code: string | null
  PromotionName: string | null
  DiscountPercent: number | null
  Message: string
}

// --- Inventory --------------------------------------------------------------------------

export type Unit = 'kg' | 'liters' | 'pcs'
export type MovementType = 'INITIAL_STOCK' | 'MANUAL_ADDITION' | 'MANUAL_DEDUCTION' | 'ORDER_CONSUMPTION'

export interface InventoryItem {
  Id: number
  ItemName: string
  Unit: Unit
  CurrentStock: number
  ReorderLevel: number
  UnitCost: number
  IsActive: boolean
  CreatedAt: string
  UpdatedAt: string
  IsLowStock: boolean
}

export interface InventoryItemInput {
  ItemName: string
  Unit: Unit
  CurrentStock?: number
  ReorderLevel: number
  UnitCost: number
}

export interface LowStockAlert {
  InventoryItemId: number
  ItemName: string
  Unit: string
  CurrentStock: number
  ReorderLevel: number
  Shortfall: number
}

export interface StockItemStatus {
  InventoryItemId: number
  ItemName: string
  Unit: string
  CurrentStock: number
  ReorderLevel: number
  UnitCost: number
  StockValue: number
}

export interface StockStatus {
  TotalItems: number
  LowStockCount: number
  OutOfStockCount: number
  TotalValuation: number
  LowStock: StockItemStatus[]
  OutOfStock: StockItemStatus[]
}

export interface StockMovement {
  Id: number
  InventoryItemId: number
  ItemName: string
  Unit: string
  MovementType: MovementType
  QuantityChange: number
  StockAfter: number
  OrderId: number | null
  OrderNumber: string | null
  Reason: string | null
  ChangedBy: number | null
  ChangedByName: string | null
  ChangedAt: string
}

export interface StockAdjustmentResult {
  Item: InventoryItem
  Movement: StockMovement
  LowStockAlert: LowStockAlert | null
}

export interface RecipeLine {
  InventoryItemId: number
  ItemName: string
  Unit: string
  QuantityRequired: number
}

export interface Recipe {
  MenuItemId: number
  MenuItemName: string
  Lines: RecipeLine[]
}

// --- Tables & payments ------------------------------------------------------------------

export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED'

export interface DiningTable {
  Id: number
  TableNumber: string
  Capacity: number
  Status: TableStatus
  CurrentOrder: { OrderId: number; OrderNumber: string; GuestCount: number; NetAmount: number; OrderDate: string } | null
}

export interface TableList {
  Total: number
  Available: number
  Occupied: number
  Reserved: number
  Items: DiningTable[]
}

export interface SettleInput {
  OrderId: number
  PaymentMethod: PaymentMethod
  RedeemPoints: number
  AmountTendered?: number
}

export interface BillBreakdown {
  SubTotal: number
  OrderDiscount: number
  TierName: string | null
  TierDiscountPercentage: number
  TierDiscount: number
  AmountDue: number
  PointsRedeemed: number
  PointsRedemptionAmount: number
  AmountPayable: number
  AmountTendered: number
  ChangeDue: number
  PointsEarned: number
  PointsBalanceBefore: number | null
  PointsBalanceAfter: number | null
}

export interface PaymentPreview {
  OrderId: number
  OrderNumber: string
  PaymentMethod: string
  Bill: BillBreakdown
}

export interface Invoice {
  InvoiceNumber: string
  RestaurantName: string
  PaidAt: string
  OrderNumber: string
  OrderType: string
  TableNumber: string | null
  GuestCount: number
  CustomerName: string | null
  CustomerPhone: string | null
  CashierName: string | null
  PaymentMethod: string
  Lines: { MenuItemName: string; Quantity: number; UnitPrice: number; TotalPrice: number }[]
  Bill: BillBreakdown
  LowStockAlerts: LowStockAlert[]
}

// --- Dashboards & analytics -------------------------------------------------------------

export interface AdminSummary {
  BusinessDate: string
  SalesToday: number
  CompletedOrdersToday: number
  OrdersToday: number
  GuestsToday: number
  AverageOrderValueToday: number
  PendingOrders: number
  ActiveTables: number
  ReservedTables: number
  TotalTables: number
  LowStockItems: number
  OutOfStockItems: number
}

export interface Overview {
  TotalOrders: number
  GrossSales: number
  TotalRevenue: number
  NetProfit: number
  ProfitMarginPercentage: number
  AverageOrderValue: number
  TotalGuests: number
  AverageSpendPerGuest: number
}

export interface RevenuePoint {
  Period: string
  Revenue: number
  Orders: number
}

export interface RevenueChart {
  Daily: RevenuePoint[]
  Monthly: RevenuePoint[]
}

export interface HeatmapCell {
  DayOfWeek: number
  DayName: string
  Hour: number
  Orders: number
  Revenue: number
}

export interface HourlyHeatmap {
  Cells: HeatmapCell[]
  MaxOrders: number
  BusiestSlot: HeatmapCell | null
}

export interface RFMMatrixCell {
  RScore: number
  Score: number
  Customers: number
  AverageMonetary: number
}

export interface RFMMatrix {
  PurchasingCustomers: number
  FrequencyMatrix: RFMMatrixCell[]
  MonetaryMatrix: RFMMatrixCell[]
}

export interface TopItem {
  Rank: number
  MenuItemId: number
  MenuItemName: string
  CategoryName: string
  QuantitySold: number
  Revenue: number
  RevenueSharePercentage: number
}

export interface SegmentSummary {
  Segment: string
  Customers: number
  Revenue: number
  ShareOfCustomersPercentage: number
}

export interface TopPerforming {
  PeriodDays: number
  TopItems: TopItem[]
  TopSpendingSegments: SegmentSummary[]
}

export interface AuditLog {
  Id: number
  UserId: number | null
  UserName: string | null
  UserEmail: string | null
  Action: string
  EntityName: string
  EntityId: string | null
  OldValues: Record<string, unknown> | null
  NewValues: Record<string, unknown> | null
  IPAddress: string | null
  Timestamp: string
}

// --- Customer portal --------------------------------------------------------------------

export interface TierInfo {
  Name: string
  MinPoints: number
  DiscountPercentage: number
}

export interface CustomerMe {
  CustomerId: number
  Name: string
  Phone: string
  Email: string | null
  MemberSince: string
  LoyaltyPoints: number
  PointsValue: number
  TierStatus: { Tier: string; DiscountPercentage: number; NextTier: string | null; PointsToNextTier: number | null }
  Tiers: TierInfo[]
  TotalOrders: number
  TotalSpent: number
  LastOrderDate: string | null
}

export interface MyOrder extends Order {
  TrackingStatus: string
  IsOpen: boolean
}

export interface Recommendation {
  MenuItemId: number
  Name: string
  CategoryName: string
  Price: number
  Reason: string
}

export interface Recommendations {
  BasedOnOrders: number
  FavouriteCategories: string[]
  Items: Recommendation[]
}

// --- Branch analytics (RBAC Phase 1) -----------------------------------------------------

export interface ChannelMixEntry {
  Channel: string
  OrderCount: number
  Revenue: number
  SharePercentage: number
}

export interface ChannelMixResponse {
  BranchId: number | null
  Channels: ChannelMixEntry[]
}

export type MenuQuadrant = 'Profit Driver' | 'Volume Driver' | 'Hidden Opportunity' | 'Low Performer'

export interface MenuQuadrantItem {
  MenuItemId: number
  MenuItemName: string
  CategoryName: string
  QuantitySold: number
  Revenue: number
  Margin: number
  MarginPercentage: number
  Quadrant: MenuQuadrant
}

export interface MenuQuadrantResponse {
  BranchId: number | null
  MedianQuantity: number
  MedianMarginPercentage: number
  Items: MenuQuadrantItem[]
}

export interface BusinessRecommendation {
  Title: string
  Priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  Evidence: string
  SuggestedAction: string
}

export interface WastageByItem {
  InventoryItemId: number
  ItemName: string
  Unit: string
  TotalWasted: number
  WastageCost: number
  IncidentCount: number
}

export interface WastageByReason {
  Reason: string
  TotalWasted: number
  WastageCost: number
  IncidentCount: number
}

export interface WastageSummaryResponse {
  BranchId: number | null
  TotalWastageCost: number
  ByItem: WastageByItem[]
  ByReason: WastageByReason[]
}

export interface DemandForecastHour {
  Hour: number
  AverageQuantityConsumed: number
}

export interface StockingRecommendation {
  ItemName: string
  PeakHour: number
  RecommendedPrepQuantity: number
  Unit: string
  Reasoning: string
}

export interface DemandModelAccuracy {
  mae: number | null
  rmse: number | null
  mape_percent: number | null
  improvement_over_baseline_percent: number | null
}

export interface DemandForecastResponse {
  BranchId: number | null
  HourlyPattern: DemandForecastHour[]
  PeakHour: number | null
  Recommendations: StockingRecommendation[]
  IsMLPowered: boolean
  ModelAccuracy: DemandModelAccuracy | null
  UsedSystemWideFallback: boolean
}

export interface BranchComparisonRow {
  BranchId: number
  BranchName: string
  City: string
  IsActive: boolean
  OrderCount: number
  Revenue: number
  Profit: number
  ProfitMarginPercentage: number
  WastageCost: number
  AverageRating: number | null
  CustomerCount: number
}

export interface BranchComparisonResponse {
  Period: { StartDate: string | null; EndDate: string | null }
  Branches: BranchComparisonRow[]
}

export interface SalesAnomaly {
  BranchId: number
  BranchName: string
  Date: string
  Revenue: number
  TrailingAverageRevenue: number
  DeviationPercentage: number
  Type: 'SPIKE' | 'DROP'
  Severity: 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

export interface AnomalyReportResponse {
  SalesAnomalies: SalesAnomaly[]
}

// --- Ratings -------------------------------------------------------------------------------

export interface Rating {
  Id: number
  MenuItemId: number
  MenuItemName: string
  CustomerId: number
  CustomerName: string
  OrderId: number | null
  BranchId: number | null
  Score: number
  Comment: string | null
  CreatedAt: string
}

export interface RatingCreateInput {
  MenuItemId: number
  OrderId?: number | null
  Score: number
  Comment?: string | null
}

export interface MarketBasketRule {
  antecedent: string[]
  consequent: string[]
  support: number
  confidence: number
  lift: number
}

export interface PriceSensitivityItem {
  menu_item_id: number
  menu_item_name: string
  price_quantity_correlation: number | null
  elasticity_label: string
  interpretation: string
}

export interface PromotionTrapItem {
  promotion_id: number
  promotion_name: string
  menu_item_id: number
  menu_item_name: string
  revenue_lift_percent: number
  margin_percent: number
  volume_lift_percent: number
  severity: string
}

export interface MLRecommendation {
  priority: string
  category: string
  title: string
  menu_item_id: number | null
  menu_item_name: string | null
  justification: string
  metrics: Record<string, unknown>
  action: string
}

export interface ClassifierMetrics {
  display_name?: string
  accuracy: number
  weighted_precision: number
  weighted_recall: number
  macro_f1: number
  train_rows: number
  test_rows: number
  feature_columns?: string[]
  label_classes?: string[]
}

export interface RegressorMetrics {
  mae: number
  rmse: number
  mape_percent: number
  baseline_mae?: number
  improvement_over_baseline_percent?: number
  train_rows: number
  test_rows: number
  feature_columns?: string[]
  saved_path?: string
}

export interface SparkPipelineMetrics {
  pipeline: string
  menu_performance_classification: {
    best_model: string
    best_model_display_name: string
    best_macro_f1: number
    candidates: Record<string, ClassifierMetrics>
    feature_columns: string[]
    label_classes: string[]
    saved_path: string
  }
  demand_forecasting: RegressorMetrics
}

export interface PythonPipelineMetrics {
  pipeline: string
  menu_performance_classification: ClassifierMetrics
  demand_forecasting: RegressorMetrics
  wastage_prediction: RegressorMetrics
  churn_risk_classification: ClassifierMetrics
}

export interface MenuClassComparisonRecord {
  menu_item_id: number
  menu_item_name: string
  actual_class: string
  spark_prediction: string
  xgboost_prediction: string
  match: boolean
  disagreement_reason: string | null
}

export interface DemandForecastComparisonRecord {
  menu_item_id: number
  menu_item_name: string
  year_month: string
  actual_next_month_quantity: number
  spark_prediction: number
  python_prediction: number
  numerical_difference: number
  match: boolean
}

export interface DualPipelineComparison {
  menu_performance_classification: {
    total_records: number
    matched_count: number
    mismatched_count: number
    agreement_percent: number
    spark_accuracy_vs_actual: number
    xgboost_accuracy_vs_actual: number
    comparisons: MenuClassComparisonRecord[]
  }
  demand_forecast_regression: {
    task: string
    total_records: number
    matched_count: number
    mismatched_count: number
    agreement_percent: number
    mean_absolute_difference: number
    records: DemandForecastComparisonRecord[]
  }
}

export interface DualPipelineComparisonResponse {
  spark_pipeline: SparkPipelineMetrics
  python_pipeline: PythonPipelineMetrics
  comparison: DualPipelineComparison
}

export interface ChurnRiskCustomer {
  CustomerId: number
  Name: string
  RecencyDays: number
  Frequency: number
  Monetary: number
  AvgOrderValue: number
  TenureDays: number
  ChurnProbability: number
  RiskLabel: string
}

export interface ChurnRiskResponse {
  ScoredCustomers: number
  Customers: ChurnRiskCustomer[]
}

export interface WhatIfRequest {
  menu_item_id: number
  price_change_percent: number
  discount_percent: number
  remove_item: boolean
  prep_quantity_change_percent: number
  wastage_assumption_change_percent: number
}

export interface WhatIfResponse {
  menu_item_id: number
  menu_item_name: string
  price_change_percent: number
  discount_percent: number
  remove_item: boolean
  prep_quantity_change_percent: number
  wastage_assumption_change_percent: number
  elasticity_coefficient: number
  current_price: number
  projected_price: number
  current_quantity: number
  projected_quantity: number
  current_revenue: number
  projected_revenue: number
  current_profit: number
  projected_profit: number
  current_margin_percent: number
  projected_margin_percent: number
  revenue_delta_percent: number
  profit_delta_percent: number
  volume_delta_percent: number
}

export interface RatingAnomalyItem {
  menu_item_id: number
  menu_item_name: string
  date: string
  anomaly_type: string
  rating_count: number
  average_score: number
  trailing_average_score: number
  reason: string
}

export interface SlowMovingDish {
  menu_item_id: number
  menu_item_name: string
  total_quantity_sold: number
  order_count: number
  recency_days: number
  margin_percent: number
  recent_30d_quantity: number
  prior_30d_quantity: number
  signal_count: number
  signals: string[]
}

export interface WastageRiskItem {
  MenuItemId: number
  MenuItemName: string
  PredictedWastagePercent: number
  RiskLabel: string
  TotalQuantitySold: number
  AvgRating: number
}

export interface DemandForecastItem {
  MenuItemId: number
  MenuItemName: string
  CurrentMonthQuantity: number
  PredictedNextMonthQuantity: number
}

// --- Assistant (floating chat widget) ----------------------------------------------------

export interface AssistantMessage {
  Role: 'user' | 'assistant'
  Text: string
}

export interface AssistantChatRequest {
  Message: string
  Page: string
  History: AssistantMessage[]
  UserRole?: RoleName | null
}

export interface AssistantChatResponse {
  Reply: string
  Configured: boolean
}
