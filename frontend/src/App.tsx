import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { ShimmerSkeleton, ToastProvider } from './components/ui'
import { AuthProvider, useAuth } from './context/AuthContext'
import { BranchProvider } from './context/BranchContext'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import type { RoleName } from './types/api'
import { homeFor } from './utils/roles'

// Each page is its own chunk: a cashier never downloads the admin charts.
const AdminOverviewPage = lazy(() => import('./pages/AdminOverviewPage').then((m) => ({ default: m.AdminOverviewPage })))
const CategoryManagementPage = lazy(() => import('./pages/CategoryManagementPage').then((m) => ({ default: m.CategoryManagementPage })))
const MenuItemMapperPage = lazy(() => import('./pages/MenuItemMapperPage').then((m) => ({ default: m.MenuItemMapperPage })))
const CustomerSearchPage = lazy(() => import('./pages/CustomerSearchPage').then((m) => ({ default: m.CustomerSearchPage })))
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage').then((m) => ({ default: m.AuditLogsPage })))
const RestaurantBranchesPage = lazy(() => import('./pages/RestaurantBranchesPage').then((m) => ({ default: m.RestaurantBranchesPage })))
const AddBranchPage = lazy(() => import('./pages/AddBranchPage').then((m) => ({ default: m.AddBranchPage })))
const EditBranchPage = lazy(() => import('./pages/EditBranchPage').then((m) => ({ default: m.EditBranchPage })))
const UserAccountsPage = lazy(() => import('./pages/UserAccountsPage').then((m) => ({ default: m.UserAccountsPage })))
const CreateUserPage = lazy(() => import('./pages/CreateUserPage').then((m) => ({ default: m.CreateUserPage })))
const InventoryDashboard = lazy(() => import('./pages/InventoryDashboard').then((m) => ({ default: m.InventoryDashboard })))
const AddInventoryItemPage = lazy(() => import('./pages/AddInventoryItemPage').then((m) => ({ default: m.AddInventoryItemPage })))
const EditInventoryItemPage = lazy(() => import('./pages/EditInventoryItemPage').then((m) => ({ default: m.EditInventoryItemPage })))
const StockAdjustmentPage = lazy(() => import('./pages/StockAdjustmentPage').then((m) => ({ default: m.StockAdjustmentPage })))
const RecipeBuilderPage = lazy(() => import('./pages/RecipeBuilderPage').then((m) => ({ default: m.RecipeBuilderPage })))
const StockMovementLogPage = lazy(() => import('./pages/StockMovementLogPage').then((m) => ({ default: m.StockMovementLogPage })))
const PosDashboard = lazy(() => import('./pages/PosDashboard').then((m) => ({ default: m.PosDashboard })))
const NewTakeawayOrderPage = lazy(() => import('./pages/NewTakeawayOrderPage').then((m) => ({ default: m.NewTakeawayOrderPage })))
const CustomerPortal = lazy(() => import('./pages/CustomerPortal').then((m) => ({ default: m.CustomerPortal })))
const BranchOverviewPage = lazy(() => import('./pages/BranchOverviewPage').then((m) => ({ default: m.BranchOverviewPage })))
const ChannelMixPage = lazy(() => import('./pages/ChannelMixPage').then((m) => ({ default: m.ChannelMixPage })))
const MenuPerformancePage = lazy(() => import('./pages/MenuPerformancePage').then((m) => ({ default: m.MenuPerformancePage })))
const BranchRecommendationsPage = lazy(() => import('./pages/BranchRecommendationsPage').then((m) => ({ default: m.BranchRecommendationsPage })))
const WastageAnalyticsPage = lazy(() => import('./pages/WastageAnalyticsPage').then((m) => ({ default: m.WastageAnalyticsPage })))
const DemandForecastPage = lazy(() => import('./pages/DemandForecastPage').then((m) => ({ default: m.DemandForecastPage })))
const BranchComparisonPage = lazy(() => import('./pages/BranchComparisonPage').then((m) => ({ default: m.BranchComparisonPage })))
const AnomalyDetectionPage = lazy(() => import('./pages/AnomalyDetectionPage').then((m) => ({ default: m.AnomalyDetectionPage })))
const MenuBrowsePage = lazy(() => import('./pages/MenuBrowsePage').then((m) => ({ default: m.MenuBrowsePage })))
const RatingsFeedbackPage = lazy(() => import('./pages/RatingsFeedbackPage').then((m) => ({ default: m.RatingsFeedbackPage })))

function Page({ roles, children }: { roles: RoleName[]; children: ReactNode }) {
  return (
    <ProtectedRoute roles={roles}>
      <Suspense fallback={<ShimmerSkeleton className="h-96" rounded="rounded-2xl" />}>{children}</Suspense>
    </ProtectedRoute>
  )
}

