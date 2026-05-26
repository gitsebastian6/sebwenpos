// Database
export { db, clearOfflineData, getLastSync, setLastSync } from './db';
export type {
  OfflineProduct,
  OfflineService,
  OfflineCategory,
  OfflineCustomer,
  OfflineCashRegister,
  PendingOrder,
  SyncMeta,
} from './db';

// Sync engine
export {
  syncStoreData,
  enqueuePendingOrder,
  processPendingOrders,
  getPendingOrderCount,
  startPeriodicSync,
} from './sync';

// Provider
export { OfflineProvider, useOffline } from './offline-provider';

// Data hooks
export {
  useOfflineProducts,
  useOfflineCategories,
  useOfflineCustomers,
  useOfflineServices,
  useOfflineCashRegisters,
  searchOfflineProducts,
  getProductByBarcode,
  searchOfflineCustomers,
} from './use-offline-data';

// Order hook
export { useOfflineOrder } from './use-offline-order';
