import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import DashboardLayout from './layouts/DashboardLayout';
import LoadingScreen from './components/LoadingScreen';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy load pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignUpPage = lazy(() => import('./pages/SignUpPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const MenuPage = lazy(() => import('./pages/MenuPage'));
const TablesPage = lazy(() => import('./pages/TablesPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));

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

            {/* Protected routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="menu" element={
                <ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER']}>
                  <MenuPage />
                </ProtectedRoute>
              } />
              <Route path="tables" element={<TablesPage />} />
              <Route path="analytics" element={
                <ProtectedRoute allowedRoles={['OWNER', 'ADMIN', 'MANAGER']}>
                  <AnalyticsPage />
                </ProtectedRoute>
              } />
              <Route path="settings" element={
                <ProtectedRoute allowedRoles={['OWNER', 'ADMIN']}>
                  <SettingsPage />
                </ProtectedRoute>
              } />
            </Route>

            {/* 404 Not Found */}
            <Route path="*" element={
              <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
                <h1 className="text-6xl font-bold text-gray-300 mb-2">404</h1>
                <p className="text-lg font-semibold text-text-primary mb-1">Page not found</p>
                <p className="text-sm text-text-muted mb-6">The page you’re looking for doesn’t exist or has been moved.</p>
                <a href="/dashboard" className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-medium hover:bg-primary-hover transition-colors">
                  Go to Dashboard
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
