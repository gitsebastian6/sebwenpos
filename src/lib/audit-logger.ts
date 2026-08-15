import { db } from '@/lib/db'
import { logger } from '@/lib/logger'

// ---------------------------------------------------------------------------
// Viva POS — Audit Logger
// ---------------------------------------------------------------------------
// Centralized audit trail for all business-critical operations.
// Every write to Orders, Invoices, Products, Inventory, etc. should be logged.
// Fire-and-forget — errors are logged but NEVER thrown to the caller.
// This ensures business operations never fail due to audit logging issues.
// ---------------------------------------------------------------------------

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'CANCEL'
  | 'ADJUST'
  | 'RETURN'
  | 'LOSS'
  | 'DISCOUNT'
  | 'VOID'
  | 'SEND'
  | 'VALIDATE'
  | 'REJECT'
  | 'EXPORT'
  | 'IMPORT'
  | 'SEED'
  | 'RESET'
  | 'SWITCH_STORE'
  | 'UPLOAD'
  | 'PAY'
  | 'REFUND'

export type AuditEntity =
  | 'Order'
  | 'OrderItem'
  | 'Invoice'
  | 'CreditNote'
  | 'DebitNote'
  | 'ContingencyInvoice'
  | 'Product'
  | 'Category'
  | 'Customer'
  | 'Provider'
  | 'Purchase'
  | 'PurchasePayment'
  | 'InventoryMovement'
  | 'CashRegister'
  | 'Expense'
  | 'LedgerAccount'
  | 'JournalEntry'
  | 'Service'
  | 'ServiceTransaction'
  | 'BarTable'
  | 'TableSession'
  | 'ComandaItem'
  | 'Quotation'
  | 'QuotationItem'
  | 'Employee'
  | 'Role'
  | 'Store'
  | 'User'
  | 'Subscription'
  | 'TaxRate'
  | 'PaymentReceipt'
  | 'CostHistory'
  | 'SystemSetting'

export interface AuditLogInput {
  storeId?: number | null
  userId?: number | null
  action: AuditAction | string
  entity: AuditEntity | string
  entityId?: number | null
  oldValue?: Record<string, unknown> | null
  newValue?: Record<string, unknown> | null
  ipAddress?: string | null
  userAgent?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Log an audit event. Fire-and-forget — never throws.
 * Returns the created AuditLog ID on success, or -1 on failure.
 */
export async function auditLog(input: AuditLogInput): Promise<number> {
  try {
    const entry = await db.auditLog.create({
      data: {
        storeId: input.storeId ?? null,
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        oldValue: input.oldValue ? JSON.stringify(input.oldValue) : null,
        newValue: input.newValue ? JSON.stringify(input.newValue) : null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: JSON.stringify(input.metadata ?? {}),
      },
    })
    return entry.id
  } catch (error) {
    // NEVER throw — audit logging must not break business operations
    logger.error(
      `[AuditLog] Failed to log ${input.action} ${input.entity}${input.entityId ? `#${input.entityId}` : ''}:`,
      error
    )
    return -1
  }
}

/**
 * Convenience: extract user context from request headers (set by middleware).
 * Returns { userId, storeId } from x-auth-* headers.
 */
export function getUserContext(headers: Headers): {
  userId: number | null
  storeId: number | null
} {
  const userId = headers.get('x-auth-user-id')
  const storeId = headers.get('x-auth-store-id')
  return {
    userId: userId ? parseInt(userId, 10) || null : null,
    storeId: storeId ? parseInt(storeId, 10) || null : null,
  }
}

/**
 * Convenience: extract client info from request.
 * Returns { ipAddress, userAgent }.
 */
export function getClientContext(request: { headers: Headers }): {
  ipAddress: string | null
  userAgent: string | null
} {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const ipAddress = forwarded?.split(',')[0]?.trim() ?? realIp ?? null
  const userAgent = request.headers.get('user-agent') ?? null
  return { ipAddress, userAgent }
}

/**
 * Convenience: full audit log with request context.
 * Combines getUserContext + getClientContext + auditLog in one call.
 * storeId and userId are auto-extracted from request headers but can be overridden.
 */
export async function auditLogFromRequest(
  request: { headers: Headers },
  input: Omit<AuditLogInput, 'ipAddress' | 'userAgent'> & {
    storeId?: number | null
    userId?: number | null
  }
): Promise<number> {
  const userCtx = getUserContext(request.headers)
  const clientCtx = getClientContext(request)
  return auditLog({
    ...input,
    userId: input.userId ?? userCtx.userId,
    storeId: input.storeId ?? userCtx.storeId,
    ipAddress: clientCtx.ipAddress,
    userAgent: clientCtx.userAgent,
  })
}
