import { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import DashboardLayout from './layouts/DashboardLayout';
import LoadingScreen from './components/LoadingScreen';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import RoleRedirect from './components/RoleRedirect';

// Lazy load pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignUpPage = lazy(() => import('./pages/SignUpPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const CreateOrderPage = lazy(() => import('./pages/CreateOrderPage'));
const MenuPage = lazy(() => import('./pages/MenuPage'));
const TablesPage = lazy(() => import('./pages/TablesPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const BranchesPage = lazy(() => import('./pages/BranchesPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const KitchenPage = lazy(() => import('./pages/KitchenPage'));
const DiscountsPage = lazy(() => import('./pages/DiscountsPage'));
const FeedbackPage = lazy(() => import('./pages/FeedbackPage'));
const CrmPage = lazy(() => import('./pages/CrmPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const StaffManagementPage = lazy(() => import('./pages/StaffManagementPage'));
const CreditPage = lazy(() => import('./pages/CreditPage'));
const QSRPage = lazy(() => import('./pages/QSRPage'));
const PanCornerPage = lazy(() => import('./pages/PanCornerPage'));
const TVMenuPage = lazy(() => import('./pages/TVMenuPage'));

function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <SocketProvider>
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* Protected routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<RoleRedirect />} />
              <Route path="dashboard" element={
                <ProtectedRoute pageKey="dashboard">
                  <DashboardPage />
                </ProtectedRoute>
              } />
              <Route path="create-order" element={
                <ProtectedRoute pageKey="create-order">
                  <CreateOrderPage />
                </ProtectedRoute>
              } />
              <Route path="qsr" element={
                <ProtectedRoute pageKey="qsr">
                  <QSRPage />
                </ProtectedRoute>
              } />
              <Route path="pan-corner" element={
                <ProtectedRoute pageKey="pan-corner">
                  <PanCornerPage />
                </ProtectedRoute>
              } />
              <Route path="orders" element={
                <ProtectedRoute pageKey="orders">
                  <OrdersPage />
                </ProtectedRoute>
              } />
              <Route path="menu" element={
                <ProtectedRoute pageKey="menu">
                  <MenuPage />
                </ProtectedRoute>
              } />
              <Route path="tables" element={
                <ProtectedRoute pageKey="tables">
                  <TablesPage />
                </ProtectedRoute>
              } />
              <Route path="analytics" element={
                <ProtectedRoute pageKey="analytics">
                  <AnalyticsPage />
                </ProtectedRoute>
              } />
              <Route path="inventory" element={
                <ProtectedRoute pageKey="inventory">
                  <InventoryPage />
                </ProtectedRoute>
              } />
              <Route path="discounts" element={
                <ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER']}>
                  <DiscountsPage />
                </ProtectedRoute>
              } />
              <Route path="feedback" element={
                <ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER']}>
                  <FeedbackPage />
                </ProtectedRoute>
              } />
              <Route path="crm" element={
                <ProtectedRoute pageKey="crm">
                  <CrmPage />
                </ProtectedRoute>
              } />
              <Route path="credit" element={
                <ProtectedRoute pageKey="credit">
                  <CreditPage />
                </ProtectedRoute>
              } />
              <Route path="reports" element={
                <ProtectedRoute pageKey="reports">
                  <ReportsPage />
                </ProtectedRoute>
              } />
              <Route path="staff-management" element={
                <ProtectedRoute pageKey="staff-management">
                  <StaffManagementPage />
                </ProtectedRoute>
              } />
              <Route path="tv-menu" element={
                <ProtectedRoute pageKey="tv-menu">
                  <TVMenuPage />
                </ProtectedRoute>
              } />
              <Route path="branches" element={
                <ProtectedRoute allowedRoles={['OWNER', 'ADMIN']}>
                  <BranchesPage />
                </ProtectedRoute>
              } />
              <Route path="settings" element={
                <ProtectedRoute allowedRoles={['OWNER']}>
                  <SettingsPage />
                </ProtectedRoute>
              } />
            </Route>

            {/* Kitchen Display — full-screen, no sidebar */}
            <Route path="/kitchen" element={
              <ProtectedRoute pageKey="kitchen">
                <KitchenPage />
              </ProtectedRoute>
            } />

            {/* 404 Not Found */}
            <Route path="*" element={
              <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
                <h1 className="text-6xl font-bold text-gray-300 mb-2">404</h1>
                <p className="text-lg font-semibold text-text-primary mb-1">Page not found</p>
                <p className="text-sm text-text-muted mb-6">The page you’re looking for doesn’t exist or has been moved.</p>
                <a href="/" className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover transition-colors">
                  Go Home
                </a>
              </div>
            } />
          </Routes>
        </Suspense>
      </SocketProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
