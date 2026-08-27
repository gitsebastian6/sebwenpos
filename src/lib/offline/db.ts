import Dexie, { type EntityTable } from 'dexie';

// ─── Type Definitions ─────────────────────────────────────────────────

export interface OfflineProduct {
  id: number;
  storeId: number;
  categoryId: number | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  imgUrl: string | null;
  salePrice: number;
  costPrice: number;
  currentStock: number;
  isActive: boolean;
  taxRateId: number | null;
  taxRate: { id: number; name: string; code: string; rate: number; rateType: string } | null;
  category: { id: number; name: string } | null;
  updatedAt: number; // timestamp of last sync
}

export interface OfflineService {
  id: number;
  storeId: number;
  name: string;
  price: number;
  taxRateId: number | null;
  taxRate: { id: number; name: string; code: string; rate: number; rateType: string } | null;
  updatedAt: number;
}

export interface OfflineCategory {
  id: number;
  storeId: number;
  name: string;
  icon: string | null;
  updatedAt: number;
}

export interface OfflineCustomer {
  id: number;
  storeId: number;
  name: string;
  phone: string | null;
  email: string | null;
  nit: string | null;
  documentType: string | null;
  totalDebt: number;
  updatedAt: number;
}

export interface OfflineCashRegister {
  id: number;
  storeId: number;
  openedAt: string;
  openedBy: string;
  initialAmount: number;
  updatedAt: number;
}

export interface PendingOrder {
  id?: number; // auto-increment
  tempOrderNumber: string;
  storeId: number;
  payload: {
    storeId: number;
    customerId: number | null;
    cashRegisterId: number | undefined;
    paymentMethod: string;
    tipAmount: number;
    discountType: string;
    discountAmount: number;
    discountReason?: string;
    notes?: string;
        paymentSplits?: Array<{ method: string; amount: number; reference?: string }>;
    items: Array<{
      productId?: number;
      serviceId?: number;
      presentationId?: number;
      quantity: number;
      notes?: string;
    }>;
  };
  createdAt: number;
  retryCount: number;
  status: 'pending' | 'syncing' | 'failed';
  error?: string;
  // Timestamp (ms) antes del cual NO se debe reintentar — usado por el backoff
  // exponencial con jitter en processPendingOrders. null/undefined = reintentar ya.
  nextRetryAt?: number | null;
}

export interface SyncMeta {
  key: string;
  storeId: number;
  value: string; // ISO timestamp or JSON
}

// ─── Database ──────────────────────────────────────────────────────────

class SebwenDB extends Dexie {
  products!: EntityTable<OfflineProduct, 'id'>;
  services!: EntityTable<OfflineService, 'id'>;
  categories!: EntityTable<OfflineCategory, 'id'>;
  customers!: EntityTable<OfflineCustomer, 'id'>;
  cashRegisters!: EntityTable<OfflineCashRegister, 'id'>;
  pendingOrders!: EntityTable<PendingOrder, 'id'>;
  syncMeta!: EntityTable<SyncMeta, 'key'>;

  constructor() {
    super('sebwenpos');

    this.version(1).stores({
      products: 'id, storeId, categoryId, barcode, name, updatedAt',
      services: 'id, storeId, name, updatedAt',
      categories: 'id, storeId, name, updatedAt',
      customers: 'id, storeId, name, phone, nit, updatedAt',
      cashRegisters: 'id, storeId, updatedAt',
      pendingOrders: '++id, storeId, status, createdAt',
      syncMeta: '[key+storeId], storeId',
    });
  }
}

export const db = new SebwenDB();

// ─── Sync Helpers ──────────────────────────────────────────────────────

export async function getLastSync(key: string, storeId: number): Promise<string | null> {
  const meta = await db.syncMeta.get([key, storeId]);
  return meta?.value ?? null;
}

export async function setLastSync(key: string, storeId: number, timestamp: string): Promise<void> {
  await db.syncMeta.put({ key, storeId, value: timestamp });
}

export async function clearOfflineData(storeId: number): Promise<void> {
  await Promise.all([
    db.products.where('storeId').equals(storeId).delete(),
    db.services.where('storeId').equals(storeId).delete(),
    db.categories.where('storeId').equals(storeId).delete(),
    db.customers.where('storeId').equals(storeId).delete(),
    db.cashRegisters.where('storeId').equals(storeId).delete(),
    db.syncMeta.where('storeId').equals(storeId).delete(),
  ]);
}
