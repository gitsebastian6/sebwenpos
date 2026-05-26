'use client';

import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enqueuePendingOrder, processPendingOrders } from '@/lib/offline/sync';
import { useOffline } from '@/lib/offline/offline-provider';

interface UseOfflineOrderOptions {
  storeId: number | null;
  cashRegisterId?: number;
  onSuccess?: (data: any, isOffline: boolean) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook to create orders that work both online and offline.
 * - Online: directly POST to /api/orders
 * - Offline: enqueue in IndexedDB pending queue, sync when back online
 */
export function useOfflineOrder({
  storeId,
  cashRegisterId,
  onSuccess,
  onError,
}: UseOfflineOrderOptions) {
  const { isOnline } = useOffline();
  const queryClient = useQueryClient();
  const [offlineQueueSize, setOfflineQueueSize] = useState(0);

  const mutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!storeId) throw new Error('No store selected');

      if (isOnline) {
        // ── Online: submit directly ──
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const error = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(error.error || 'Error al crear la orden');
        }

        return { data: await res.json(), offline: false };
      } else {
        // ── Offline: queue in IndexedDB ──
        if (!cashRegisterId) {
          throw new Error('Se requiere una caja abierta para registrar ventas offline');
        }

        const tempNumber = await enqueuePendingOrder(storeId, payload);
        setOfflineQueueSize((prev) => prev + 1);

        return {
          data: {
            tempOrderNumber: tempNumber,
            offline: true,
            message: 'Venta registrada offline. Se sincronizará cuando vuelva la conexión.',
          },
          offline: true,
        };
      }
    },
    onSuccess: (result) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['pos-recent-sales'] });
      queryClient.invalidateQueries({ queryKey: ['pos-cash-register'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });

      if (result.offline) {
        // Also invalidate offline product stock (decremented optimistically)
        queryClient.invalidateQueries({ queryKey: ['offline-products'] });
      }

      onSuccess?.(result.data, result.offline);
    },
    onError: (error) => {
      onError?.(error);
    },
  });

  const processQueue = useCallback(async () => {
    if (!storeId || !isOnline) return;

    const synced = await processPendingOrders(storeId);
    if (synced > 0) {
      setOfflineQueueSize(0);
      queryClient.invalidateQueries({ queryKey: ['pos-recent-sales'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    }
  }, [storeId, isOnline, queryClient]);

  return {
    createOrder: mutation.mutate,
    createOrderAsync: mutation.mutateAsync,
    isCreating: mutation.isPending,
    offlineQueueSize,
    processQueue,
    ...mutation,
  };
}
