import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'

// ---------------------------------------------------------------------------
// TIPOS EXPORTADOS
// ---------------------------------------------------------------------------

/** Resultado de getNextCreditNoteConsecutive */
export interface CreditNoteConsecutiveResult {
  consecutive: number
  prefix: string
  /** 'NC' para notas crédito, 'ND' para notas débito */
  noteType: string
}

// ---------------------------------------------------------------------------
// FUNCIONES EXPORTADAS
// ---------------------------------------------------------------------------

/**
 * Obtiene el siguiente consecutivo para notas crédito/débito de una tienda.
 *
 * Las NC/ND usan su propio rango de consecutivos separado de las facturas.
 * Prefijo: "NC" para notas crédito, "ND" para notas débito.
 *
 * Para generar el consecutivo:
 * 1. Busca la última NC/ND del mismo tipo para la tienda
 * 2. Retorna consecutive + 1
 *
 * NOTA: En producción con resolución DIAN separada para NC/ND, este método
 * debería validar contra los rangos autorizados de la resolución NC/ND.
 * Por ahora genera consecutivos auto-incrementales por tienda y tipo.
 *
 * @param storeId  - ID de la tienda
 * @param noteType - "CREDIT" o "DEBIT"
 * @param tx       - (Optional) Prisma transaction client for atomic operations
 * @returns Objeto con consecutive, prefix y noteType
 */
export async function getNextCreditNoteConsecutive(
  storeId: number,
  noteType: string,
  tx?: Prisma.TransactionClient,
): Promise<CreditNoteConsecutiveResult> {
  const prefix = noteType === 'DEBIT' ? 'ND' : 'NC'
  const client = tx || db

  const lastNote = await client.creditNote.findFirst({
    where: { storeId, noteType },
    orderBy: { consecutive: 'desc' },
    select: { consecutive: true },
  })

  const nextConsecutive = (lastNote?.consecutive ?? 0) + 1

  return {
    consecutive: nextConsecutive,
    prefix,
    noteType,
  }
}
