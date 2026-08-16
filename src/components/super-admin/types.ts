// ---- Super Admin Shared Types ----

export interface StoreCount {
  employees: number; products: number; orders: number; customers: number
  categories: number; taxRates: number; roles: number; invoices: number
  quotations: number; expenses: number; services: number; providers: number
}

export interface StoreOwner {
  id: number; cedula: string; fullName: string | null; email: string | null
  phone: string | null; role: string; createdAt: string
}

export interface StoreListItem {
  id: number; name: string; legalName: string | null; nit: string | null
  address: string | null; phone: string | null; currencyCode: string
  countryCode: string | null; createdAt: string; updatedAt: string
  parentStoreId: number | null; parentStore: { name: string } | null
  user: StoreOwner; _count: StoreCount
  /** Lead ID this store was converted from via the CRM legal pipeline, or null if created directly. */
  leadId: number | null
}

export interface PlanData {
  id: number; name: string; description: string | null; price: number
  maxStores: number; maxEmployees: number; maxProducts: number
  features: Record<string, unknown>; sortOrder: number; isActive: boolean
  subscriptionCount: number
}

export interface SubscriptionData {
  id: number; storeId: number; planId: number; status: string
  startDate: string; endDate: string | null; trialEndDate: string | null
  cancelReason: string | null; billingPeriod: string; billingPrice: number
  lastBilledAt: string | null; nextBillingAt: string | null
  plan: { id: number; name: string; price: number; description: string | null; maxEmployees: number; maxProducts: number }
}

export interface DianInfo {
  invoicePrefix: string | null; resolutionNumber: string | null
  resolutionStartDate: string | null; resolutionEndDate: string | null
  resolutionStartNumber: number | null; resolutionEndNumber: number | null
  invoiceTestMode: boolean | null
}

export interface StoreDetail {
  store: StoreListItem & { _count: StoreCount }
  stats: { totalSales: number; totalExpenses: number; ordersByStatus: Record<string, number> }
  employees: Array<{ id: number; position: string | null; isActive: boolean; createdAt: string; user: StoreOwner; role: { id: number; name: string; description: string | null } | null }>
  roles: Array<{ id: number; name: string; description: string | null; permissions: string; isDefault: boolean; isActive: boolean; _count: { employees: number } }>
  taxRates: Array<{ id: number; name: string; code: string; rateType: string; rate: number; applyTo: string; category: string; isActive: boolean; isDefault: boolean; description: string | null }>
  categories: Array<{ id: number; name: string; icon: string | null; _count: { products: number } }>
  products: Array<{ id: number; name: string; salePrice: number; currentStock: number; isActive: boolean; category: { name: string } | null; taxRate: { name: string; rate: number; code: string } | null }>
  customers: Array<{ id: number; name: string; phone: string | null; email: string | null; nit: string | null; totalDebt: number; createdAt: string }>
  orders: Array<{ id: number; orderNumber: string; total: number; status: string; paymentMethod: string; createdAt: string; customer: { name: string } | null; _count: { orderItems: number } }>
  services: Array<{ id: number; name: string; price: number; unit: string; isActive: boolean }>
  providers: Array<{ id: number; name: string; phone: string | null; email: string | null; nit: string | null; isActive: boolean }>
  expenses: Array<{ id: number; category: string; description: string; amount: number; date: string; createdAt: string }>
  subscription: SubscriptionData | null
  inheritedFrom: { id: number; name: string } | null
  dianInfo: DianInfo
  invoiceStats: Array<{ status: string; _count: number }>
}

export interface GracePeriodStore {
  storeId: number; storeName: string; storeNit: string | null
  planName: string; planPrice: number
  graceEndDate: string; daysRemaining: number
  endDate: string; daysSinceExpiry: number
}

export interface MoraStore {
  storeId: number; storeName: string; storeNit: string | null
  planName: string; planPrice: number
  status: string; endDate: string | null
  daysInMora: number; revenueAtRisk: number
  contactName: string | null; contactPhone: string | null; contactEmail: string | null
}

