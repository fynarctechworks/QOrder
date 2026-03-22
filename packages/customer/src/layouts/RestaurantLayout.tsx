import { Outlet } from 'react-router-dom';
import { RestaurantProvider, useRestaurant } from '../context/RestaurantContext';
import { SocketProvider, useSocket } from '../context/SocketContext';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import AnimatedPage from '../components/AnimatedPage';
import BottomNav from '../components/BottomNav';
import FeedbackModal from '../components/FeedbackModal';

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
  const { restaurant, table, isLoading } = useRestaurant();
  const queryClient = useQueryClient();
  const { joinTableRoom, leaveTableRoom, onTableUpdated } = useSocket();
  const [showFeedback, setShowFeedback] = useState(false);
  const notAccepting = !isLoading && restaurant && restaurant.settings?.acceptsOrders === false;

  // Join the table socket room so we receive table:updated events
  useEffect(() => {
    if (!table?.id) return;
    joinTableRoom(table.id);
    return () => leaveTableRoom(table.id);
  }, [table?.id, joinTableRoom, leaveTableRoom]);

  // Show feedback overlay when admin settles payment (table freed)
  useEffect(() => {
    const unsub = onTableUpdated((data) => {
      if (data.status === 'available' && table?.id && data.tableId === table.id) {
        const key = `feedback_shown_${data.sessionToken || table.id}`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, '1');
          setShowFeedback(true);
        }
      }
    });
    return unsub;
  }, [onTableUpdated, table?.id]);

  // Auto-poll every 15s while orders are paused so the page recovers automatically
  useEffect(() => {
    if (!notAccepting) return;
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['restaurant'] });
    }, 15_000);
    return () => clearInterval(id);
  }, [notAccepting, queryClient]);

  if (notAccepting) {
    return <NotAcceptingOrders restaurantName={restaurant.name} />;
  }

  return (
    <>
      <div className="pb-16">
        <Outlet />
      </div>
      <BottomNav />
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
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
