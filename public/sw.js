/// <reference lib="webworker" />

const SW_VERSION = 'v1';

// ─── Cache Names ──────────────────────────────────────────────────────
const STATIC_CACHE = `sebwen-static-${SW_VERSION}`;
const RUNTIME_CACHE = `sebwen-runtime-${SW_VERSION}`;
const API_CACHE = `sebwen-api-${SW_VERSION}`;

// ─── App Shell: static assets to pre-cache on install ─────────────────
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/favicon.ico',
  '/apple-touch-icon.png',
];

// ─── Install: pre-cache App Shell ─────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Pre-caching App Shell');
      return cache.addAll(APP_SHELL);
    })
  );
  // Intentionally NOT calling self.skipWaiting() here — the new worker
  // stays in the "waiting" state until the user confirms via the
  // "Actualizar" banner (service-worker-registrar.tsx), which sends the
  // SKIP_WAITING message handled below. Auto-skipping would activate the
  // new SW before the user opts in, leaving registration.waiting empty
  // and making that banner's update button silently do nothing.
});

// ─── Activate: clean old caches ───────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE && key !== API_CACHE)
          .map((key) => {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          })
      )
    )
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// ─── Fetch: route-based caching strategies ────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (mutations, file uploads, etc.)
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) protocols
  if (!url.protocol.startsWith('http')) return;

  // ── Strategy 1: API calls → Network First with API cache fallback ──
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithTimeout(request, API_CACHE, 3000));
    return;
  }

  // ── Strategy 2: Static assets (JS/CSS/images) → Cache First ──
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  // ── Strategy 3: Navigation (HTML pages) → Network First ──
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithTimeout(request, RUNTIME_CACHE, 4000));
    return;
  }

  // ── Strategy 4: Everything else → Stale While Revalidate ──
  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
});

// ─── Caching Strategies ───────────────────────────────────────────────

/**
 * Cache First: try cache, fall back to network.
 * Good for immutable static assets (_next/static/).
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Return offline fallback for navigation
    if (request.mode === 'navigate') {
      return caches.match('/') || new Response('Offline', { status: 503 });
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/**
 * Network First with timeout: try network, fall back to cache.
 * Good for API calls and navigation where freshness matters.
 * @param {number} timeout - ms before falling back to cache
 */
async function networkFirstWithTimeout(request, cacheName, timeout) {
  try {
    const networkPromise = fetch(request);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Network timeout')), timeout)
    );

    const response = await Promise.race([networkPromise, timeoutPromise]);

    if (response && response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
      return response;
    }

    // Response not ok — try cache
    throw new Error('Response not ok');
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Navigation fallback to cached root
    if (request.mode === 'navigate') {
      const rootCached = await caches.match('/');
      if (rootCached) return rootCached;
    }

    return new Response(
      JSON.stringify({ error: 'Sin conexión', offline: true }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * Stale While Revalidate: return cache immediately, update in background.
 * Good for non-critical resources where speed > freshness.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_next/static/') ||
    pathname.match(/\.(js|css|woff2?|png|jpg|jpeg|svg|gif|ico|webp|avif)$/) !== null
  );
}

// ─── Message handler: skip waiting + sync triggers ────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // Trigger immediate cache update from client
  if (event.data && event.data.type === 'SYNC_NOW') {
    console.log('[SW] Manual sync requested');
    // Just log — the actual IndexedDB sync is handled by the client-side OfflineProvider
  }
});

// ─── Push notification handler ────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) {
    console.log('[SW] Push event with no data');
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Sebwen POS', body: event.data.text() };
  }

  const title = data.title || 'Sebwen POS';
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192x192.png',
    badge: data.badge || '/icon-120x120.png',
    image: data.image || undefined,
    vibrate: data.vibrate || [100, 50, 100],
    data: {
      url: data.url || '/',
      type: data.type || 'general',
      ...data.data,
    },
    actions: data.actions || [],
    tag: data.tag || `sebwen-${Date.now()}`,
    requireInteraction: data.requireInteraction || false,
    renotify: data.renotify || true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ─── Notification click handler ───────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  // If an action was clicked, handle it
  if (event.action) {
    console.log('[SW] Notification action clicked:', event.action);
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If there's already a window open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(urlToOpen);
    })
  );
});
