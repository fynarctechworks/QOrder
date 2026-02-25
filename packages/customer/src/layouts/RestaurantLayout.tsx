import { Outlet } from 'react-router-dom';
import { RestaurantProvider, useRestaurant } from '../context/RestaurantContext';
import { SocketProvider } from '../context/SocketContext';
import AnimatedPage from '../components/AnimatedPage';
import BottomNav from '../components/BottomNav';

function NotAcceptingOrders({ restaurantName }: { restaurantName?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-red-50 px-6">
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-100 flex items-center justify-center">
          <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Not Accepting Orders</h1>
        <p className="text-gray-600 leading-relaxed">
          {restaurantName ? (
            <><span className="font-semibold">{restaurantName}</span> is currently not accepting orders. Please try again later.</>
          ) : (
            <>This restaurant is currently not accepting orders. Please try again later.</>
          )}
        </p>
        <div className="mt-8 inline-flex items-center gap-2 text-sm text-gray-400">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          Ordering is paused
        </div>
      </div>
    </div>
  );
}

function RestaurantContent() {
  const { restaurant, isLoading } = useRestaurant();

  if (!isLoading && restaurant && restaurant.settings?.acceptsOrders === false) {
    return <NotAcceptingOrders restaurantName={restaurant.name} />;
  }

  return (
    <>
      <div className="pb-16">
        <Outlet />
      </div>
      <BottomNav />
    </>
  );
}

/**
 * Layout route that wraps all restaurant-scoped pages.
 * Providers mount once here and persist across page navigations
 * within the /r/:restaurantSlug/t/:tableId/* route tree.
 */
export default function RestaurantLayout() {
  return (
    <RestaurantProvider>
      <SocketProvider>
        <AnimatedPage>
          <RestaurantContent />
        </AnimatedPage>
      </SocketProvider>
    </RestaurantProvider>
  );
}
