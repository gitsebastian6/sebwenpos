// ─── Receipt store config → TicketData ────────────────────────────────────────
// Un solo lugar que traduce la configuración tributaria / de tirilla de la tienda
// a los campos que consumen `printTicket` y los documentos térmicos secundarios.
// Evita repetir (y desincronizar) el mapeo en los ~10 call sites de impresión.

import type { TicketData } from './print-ticket-types'
import { normalizePaperWidth, type PaperWidth } from './print-ticket-helpers'

export interface ReceiptStoreConfig {
  taxRegime?: string | null
  receiptPaperWidth?: string | null
  receiptDocDenomination?: string | null
  receiptFooterText?: string | null
  receiptExtraLegend?: string | null
  isIvaWithholdingAgent?: boolean | null
  isSelfWithholdingAgent?: boolean | null
  isIncResponsible?: boolean | null
  posResolutionNumber?: string | null
  posResolutionPrefix?: string | null
  posResolutionFrom?: number | null
  posResolutionTo?: number | null
}

/** Ancho del rollo configurado para la tienda (default 80 mm). */
export function receiptPaperWidthOf(store: ReceiptStoreConfig | null | undefined): PaperWidth {
  return normalizePaperWidth(store?.receiptPaperWidth)
}

/**
 * Subconjunto de `TicketData` común a todas las impresiones de venta.
 * Se expande con spread en cada `printTicket({ ...receiptStoreFields(store), ... })`.
 */
export function receiptStoreFields(store: ReceiptStoreConfig | null | undefined): Partial<TicketData> {
  return {
    paperWidth: normalizePaperWidth(store?.receiptPaperWidth),
    // Se mantiene el default histórico 'RESPONSABLE' para tiendas que aún no han
    // configurado el régimen; la UI de Configuración → Tirilla insiste en fijarlo.
    storeRegime: store?.taxRegime || 'RESPONSABLE',
    docDenomination: store?.receiptDocDenomination || undefined,
    footerText: store?.receiptFooterText || undefined,
    extraLegend: store?.receiptExtraLegend || undefined,
    isIvaWithholdingAgent: store?.isIvaWithholdingAgent ?? undefined,
    isSelfWithholdingAgent: store?.isSelfWithholdingAgent ?? undefined,
    isIncResponsible: store?.isIncResponsible ?? undefined,
    posResolutionNumber: store?.posResolutionNumber || undefined,
    posResolutionPrefix: store?.posResolutionPrefix || undefined,
    posResolutionFrom: store?.posResolutionFrom ?? undefined,
    posResolutionTo: store?.posResolutionTo ?? undefined,
  }
}
