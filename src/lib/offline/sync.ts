'use client';

import { db, setLastSync, type OfflineProduct, type OfflineCategory, type OfflineCustomer, type OfflineService, type OfflineCashRegister, type PendingOrder } from './db';

// ─── Sync Functions ────────────────────────────────────────────────────
// These pull fresh data from the server API and upsert into IndexedDB.
// Called on: initial load, online event, and periodic sync.

const SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes
let syncTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Sync all POS data for a given store into IndexedDB.
 * Returns true if all syncs succeeded, false if any failed.
 */
export async function syncStoreData(storeId: number): Promise<boolean> {
  if (!storeId || typeof window === 'undefined') return false;

  const now = Date.now();
  const results = await Promise.allSettled([
    syncProducts(storeId),
    syncCategories(storeId),
    syncCustomers(storeId),
    syncServices(storeId),
    syncCashRegisters(storeId),
  ]);

  const allOk = results.every((r) => r.status === 'fulfilled');

  if (allOk) {
    await setLastSync('fullSync', storeId, new Date(now).toISOString());
    console.log('[Offline] Full sync completed for store', storeId);
  } else {
    console.warn('[Offline] Partial sync failure for store', storeId, results);
  }

  return allOk;
}

async function syncProducts(storeId: number): Promise<void> {
  const res = await fetch(`/api/products?storeId=${storeId}&active=true&limit=500`);
  if (!res.ok) throw new Error(`Products sync failed: ${res.status}`);

  const data = await res.json();
  const items: OfflineProduct[] = (data.products ?? data ?? []).map((p: any) => ({
    id: p.id,
    storeId: p.storeId ?? storeId,
    categoryId: p.categoryId ?? p.category?.id ?? null,
    name: p.name,
    sku: p.sku ?? null,
    barcode: p.barcode ?? null,
    imgUrl: p.imgUrl ?? null,
    salePrice: p.salePrice,
    costPrice: p.costPrice ?? 0,
    currentStock: p.currentStock ?? 0,
    isActive: p.isActive ?? true,
    taxRateId: p.taxRateId ?? p.taxRate?.id ?? null,
    taxRate: p.taxRate ?? null,
    category: p.category ?? null,
    updatedAt: Date.now(),
  }));

  // Bulk put (upsert)
  await db.products.bulkPut(items);
  // Remove products that no longer exist in the server response
  const serverIds = new Set(items.map((p) => p.id));
  const staleProducts = await db.products
    .where('storeId')
    .equals(storeId)
    .filter((p) => !serverIds.has(p.id))
    .keys();
  if (staleProducts.length > 0) {
    await db.products.bulkDelete(staleProducts as number[]);
  }

  await setLastSync('products', storeId, new Date().toISOString());
}

async function syncCategories(storeId: number): Promise<void> {
  const res = await fetch(`/api/categories?storeId=${storeId}`);
  if (!res.ok) throw new Error(`Categories sync failed: ${res.status}`);

  const data = await res.json();
  const items: OfflineCategory[] = (data.categories ?? data ?? []).map((c: any) => ({
    id: c.id,
    storeId: c.storeId ?? storeId,
    name: c.name,
    icon: c.icon ?? null,
    updatedAt: Date.now(),
  }));

  await db.categories.bulkPut(items);
  const serverIds = new Set(items.map((c) => c.id));
  const stale = await db.categories
    .where('storeId')
    .equals(storeId)
    .filter((c) => !serverIds.has(c.id))
    .keys();
  if (stale.length > 0) await db.categories.bulkDelete(stale as number[]);

  await setLastSync('categories', storeId, new Date().toISOString());
}

async function syncCustomers(storeId: number): Promise<void> {
  const res = await fetch(`/api/customers?storeId=${storeId}&limit=200`);
  if (!res.ok) throw new Error(`Customers sync failed: ${res.status}`);

  const data = await res.json();
  const items: OfflineCustomer[] = (data.customers ?? data ?? []).map((c: any) => ({
    id: c.id,
    storeId: c.storeId ?? storeId,
    name: c.name,
    phone: c.phone ?? null,
    email: c.email ?? null,
    nit: c.nit ?? null,
    documentType: c.documentType ?? null,
    totalDebt: c.totalDebt ?? 0,
    updatedAt: Date.now(),
  }));

  await db.customers.bulkPut(items);

  await setLastSync('customers', storeId, new Date().toISOString());
}

