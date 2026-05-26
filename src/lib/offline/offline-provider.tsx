'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  syncStoreData,
  processPendingOrders,
  startPeriodicSync,
  getPendingOrderCount,
} from '@/lib/offline/sync';

interface OfflineContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncAt: string | null;
  pendingOrderCount: number;
  triggerSync: () => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue>({
  isOnline: true,
  isSyncing: false,
  lastSyncAt: null,
  pendingOrderCount: 0,
  triggerSync: async () => {},
});

export function useOffline() {
  return useContext(OfflineContext);
}

interface OfflineProviderProps {
  storeId: number | null;
  children: ReactNode;
}

export function OfflineProvider({ storeId, children }: OfflineProviderProps) {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [pendingOrderCount, setPendingOrderCount] = useState(0);

  // ─── Online/Offline detection ──────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      console.log('[Offline] Back online');
      setIsOnline(true);
    };

    const handleOffline = () => {
      console.log('[Offline] Gone offline');
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ─── Periodic sync + initial sync ──────────────────────────────────
  useEffect(() => {
    if (!storeId) return;

    const stopSync = startPeriodicSync(storeId);
    return stopSync;
  }, [storeId]);

  // ─── Sync pending orders when coming back online ───────────────────
  useEffect(() => {
    if (!isOnline || !storeId) return;

    (async () => {
      const count = await processPendingOrders(storeId);
      if (count > 0) {
        console.log(`[Offline] Synced ${count} pending orders`);
      }
      setPendingOrderCount(await getPendingOrderCount(storeId));
    })();
  }, [isOnline, storeId]);

  // ─── Manual sync trigger ───────────────────────────────────────────
  const triggerSync = useCallback(async () => {
    if (!storeId || !isOnline) return;

    setIsSyncing(true);
    try {
      await syncStoreData(storeId);
      await processPendingOrders(storeId);
      setLastSyncAt(new Date().toISOString());
      setPendingOrderCount(await getPendingOrderCount(storeId));
    } catch (error) {
      console.error('[Offline] Manual sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [storeId, isOnline]);

  // ─── Refresh pending count periodically ────────────────────────────
  useEffect(() => {
    if (!storeId) return;

    const interval = setInterval(async () => {
      setPendingOrderCount(await getPendingOrderCount(storeId));
    }, 30_000);

    return () => clearInterval(interval);
  }, [storeId]);

  return (
    <OfflineContext.Provider
      value={{ isOnline, isSyncing, lastSyncAt, pendingOrderCount, triggerSync }}
    >
      {children}
    </OfflineContext.Provider>
  );
}