export interface StatsData {
  overview: { totalStores: number; activeStores: number; trialStores: number; pastDueStores: number; expiredStores: number; cancelledStores: number; branches: number }
  subscription: { planBreakdown: Array<{ planId: number; planName: string; price: number; count: number }>; monthlyRevenue: number; annualRevenueEstimate: number; trialCount: number; convertedCount: number; conversionRate: number; pendingReceipts: number }
  mora: { gracePeriodCount: number; moraCount: number; revenueAtRisk: number; gracePeriodStores: GracePeriodStore[]; moraStores: MoraStore[] }
  globalMetrics: { totalOrders: number; totalEmployees: number; totalProducts: number; totalCustomers: number; totalInvoices: number }
  revenue: { totalCollected: number; totalPending: number; monthlyHistory: Array<{ month: string; revenue: number; billing_count: number; pending_amount: number }> }
  monthlyStores: Array<{ month: string; count: number }>
  monthlyOrders: Array<{ month: string; count: number; total_sales: number }>
  monthlyCustomers: Array<{ month: string; count: number }>
  churnByMonth: Array<{ month: string; cancelled: number; reactivated: number; past_due: number }>
  eventTimeline: Array<{ id: number; eventType: string; storeName: string; isBranch: boolean; newValue: string | null; previousValue: string | null; metadata: string; createdAt: string }>
  recentActivity: { newStores: number; newOrders: number; newInvoices: number }
  topStores: Array<{ storeId: number; storeName: string; orderCount: number; totalSales: number }>
}

export interface PaymentReceiptData {
  id: number; storeId: number; subscriptionId: number
  fileName: string; fileSize: number; fileType: string; fileData?: string
  amount: number; reference: string | null; paymentMethod: string; notes: string | null
  status: string; reviewedBy: string | null; reviewNotes: string | null; reviewedAt: string | null
  createdAt: string; updatedAt: string
  store?: { id: number; name: string; nit: string | null; phone: string | null; user: { fullName: string | null; phone: string | null } }
  subscription?: { id: number; status: string; plan: { name: string; price: number }; endDate: string | null }
}

export interface LeadData {
  id: number
  ownerFullName: string
  ownerCedula: string
  ownerEmail: string | null
  ownerPhone: string | null
  storeName: string
  nit: string
  legalName: string
  businessType: string
  storePhone: string | null
  department: string | null
  cityName: string | null
  address: string | null
  hasCamaraComercio: boolean
  registrationNumber: string | null
  rutFilePath: string | null
  rutFileName: string | null
  rutFileSize: number | null
  rutFileType: string | null
  camaraFilePath: string | null
  camaraFileName: string | null
  camaraFileSize: number | null
  camaraFileType: string | null
  status: string
  source: string
  notes: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  convertedStoreId: number | null
  createdAt: string
  updatedAt: string
  // ── Pipeline CRM ──
  stage: string
  assignedToId: number | null
  assignedTo?: { id: number; fullName: string | null } | null
  // ── Datos fiscales ──
  taxRegime: string | null
  fiscalResponsibilities: string | null
  // ── Resolución DIAN (borrador) ──
  resolutionPrefix: string | null
  resolutionNumber: string | null
  resolutionStartDate: string | null
  resolutionEndDate: string | null
  resolutionStartNumber: number | null
  resolutionEndNumber: number | null
  // ── Resumen de expediente legal (solo en el listado, ver /api/super-admin/leads) ──
  docStats?: { uploaded: number; approved: number; total: number }
}

export interface LeadDocumentData {
  id: number
  leadId: number
  documentType: 'RUT' | 'CAMARA_COMERCIO' | 'CEDULA_REPRESENTANTE' | 'RESOLUCION_DIAN'
  filePath: string
  fileName: string
  fileSize: number
  fileType: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  rejectionReason: string | null
  version: number
  uploadedAt: string
  reviewedBy: number | null
  reviewedAt: string | null
  reviewer?: { id: number; fullName: string | null } | null
}

export interface LeadActivityData {
  id: number
  leadId: number
  type: 'NOTE' | 'CALL' | 'TASK' | 'WHATSAPP' | 'EMAIL' | 'STAGE_CHANGE' | 'DOCUMENT_EVENT'
  title: string
  description: string | null
  dueDate: string | null
  completedAt: string | null
  createdById: number | null
  createdAt: string
  createdBy?: { id: number; fullName: string | null } | null
}

export interface LeadContactData {
  id: number
  leadId: number
  fullName: string
  cedula: string | null
  role: 'REPRESENTANTE_LEGAL' | 'CONTADOR' | 'ENCARGADO' | 'OTRO'
  email: string | null
  phone: string | null
  isPrimary: boolean
  createdAt: string
}

export interface LeadsStats {
  new: number
  contacted: number
  approved: number
  rejected: number
  converted: number
  total: number
}