async function syncServices(storeId: number): Promise<void> {
  const res = await fetch(`/api/services?storeId=${storeId}`);
  if (!res.ok) throw new Error(`Services sync failed: ${res.status}`);

  const data = await res.json();
  const items: OfflineService[] = (data.services ?? data ?? []).map((s: any) => ({
    id: s.id,
    storeId: s.storeId ?? storeId,
    name: s.name,
    price: s.price ?? s.salePrice ?? 0,
    taxRateId: s.taxRateId ?? s.taxRate?.id ?? null,
    taxRate: s.taxRate ?? null,
    updatedAt: Date.now(),
  }));

  await db.services.bulkPut(items);

  await setLastSync('services', storeId, new Date().toISOString());
}

async function syncCashRegisters(storeId: number): Promise<void> {
  const res = await fetch(`/api/cash-register/current?storeId=${storeId}`);
  if (!res.ok) throw new Error(`Cash registers sync failed: ${res.status}`);

  const data = await res.json();
  const items: OfflineCashRegister[] = (Array.isArray(data) ? data : [data].filter(Boolean)).map(
    (cr: any) => ({
      id: cr.id,
      storeId: cr.storeId ?? storeId,
      openedAt: cr.openedAt ?? cr.createdAt ?? new Date().toISOString(),
      openedBy: cr.openedBy ?? cr.userName ?? '',
      initialAmount: cr.initialAmount ?? 0,
      updatedAt: Date.now(),
    })
  );

  if (items.length > 0) {
    await db.cashRegisters.bulkPut(items);
  }

  await setLastSync('cashRegisters', storeId, new Date().toISOString());
}

// ─── Pending Orders Queue ──────────────────────────────────────────────

/**
 * Enqueue an order for later submission when offline.
 * Returns a temporary order number for UI feedback.
 */
export async function enqueuePendingOrder(
  storeId: number,
  payload: PendingOrder['payload']
): Promise<string> {
  const tempNumber = `OFFLINE-${Date.now().toString(36).toUpperCase()}`;

  await db.pendingOrders.add({
    tempOrderNumber: tempNumber,
    storeId,
    payload,
    createdAt: Date.now(),
    retryCount: 0,
    status: 'pending',
  });

  console.log('[Offline] Order queued:', tempNumber);
  return tempNumber;
}

/**
 * Process all pending orders — called when coming back online.
 * Returns count of successfully synced orders.
 */
export async function processPendingOrders(storeId: number): Promise<number> {
  const pending = await db.pendingOrders
    .where('storeId')
    .equals(storeId)
    .filter((o) => o.status === 'pending' || o.status === 'failed')
    .toArray();

  let synced = 0;

  for (const order of pending) {
    try {
      // Mark as syncing
      await db.pendingOrders.update(order.id!, { status: 'syncing' });

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order.payload),
      });

      if (res.ok) {
        // Success — remove from queue
        await db.pendingOrders.delete(order.id!);
        synced++;
        console.log('[Offline] Order synced:', order.tempOrderNumber);
      } else {
        const errorData = await res.json().catch(() => ({}));
        const retryCount = (order.retryCount ?? 0) + 1;

        if (retryCount >= 5) {
          // Max retries — mark as permanently failed
          await db.pendingOrders.update(order.id!, {
            status: 'failed',
            retryCount,
            error: errorData.error || `HTTP ${res.status}`,
          });
          console.error('[Offline] Order permanently failed:', order.tempOrderNumber);
        } else {
          // Retry later
          await db.pendingOrders.update(order.id!, {
            status: 'failed',
            retryCount,
            error: errorData.error || `HTTP ${res.status}`,
          });
        }
      }
    } catch (err) {
      // Network error — mark for retry
      await db.pendingOrders.update(order.id!, {
        status: 'failed',
        retryCount: (order.retryCount ?? 0) + 1,
        error: err instanceof Error ? err.message : 'Network error',
      });
    }
  }

  return synced;
}

/**
 * Get count of pending orders for a store.
 */
export async function getPendingOrderCount(storeId: number): Promise<number> {
  return db.pendingOrders
    .where('storeId')
    .equals(storeId)
    .filter((o) => o.status === 'pending' || o.status === 'failed')
    .count();
}

// ─── Periodic Sync ─────────────────────────────────────────────────────

export function startPeriodicSync(storeId: number): () => void {
  stopPeriodicSync();

  // Initial sync
  syncStoreData(storeId);

  syncTimer = setInterval(() => {
    if (navigator.onLine) {
      syncStoreData(storeId);
      processPendingOrders(storeId);
    }
  }, SYNC_INTERVAL);

  return stopPeriodicSync;
}

function stopPeriodicSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
