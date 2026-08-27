'use client';

import { useQuery } from '@tanstack/react-query';
import { db, type OfflineProduct, type OfflineCategory, type OfflineCustomer, type OfflineService, type OfflineCashRegister } from '@/lib/offline/db';
import { useOffline } from '@/lib/offline/offline-provider';

// ─── Products ──────────────────────────────────────────────────────────

export function useOfflineProducts(storeId: number | null) {
  const { isOnline } = useOffline();

  return useQuery({
    queryKey: ['offline-products', storeId],
    queryFn: async (): Promise<OfflineProduct[]> => {
      if (!storeId) return [];
      // Always try IndexedDB first — it's populated by the sync engine
      const products = await db.products
        .where('storeId')
        .equals(storeId)
        .filter((p) => p.isActive)
        .toArray();
      return products;
    },
    enabled: !!storeId,
    staleTime: 30_000,
    // When offline, keep serving cached data indefinitely
    gcTime: isOnline ? 5 * 60_000 : Infinity,
  });
}

// ─── Categories ────────────────────────────────────────────────────────

export function useOfflineCategories(storeId: number | null) {
  return useQuery({
    queryKey: ['offline-categories', storeId],
    queryFn: async (): Promise<OfflineCategory[]> => {
      if (!storeId) return [];
      return db.categories.where('storeId').equals(storeId).toArray();
    },
    enabled: !!storeId,
    staleTime: 60_000,
  });
}

// ─── Customers ─────────────────────────────────────────────────────────

export function useOfflineCustomers(storeId: number | null) {
  return useQuery({
    queryKey: ['offline-customers', storeId],
    queryFn: async (): Promise<OfflineCustomer[]> => {
      if (!storeId) return [];
      return db.customers.where('storeId').equals(storeId).toArray();
    },
    enabled: !!storeId,
    staleTime: 30_000,
  });
}

// ─── Services ──────────────────────────────────────────────────────────

export function useOfflineServices(storeId: number | null) {
  return useQuery({
    queryKey: ['offline-services', storeId],
    queryFn: async (): Promise<OfflineService[]> => {
      if (!storeId) return [];
      return db.services.where('storeId').equals(storeId).toArray();
    },
    enabled: !!storeId,
    staleTime: 30_000,
  });
}

// ─── Cash Registers ────────────────────────────────────────────────────

export function useOfflineCashRegisters(storeId: number | null) {
  return useQuery({
    queryKey: ['offline-cash-registers', storeId],
    queryFn: async (): Promise<OfflineCashRegister[]> => {
      if (!storeId) return [];
      return db.cashRegisters.where('storeId').equals(storeId).toArray();
    },
    enabled: !!storeId,
    staleTime: 30_000,
  });
}

// ─── Search helpers ────────────────────────────────────────────────────

export async function searchOfflineProducts(
  storeId: number,
  query: string
): Promise<OfflineProduct[]> {
  const q = query.toLowerCase();
  return db.products
    .where('storeId')
    .equals(storeId)
    .filter((p) => p.isActive && (p.name.toLowerCase().includes(q) || (p.barcode?.toLowerCase().includes(q) ?? false)))
    .toArray();
}

export async function getProductByBarcode(
  storeId: number,
  barcode: string
): Promise<OfflineProduct | undefined> {
  return db.products
    .where('storeId')
    .equals(storeId)
    .filter((p) => p.barcode === barcode && p.isActive)
    .first();
}

export async function searchOfflineCustomers(
  storeId: number,
  query: string
): Promise<OfflineCustomer[]> {
  const q = query.toLowerCase();
  return db.customers
    .where('storeId')
    .equals(storeId)
    .filter((c) => c.name.toLowerCase().includes(q) || (c.phone?.includes(q) ?? false) || (c.nit?.includes(q) ?? false))
    .toArray();
}