function Home() {
  const { user, restoring } = useAuth()
  if (restoring) return null
  return <Navigate to={user ? homeFor(user.Role) : '/login'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <BranchProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route element={<AppLayout />}>
              <Route
                path="/admin"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN']}>
                    <AdminOverviewPage />
                  </Page>
                }
              />
              <Route
                path="/admin/categories"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN']}>
                    <CategoryManagementPage />
                  </Page>
                }
              />
              <Route
                path="/admin/menu-mapper"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN']}>
                    <MenuItemMapperPage />
                  </Page>
                }
              />
              <Route
                path="/admin/customers"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN']}>
                    <CustomerSearchPage />
                  </Page>
                }
              />
              <Route
                path="/admin/audit"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN']}>
                    <AuditLogsPage />
                  </Page>
                }
              />
              <Route
                path="/admin/branches"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN']}>
                    <RestaurantBranchesPage />
                  </Page>
                }
              />
              <Route
                path="/admin/branches/new"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN']}>
                    <AddBranchPage />
                  </Page>
                }
              />
              <Route
                path="/admin/branches/:id/edit"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN']}>
                    <EditBranchPage />
                  </Page>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN']}>
                    <UserAccountsPage />
                  </Page>
                }
              />
              <Route
                path="/admin/users/new"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN']}>
                    <CreateUserPage />
                  </Page>
                }
              />
              <Route
                path="/inventory"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN', 'INVENTORY_MANAGER']}>
                    <InventoryDashboard />
                  </Page>
                }
              />
              <Route
                path="/inventory/new-item"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN', 'INVENTORY_MANAGER']}>
                    <AddInventoryItemPage />
                  </Page>
                }
              />
              <Route
                path="/inventory/items/:id/edit"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN', 'INVENTORY_MANAGER']}>
                    <EditInventoryItemPage />
                  </Page>
                }
              />
              <Route
                path="/inventory/adjust-stock"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN', 'INVENTORY_MANAGER']}>
                    <StockAdjustmentPage />
                  </Page>
                }
              />
              <Route
                path="/inventory/recipes"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN', 'INVENTORY_MANAGER']}>
                    <RecipeBuilderPage />
                  </Page>
                }
              />
              <Route
                path="/inventory/movement-log"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN', 'INVENTORY_MANAGER']}>
                    <StockMovementLogPage />
                  </Page>
                }
              />
              <Route
                path="/pos"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN', 'CASHIER']}>
                    <PosDashboard />
                  </Page>
                }
              />
              <Route
                path="/pos/new-order"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN', 'CASHIER']}>
                    <NewTakeawayOrderPage />
                  </Page>
                }
              />
              <Route
                path="/customer"
                element={
                  <Page roles={['CUSTOMER']}>
                    <CustomerPortal />
                  </Page>
                }
              />
              <Route
                path="/customer/menu"
                element={
                  <Page roles={['CUSTOMER']}>
                    <MenuBrowsePage />
                  </Page>
                }
              />
              <Route
                path="/customer/ratings"
                element={
                  <Page roles={['CUSTOMER']}>
                    <RatingsFeedbackPage />
                  </Page>
                }
              />
              <Route
                path="/dashboard/restaurant-manager"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_MANAGER']}>
                    <BranchOverviewPage />
                  </Page>
                }
              />
              <Route
                path="/dashboard/restaurant-manager/channel-mix"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_MANAGER']}>
                    <ChannelMixPage />
                  </Page>
                }
              />
              <Route
                path="/dashboard/restaurant-manager/menu-performance"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_MANAGER']}>
                    <MenuPerformancePage />
                  </Page>
                }
              />
              <Route
                path="/dashboard/restaurant-manager/recommendations"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_MANAGER']}>
                    <BranchRecommendationsPage />
                  </Page>
                }
              />
              <Route
                path="/dashboard/inventory-manager/wastage"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN', 'INVENTORY_MANAGER']}>
                    <WastageAnalyticsPage />
                  </Page>
                }
              />
              <Route
                path="/dashboard/inventory-manager/demand-forecast"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN', 'INVENTORY_MANAGER']}>
                    <DemandForecastPage />
                  </Page>
                }
              />
              <Route
                path="/admin/branch-comparison"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN']}>
                    <BranchComparisonPage />
                  </Page>
                }
              />
              <Route
                path="/admin/anomalies"
                element={
                  <Page roles={['SUPER_ADMIN', 'ADMIN']}>
                    <AnomalyDetectionPage />
                  </Page>
                }
              />
            </Route>
            <Route path="*" element={<Home />} />
          </Routes>
          </BranchProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
