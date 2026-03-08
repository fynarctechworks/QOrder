import { useState, useEffect, useCallback } from 'react';
import { syncOfflineOrders } from '../utils/offlineSync';
import { getQueuedOrderCount } from '../utils/offlineDb';

export function useOfflineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getQueuedOrderCount();
      setPendingCount(count);
    } catch {
      // IndexedDB not available
    }
  }, []);

  const triggerSync = useCallback(async () => {
    if (!navigator.onLine || isSyncing) return;
    setIsSyncing(true);
    try {
      const { synced, failed } = await syncOfflineOrders();
      await refreshPendingCount();
      return { synced, failed };
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshPendingCount]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    refreshPendingCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [triggerSync, refreshPendingCount]);

  return { isOnline, isSyncing, pendingCount, triggerSync, refreshPendingCount };
}
