'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/auth-store';

// VAPID public key — must match the one used on the server to send push messages
// For now, we generate one and store it in the env. This is a placeholder that will be
// replaced with the actual key from the environment.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type NotificationPermission = 'default' | 'granted' | 'denied';

interface UsePushNotificationsReturn {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  requestPermission: () => Promise<NotificationPermission>;
}

/**
 * usePushNotifications — manages push notification subscription for the PWA.
 * Handles permission request, subscription creation, and server-side storage.
 */
export function usePushNotifications(): UsePushNotificationsReturn {
  const { store } = useAuthStore();
  const storeId = store?.id ?? null;

  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);

  // Check support on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const supported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;

    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission as NotificationPermission);
    }
  }, []);

  // Check if already subscribed
  useEffect(() => {
    if (!isSupported || !storeId) return;

    async function checkSubscription() {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setIsSubscribed(!!sub);
      } catch {
        setIsSubscribed(false);
      }
    }

    checkSubscription();
  }, [isSupported, storeId]);

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!isSupported) return 'denied';

    const result = await Notification.requestPermission();
    setPermission(result as NotificationPermission);
    return result as NotificationPermission;
  }, [isSupported]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !storeId || !VAPID_PUBLIC_KEY) {
      console.warn('[Push] Not supported, no store, or no VAPID key');
      return;
    }

    try {
      // Request permission if not granted
      let perm = permission;
      if (perm !== 'granted') {
        perm = await requestPermission();
        if (perm !== 'granted') {
          console.warn('[Push] Permission not granted');
          return;
        }
      }

      const reg = await navigator.serviceWorker.ready;

      // Check existing subscription
      let subscription = await reg.pushManager.getSubscription();

      if (!subscription) {
        // Create new subscription
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        });
      }

      // Send subscription to server
      const subJson = subscription.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      });

      if (res.ok) {
        setIsSubscribed(true);
        console.log('[Push] Subscription saved to server');
      } else {
        const error = await res.json().catch(() => ({}));
        console.error('[Push] Server rejected subscription:', error);
      }
    } catch (error) {
      console.error('[Push] Subscribe failed:', error);
    }
  }, [isSupported, storeId, permission, requestPermission]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;

    try {
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();

        // Remove from server
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }

      setIsSubscribed(false);
      console.log('[Push] Unsubscribed');
    } catch (error) {
      console.error('[Push] Unsubscribe failed:', error);
    }
  }, [isSupported]);

  return {
    isSupported,
    permission,
    isSubscribed,
    subscribe,
    unsubscribe,
    requestPermission,
  };
}
