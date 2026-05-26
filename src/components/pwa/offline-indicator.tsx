'use client';

import { useOffline } from '@/lib/offline/offline-provider';
import { Wifi, WifiOff, RefreshCw, CloudOff } from 'lucide-react';

/**
 * OfflineIndicator — shows online/offline status and pending order count.
 * Displayed in the app shell header.
 */
export function OfflineIndicator() {
  const { isOnline, isSyncing, pendingOrderCount, triggerSync } = useOffline();

  return (
    <div className="flex items-center gap-2">
      {/* Connection status */}
      {isOnline ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Wifi className="h-3.5 w-3.5 text-green-500" />
          <span className="hidden sm:inline">En línea</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-medium text-orange-600 dark:text-orange-400">
          <WifiOff className="h-3.5 w-3.5" />
          <span>Sin conexión</span>
        </div>
      )}

      {/* Pending orders badge */}
      {pendingOrderCount > 0 && (
        <div className="flex items-center gap-1.5 rounded-full bg-yellow-500/15 px-2.5 py-1 text-xs font-medium text-yellow-600 dark:text-yellow-400">
          <CloudOff className="h-3.5 w-3.5" />
          <span>{pendingOrderCount} pendiente{pendingOrderCount > 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Sync button */}
      {isSyncing && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          <span className="hidden sm:inline">Sincronizando...</span>
        </div>
      )}

      {/* Manual sync (only when online and not syncing) */}
      {isOnline && !isSyncing && pendingOrderCount > 0 && (
        <button
          onClick={triggerSync}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title="Sincronizar ahora"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
