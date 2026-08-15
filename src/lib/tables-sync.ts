// ---------------------------------------------------------------------------
// VivaPOS — Tables Real-Time Sync Helper (Server-Side)
// ---------------------------------------------------------------------------
// Used by API routes to broadcast events to the tables-sync mini-service.
// The mini-service (port 3005) receives the event and broadcasts it via
// Socket.IO to all connected clients in the store's room.
// ---------------------------------------------------------------------------

const SYNC_SERVICE_URL = process.env.TABLES_SYNC_URL || 'http://localhost:3006'

interface BroadcastPayload {
  storeId: number
  event: string
  data: unknown
}

/**
 * Emit a real-time event to all clients connected to a specific store room.
 * This is fire-and-forget — failures are logged but never block the API response.
 */
export async function emitTablesEvent(payload: BroadcastPayload): Promise<void> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000) // 2s timeout

    await fetch(`${SYNC_SERVICE_URL}/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    clearTimeout(timeout)
  } catch (error) {
    // Fire-and-forget: log but don't throw
    console.warn(`[TablesSync] Failed to emit "${payload.event}":`, 
      error instanceof Error ? error.message : error)
  }
}

// ─── Convenience wrappers ──────────────────────────────────────────────────

export function emitSessionOpened(storeId: number, session: { id: number; barTableId: number }) {
  return emitTablesEvent({
    storeId,
    event: 'session:opened',
    data: { session },
  })
}

export function emitSessionClosed(storeId: number, session: { id: number; barTableId: number }) {
  return emitTablesEvent({
    storeId,
    event: 'session:closed',
    data: { session },
  })
}

export function emitSessionUpdated(storeId: number, session: { id: number; barTableId: number }) {
  return emitTablesEvent({
    storeId,
    event: 'session:updated',
    data: { session },
  })
}

export function emitSessionDeleted(storeId: number, barTableId: number) {
  return emitTablesEvent({
    storeId,
    event: 'session:deleted',
    data: { barTableId },
  })
}

export function emitComandaItemsAdded(storeId: number, sessionId: number, barTableId: number) {
  return emitTablesEvent({
    storeId,
    event: 'comanda:items-added',
    data: { sessionId, barTableId },
  })
}

export function emitComandaItemsUpdated(storeId: number, sessionId: number, barTableId: number, status?: string) {
  return emitTablesEvent({
    storeId,
    event: 'comanda:items-updated',
    data: { sessionId, barTableId, status },
  })
}

export function emitComandaItemsRemoved(storeId: number, sessionId: number, barTableId: number) {
  return emitTablesEvent({
    storeId,
    event: 'comanda:items-removed',
    data: { sessionId, barTableId },
  })
}

export function emitPaymentProcessed(storeId: number, sessionId: number, barTableId: number, orderNumber: string) {
  return emitTablesEvent({
    storeId,
    event: 'payment:processed',
    data: { sessionId, barTableId, orderNumber },
  })
}

export function emitTableUpdated(storeId: number, tableId: number) {
  return emitTablesEvent({
    storeId,
    event: 'table:updated',
    data: { tableId },
  })
}

export function emitTableCreated(storeId: number, tableId: number) {
  return emitTablesEvent({
    storeId,
    event: 'table:created',
    data: { tableId },
  })
}

export function emitTableDeleted(storeId: number) {
  return emitTablesEvent({
    storeId,
    event: 'table:deleted',
    data: {},
  })
}
