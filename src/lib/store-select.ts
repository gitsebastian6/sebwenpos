import type { Prisma } from '@prisma/client'

// ---------------------------------------------------------------------------
// Sebwen POS — Select "de sesión" de la tienda
// ---------------------------------------------------------------------------
// Forma canónica del objeto `store` que viaja al cliente en el login y se
// guarda en el auth-store (Zustand + localStorage). El front lee muchas de
// estas columnas (Ajustes, Tienda Virtual, domicilio, resolución DIAN, etc.),
// así que TODAS deben venir en el login — si el login devuelve un subconjunto,
// el siguiente inicio de sesión pisa el `store` completo con uno parcial y la
// UI "pierde" esa configuración.
//
// ⚠️ Al agregar una columna a `model Store` que el front necesite leer,
//    AGRÉGALA aquí.
//
// Se excluyen a propósito los secretos: `certificatePassword`, `softwarePin`,
// `pteApiKey`, `providerConfig` — nunca deben llegar al navegador.
// ---------------------------------------------------------------------------

export const STORE_SESSION_SELECT = {
  id: true,
  userId: true,
  name: true,
  legalName: true,
  nit: true,
  address: true,
  phone: true,
  currencyCode: true,
  countryCode: true,
  debtOverdueDays: true,
  // DIAN Resolution
  invoicePrefix: true,
  resolutionNumber: true,
  resolutionStartDate: true,
  resolutionEndDate: true,
  resolutionStartNumber: true,
  resolutionEndNumber: true,
  invoiceTestMode: true,
  // Facturación electrónica híbrida
  invoiceProvider: true,
  invoiceEnabled: true,
  certificateUploaded: true,
  softwareId: true,
  // DIVIPOLA
  divipolaCode: true,
  cityName: true,
  // Datos fiscales
  taxRegime: true,
  fiscalResponsibilities: true,
  // Certificado
  certUploadedAt: true,
  certExpiresAt: true,
  certSubject: true,
  // PTE
  connectionMode: true,
  pteNit: true,
  pteApiUrl: true,
  electronicInvoicingEnabled: true,
  // Sucursales
  parentStoreId: true,
  // Tienda Virtual (public storefront)
  storeSlug: true,
  storeDescription: true,
  storeWhatsapp: true,
  storeActive: true,
  // Domicilio / Delivery
  deliveryEnabled: true,
  deliveryFee: true,
  deliveryFreeAbove: true,
  deliveryMinOrder: true,
  acceptingOrders: true,
  // Tirilla / recibo térmico (Configuración → Tirilla)
  receiptPaperWidth: true,
  receiptDocDenomination: true,
  receiptFooterText: true,
  receiptExtraLegend: true,
  isIvaWithholdingAgent: true,
  isSelfWithholdingAgent: true,
  isIncResponsible: true,
  // Resolución DIAN del documento equivalente POS
  posResolutionNumber: true,
  posResolutionPrefix: true,
  posResolutionFrom: true,
  posResolutionTo: true,
  posResolutionDate: true,
  posResolutionEndDate: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.StoreSelect
