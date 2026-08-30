// ─── Borrador de venta en curso (POS) ────────────────────────────────────────
// El carrito del POS es estado local del hook; sin esto, una recarga (o el
// arranque en frío de la PWA tras una evicción del SO) perdía la venta a medio
// hacer. Guardamos un borrador por tienda en localStorage y lo restauramos al
// montar. Se descarta al cobrar, al vaciar el carrito, o si supera 24 h.

import type { CartItem, InvoiceMode, PaymentMethod, PaymentSplit } from '@/types'

// Duplicado local para no crear un ciclo de imports con use-pos-cart.
type DiscountType = 'NONE' | 'PERCENTAGE' | 'FIXED'

export interface PosCartDraft {
  cart: CartItem[]
  selectedCustomer: string
  paymentMethod: PaymentMethod
  notes: string
  tipAmount: number
  transferRef: string
  paymentSplits: PaymentSplit[]
  discountType: DiscountType
  discountValue: number
  discountReason: string
  posInvoiceMode: InvoiceMode
  savedAt: string
}

const MAX_AGE_MS = 24 * 60 * 60 * 1000

function key(storeId: number | string) {
  return `pos-cart-draft:${storeId}`
}

/** Devuelve el borrador guardado si existe, es válido y no está vencido. */
export function loadPosCartDraft(storeId: number | string | undefined | null): PosCartDraft | null {
  if (storeId == null || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key(storeId))
    if (!raw) return null
    const draft = JSON.parse(raw) as PosCartDraft
    if (!draft || !Array.isArray(draft.cart) || !draft.savedAt) return null
    if (Date.now() - new Date(draft.savedAt).getTime() > MAX_AGE_MS) {
      window.localStorage.removeItem(key(storeId))
      return null
    }
    return draft
  } catch {
    return null
  }
}

export function savePosCartDraft(
  storeId: number | string | undefined | null,
  draft: Omit<PosCartDraft, 'savedAt'>
) {
  if (storeId == null || typeof window === 'undefined') return
  try {
    // No dejar basura si el carrito quedó vacío y sin datos.
    if (draft.cart.length === 0) {
      window.localStorage.removeItem(key(storeId))
      return
    }
    window.localStorage.setItem(
      key(storeId),
      JSON.stringify({ ...draft, savedAt: new Date().toISOString() })
    )
  } catch {
    /* cuota llena / modo privado: no es crítico */
  }
}

export function clearPosCartDraft(storeId: number | string | undefined | null) {
  if (storeId == null || typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key(storeId))
  } catch {
    /* noop */
  }
}
