// Campos de lote compartidos por las rutas de ajuste / pérdida / devolución.
// Solo tienen efecto para productos con trackExpiration; el lote es best-effort
// (no se bloquea si falta — misma filosofía que Compras).

import { z } from 'zod'

export const lotInputFields = {
  /** Lote existente al que dirigir la entrada/salida. */
  batchId: z.number().int().positive().optional(),
  /** Lote nuevo (entrada). Se ignora si viene batchId. */
  lotNumber: z.string().max(50).optional(),
  /** ISO yyyy-mm-dd. */
  expiryDate: z.string().optional(),
  manufacturingDate: z.string().optional(),
} as const

export interface ResolvedLotInput {
  batchId: number | null
  lotNumber: string | null
  expiryDate: Date | null
  manufacturingDate: Date | null
}

export function resolveLotInput(d: {
  batchId?: number
  lotNumber?: string
  expiryDate?: string
  manufacturingDate?: string
}): ResolvedLotInput {
  const toDate = (s?: string) => {
    if (!s) return null
    const dt = new Date(s)
    return isNaN(dt.getTime()) ? null : dt
  }
  return {
    batchId: d.batchId ?? null,
    lotNumber: d.lotNumber?.trim() || null,
    expiryDate: toDate(d.expiryDate),
    manufacturingDate: toDate(d.manufacturingDate),
  }
}
