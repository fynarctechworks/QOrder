import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { restaurantService } from '../services/restaurantService';
import { useCartStore } from '../state/cartStore';
import type { Restaurant, Table } from '../types';

interface RestaurantContextValue {
  restaurant: Restaurant | null;
  table: Table | null;
  isLoading: boolean;
  error: Error | null;
}

const RestaurantContext = createContext<RestaurantContextValue | null>(null);

interface RestaurantProviderProps {
  children: ReactNode;
}

export function RestaurantProvider({ children }: RestaurantProviderProps) {
  const { restaurantSlug, tableId } = useParams<{
    restaurantSlug: string;
    tableId: string;
  }>();
  const setRestaurantContext = useCartStore((s) => s.setRestaurantContext);

  const {
    data: restaurant,
    isLoading: isRestaurantLoading,
    error: restaurantError,
  } = useQuery({
    queryKey: ['restaurant', restaurantSlug],
    queryFn: () => restaurantService.getBySlug(restaurantSlug!),
    enabled: !!restaurantSlug,
    staleTime: 1000 * 30, // 30s — keep short so acceptsOrders toggle is picked up quickly
    refetchOnMount: 'always',
  });

  const {
    data: table,
    isLoading: isTableLoading,
    error: tableError,
  } = useQuery({
    queryKey: ['table', restaurant?.id, tableId],
    queryFn: () => restaurantService.getTable(restaurant!.id, tableId!),
    enabled: !!restaurant?.id && !!tableId,
    staleTime: 1000 * 30, // 30s — keep short so rotated session tokens are picked up quickly
    refetchOnMount: 'always',
  });

  // Set cart context when restaurant and table are loaded
  useEffect(() => {
    if (restaurant?.id && tableId) {
      setRestaurantContext(restaurant.id, tableId);
    }
  }, [restaurant?.id, tableId, setRestaurantContext]);

  // Persist slug + table for back-navigation from OrderStatusPage
  useEffect(() => {
    if (restaurantSlug && tableId) {
      localStorage.setItem('lastRestaurantSlug', restaurantSlug);
      localStorage.setItem('lastTableId', tableId);
    }
  }, [restaurantSlug, tableId]);

  // Store session token for QR abuse prevention
  useEffect(() => {
    if (table?.sessionToken && tableId) {
      sessionStorage.setItem(`sessionToken:${tableId}`, table.sessionToken);
    }
  }, [table?.sessionToken, tableId]);

  // Persist restaurant name and table number for OrderStatusPage header
  useEffect(() => {
    if (restaurant?.name) {
      localStorage.setItem('lastRestaurantName', restaurant.name);
    }
    if (restaurant?.currency) {
      localStorage.setItem('lastRestaurantCurrency', restaurant.currency);
    }
    if (table?.number) {
      localStorage.setItem('lastTableNumber', table.number);
    }
  }, [restaurant?.name, restaurant?.currency, table?.number]);

  const value: RestaurantContextValue = {
    restaurant: restaurant ?? null,
    table: table ?? null,
    isLoading: isRestaurantLoading || isTableLoading,
    error: restaurantError || tableError || null,
  };

  return (
    <RestaurantContext.Provider value={value}>
      {children}
    </RestaurantContext.Provider>
  );
}

export function useRestaurant() {
  const context = useContext(RestaurantContext);
  if (!context) {
    throw new Error('useRestaurant must be used within RestaurantProvider');
  }
  return context;
}
