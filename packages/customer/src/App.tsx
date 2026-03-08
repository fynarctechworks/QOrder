import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import LoadingScreen from './components/LoadingScreen';
import AnimatedPage from './components/AnimatedPage';
import ErrorBoundary from './components/ErrorBoundary';
import RestaurantLayout from './layouts/RestaurantLayout';

// Lazy load pages for code splitting
const TableLandingPage = lazy(() => import('./pages/TableLandingPage'));
const MenuPage = lazy(() => import('./pages/MenuPage'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const ItemDetailPage = lazy(() => import('./pages/ItemDetailPage'));
const CartPage = lazy(() => import('./pages/CartPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const PayBillPage = lazy(() => import('./pages/PayBillPage'));
const OrderStatusPage = lazy(() => import('./pages/OrderStatusPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const QueueDisplayPage = lazy(() => import('./pages/QueueDisplayPage'));

// Group order pages
const JoinGroupPage = lazy(() => import('./pages/JoinGroupPage'));
const CreateGroupPage = lazy(() => import('./pages/CreateGroupPage'));
const GroupDashboardPage = lazy(() => import('./pages/GroupDashboardPage'));

function App() {
  return (
    <ErrorBoundary>
    <div className="min-h-screen bg-background w-full overflow-x-hidden">
      <Suspense fallback={<LoadingScreen />}>
          <Routes>
            {/* Restaurant-scoped routes — providers mount ONCE here */}
            <Route path="/r/:restaurantSlug/t/:tableId" element={<RestaurantLayout />}>
              <Route index element={<TableLandingPage />} />
              <Route path="menu" element={<MenuPage />} />
              <Route path="category/:categoryId" element={<CategoryPage />} />
              <Route path="item/:itemId" element={<ItemDetailPage />} />
              <Route path="cart" element={<CartPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="pay" element={<PayBillPage />} />
              <Route path="group/create" element={<CreateGroupPage />} />
            </Route>

            {/* Group order routes (standalone — outside restaurant layout) */}
            <Route
              path="/join"
              element={
                <SocketProvider>
                  <AnimatedPage><JoinGroupPage /></AnimatedPage>
                </SocketProvider>
              }
            />
            <Route
              path="/group/:code"
              element={
                <SocketProvider>
                  <AnimatedPage><GroupDashboardPage /></AnimatedPage>
                </SocketProvider>
              }
            />

            {/*
             * OrderStatusPage lives outside RestaurantProvider because it is
             * accessed via /order-status/:orderId, which has no :restaurantSlug
             * or :tableId params.  The page reads restaurant name, currency,
             * and table number from localStorage (persisted by RestaurantProvider)
             * so it can still render header info and format prices.
             */}
            <Route
              path="/order-status/:orderId"
              element={
                <SocketProvider>
                  <AnimatedPage><OrderStatusPage /></AnimatedPage>
                </SocketProvider>
              }
            />

            {/* Public queue display for TV/kiosk screens */}
            <Route
              path="/queue/:restaurantId"
              element={<AnimatedPage><QueueDisplayPage /></AnimatedPage>}
            />

          {/* Root redirect */}
          <Route path="/" element={<AnimatedPage><NotFoundPage /></AnimatedPage>} />

          {/* Legacy cart route redirect */}
          <Route path="/cart" element={<Navigate to="/" replace />} />

          {/* 404 */}
          <Route path="*" element={<AnimatedPage><NotFoundPage /></AnimatedPage>} />
        </Routes>
      </Suspense>
    </div>
    </ErrorBoundary>
  );
}

export default App;
