import type { Prisma } from '@prisma/client'

// ============================================================
// SEBWEN POS — Idempotencia generalizada (Kleppmann Ch.7)
// ──────────────────────────────────────────────────────────
// `claimExternalEvent` registra la identidad de un evento externo
// (webhook, callback) en ProcessedEvent DENTRO de la transacción
// del caso de uso. Devuelve:
//   • claimed=true  → somos los primeros: procesar efectos secundarios.
//   • claimed=false → ya fue procesado (P2002): skip/replay seguro.
//
// Al estar el insert dentro de la misma tx que los efectos
// secundarios, un crash a mitad deja el claim sin commitear → el
// reintento de Wompi vuelve a entrar (exactamente lo deseado).
// ============================================================

export interface EventClaim {
  claimed: boolean
}

export async function claimExternalEvent(
  tx: Prisma.TransactionClient,
  source: string,
  externalId: string,
  entity?: { type: string; id: number },
): Promise<EventClaim> {
  try {
    await tx.processedEvent.create({
      data: {
        source,
        externalId,
        entityType: entity?.type ?? null,
        entityId: entity?.id ?? null,
      },
    })
    return { claimed: true }
  } catch (error) {
    // Chequeo estructural (no instanceof) para tolerar distintas instancias
    // del Prisma Client y mocks en tests.
    const isP2002 =
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === 'P2002'
    if (isP2002) {
      return { claimed: false } // duplicado — ya procesado por otro request concurrente
    }
    throw error
  }
}
