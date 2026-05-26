'use client';

import { useEffect, useState } from 'react';

/**
 * ServiceWorkerRegistrar — registers the Ventify POS service worker on mount.
 * Also shows an "Update available" banner when a new SW version is detected.
 */
export function ServiceWorkerRegistrar() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) {
      console.log('[PWA] Service Worker not supported');
      return;
    }

    async function registerSW() {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        setRegistration(reg);
        console.log('[PWA] Service Worker registered, scope:', reg.scope);

        // Listen for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              // New version available
              console.log('[PWA] New version available');
              setUpdateAvailable(true);
            }
          });
        });

        // Check for updates every 30 minutes
        const interval = setInterval(() => {
          reg.update();
        }, 30 * 60 * 1000);

        return () => clearInterval(interval);
      } catch (error) {
        console.error('[PWA] Service Worker registration failed:', error);
      }
    }

    registerSW();
  }, []);

  const handleUpdate = () => {
    if (!registration?.waiting) return;
    // Tell the waiting SW to activate
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    setUpdateAvailable(false);
    // Reload to pick up the new SW
    window.location.reload();
  };

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-lg animate-in slide-in-from-bottom-5">
      <div className="flex-1">
        <p className="text-sm font-medium">Nueva versión disponible</p>
        <p className="text-xs text-muted-foreground">
          Actualiza para obtener la última versión de Ventify POS
        </p>
      </div>
      <button
        onClick={handleUpdate}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Actualizar
      </button>
    </div>
  );
}
