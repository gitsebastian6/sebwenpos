// ============================================================
// SEBWEN POS — Domain Events (bus in-process, Evans "Domain Events")
// CONTEXT_MAP §4: OrderCompleted → Invoicing/Accounting.
// ──────────────────────────────────────────────────────────
// Diseño deliberadamente mínimo:
//   • In-process y SINCRONO dentro de la misma transacción Prisma:
//     si el handler falla, la venta completa hace rollback (consistencia
//     fuerte — el plan explícitamente descarta outbox/MQ por ahora).
//   • Handlers registrados una vez al importar este módulo; la ruta solo
//     publica `OrderCompleted` y no conoce a los subscriptores.
//   • Tipado débil-controlado con genérico simple: un evento = payload.
// ============================================================

import { Prisma } from '@prisma/client'

export interface OrderCompletedPayload {
  storeId: number
  orderId: number
  orderNumber: string
  paymentMethod: string
  /** Pagos mixtos: [{ method, amount, reference? }] */
  paymentSplits?: { method: string; amount: number; reference?: string }[]
  subtotal: number
  discountAmount: number
  tipAmount: number
  total: number
  customerId?: number | null
}

type EventHandler<P> = (tx: Prisma.TransactionClient, payload: P) => Promise<void>

const handlers: Record<string, EventHandler<never>[]> = {}

/** Registra un handler para un tipo de evento. Idempotente por nombre. */
export function onDomainEvent<P>(eventType: string, handler: EventHandler<P>): void {
  if (!handlers[eventType]) handlers[eventType] = []
  handlers[eventType].push(handler as unknown as EventHandler<never>)
}

/**
 * Publica un evento: ejecuta todos los handlers registrados, en orden de
 * registro, DENTRO de la transacción dada. Un error en un handler aborta
 * la publicación (y, al estar en la tx del caso de uso, toda la operación).
 */
export async function publishDomainEvent<P>(
  eventType: string,
  tx: Prisma.TransactionClient,
  payload: P,
): Promise<void> {
  for (const handler of handlers[eventType] ?? []) {
    await (handler as unknown as EventHandler<P>)(tx, payload)
  }
}
