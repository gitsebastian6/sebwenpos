// ---------------------------------------------------------------------------
// Sebwen POS — Subscription Constants
// ---------------------------------------------------------------------------
// All subscription-related constants: plan features, statuses, history events,
// labels (Spanish), billing periods, and grace period configuration.
// ---------------------------------------------------------------------------

// ── Plan Feature Keys ──
export const PLAN_FEATURES = {
  electronicInvoicing: 'Facturación Electrónica',
  multiStore: 'Multi-Tienda',
  reports: 'Reportes Avanzados',
  advancedInventory: 'Inventario Avanzado',
  api: 'Acceso API',
  customBranding: 'Branding Personalizado',
  multiCurrency: 'Multi-Moneda',
  support: 'Soporte',
  priority: 'Soporte Prioritario',
} as const

export type PlanFeatureKey = keyof typeof PLAN_FEATURES

// ── Subscription Status ──
export const SUB_STATUS = {
  TRIAL: 'TRIAL',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const

export type SubscriptionStatus = (typeof SUB_STATUS)[keyof typeof SUB_STATUS]

// ── History Event Types ──
export const HISTORY_EVENTS = {
  CREATED: 'CREATED',
  TRIAL_STARTED: 'TRIAL_STARTED',
  RENEWED: 'RENEWED',
  PLAN_CHANGED: 'PLAN_CHANGED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  REACTIVATED: 'REACTIVATED',
  GRACE_STARTED: 'GRACE_STARTED',
  PAST_DUE: 'PAST_DUE',
  BILLING_PERIOD_CHANGED: 'BILLING_PERIOD_CHANGED',
} as const

export type HistoryEventType = (typeof HISTORY_EVENTS)[keyof typeof HISTORY_EVENTS]

// ── Status Labels (Spanish) ──
export const STATUS_LABELS: Record<string, string> = {
  TRIAL: 'Prueba',
  ACTIVE: 'Activa',
  PAST_DUE: 'Vencida',
  EXPIRED: 'Expirada',
  CANCELLED: 'Cancelada',
}

// ── Event Type Labels (Spanish) ──
export const EVENT_LABELS: Record<string, string> = {
  CREATED: 'Suscripción Creada',
  TRIAL_STARTED: 'Prueba Iniciada',
  RENEWED: 'Suscripción Renovada',
  PLAN_CHANGED: 'Plan Cambiado',
  CANCELLED: 'Suscripción Cancelada',
  EXPIRED: 'Suscripción Expirada',
  REACTIVATED: 'Suscripción Reactivada',
  GRACE_STARTED: 'Período de Gracia',
  PAST_DUE: 'Suscripción Vencida',
  BILLING_PERIOD_CHANGED: 'Período de Facturación Cambiado',
}

// ── Billing Period Info ──
export const BILLING_PERIODS: Record<string, { label: string; days: number; months: number; discount: number }> = {
  TRIAL: { label: 'Prueba', days: 7, months: 0, discount: 0 },
  MONTHLY: { label: 'Mensual', days: 30, months: 1, discount: 0 },
  QUARTERLY: { label: 'Trimestral', days: 90, months: 3, discount: 5 },
  SEMI_ANNUAL: { label: 'Semestral', days: 180, months: 6, discount: 10 },
  ANNUAL: { label: 'Anual', days: 365, months: 12, discount: 15 },
}

// ── Trial Period (canonical — always 7 days, never override) ──
export const TRIAL_PERIOD_DAYS = 7

// ── Grace Period ──
/** Grace period: 3 calendar days after endDate before fully expiring. */
export const GRACE_PERIOD_DAYS = 3
