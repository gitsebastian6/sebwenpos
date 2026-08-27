// ============================================================
// SEBWEN POS — Order Aggregate (raíz de agregado del contexto Sales)
// CONTEXT_MAP §1: "Sales — raíz: Order; venta, carrito, cobro"
// ──────────────────────────────────────────────────────────
// El agregado protege las invariantes de una venta ANTES de
// tocar la base de datos. Es código puro: no conoce Prisma ni
// HTTP, por lo que se testa sin mocks.
//
// Invariantes que protege la raíz:
//   I1. Una orden tiene al menos un ítem.
//   I2. Cada ítem vende exactamente UNA cosa: producto XOR servicio.
//   I3. Cantidades estrictamente positivas.
//   I4. No hay líneas duplicadas del mismo producto+presentación
//       (identidad de línea dentro del agregado).
//   I5. subtotal = Σ totalRow de los ítems.
//   I6. total = subtotal − descuento + propina.
//   I7. Montos no negativos; descuento nunca supera el subtotal.
//
// Uso en la ruta: construir primero los datos calculados y pasar
// por assertValidOrder() antes de abrir la transacción Prisma.
// ============================================================

export interface OrderAggregateLine {
  productId: number | null
  serviceId: number | null
  presentationId?: number | null
  quantity: number
  unitPrice: number
  totalRow: number
}

export interface OrderAggregateTotals {
  subtotal: number
  taxAmount: number
  discountAmount: number
  tipAmount: number
  total: number
}

export type OrderValidationResult =
  | { ok: true; invariant?: undefined; message?: undefined }
  | { ok: false; invariant: string; message: string }

function fail(invariant: string, message: string): OrderValidationResult {
  return { ok: false, invariant, message }
}

/**
 * Valida todas las invariantes del agregado Order.
 * Devuelve el primer fallo encontrado, o { ok: true }.
 */
export function validateOrder(
  lines: OrderAggregateLine[],
  totals: OrderAggregateTotals,
): OrderValidationResult {
  // I1
  if (!lines || lines.length === 0) {
    return fail('I1', 'Una venta debe tener al menos un ítem')
  }

  const seen = new Set<string>()
  for (const [index, line] of lines.entries()) {
    // I2 — exactamente una identidad de venta
    if ((line.productId == null) === (line.serviceId == null)) {
      return fail('I2', `Línea ${index + 1}: debe vender un producto O un servicio, no ambos/ninguno`)
    }

    // I3
    if (!(line.quantity > 0)) {
      return fail('I3', `Línea ${index + 1}: la cantidad debe ser mayor a 0`)
    }
    if (!(line.unitPrice >= 0)) {
      return fail('I3', `Línea ${index + 1}: el precio unitario no puede ser negativo`)
    }

    // I4 — identidad de línea = productId + presentationId
    if (line.productId != null) {
      const key = `${line.productId}:${line.presentationId ?? ''}`
      if (seen.has(key)) {
        return fail('I4', `Línea duplicada (producto ${line.productId}); consolídala en una sola línea`)
      }
      seen.add(key)
    }
  }

  // I5 — el subtotal es derivado, nunca independiente
  const sumRows = lines.reduce((s, l) => s + l.totalRow, 0)
  if (totals.subtotal !== sumRows) {
    return fail('I5', `Subtotal inconsistente: declarado ${totals.subtotal}, calculado ${sumRows}`)
  }

  // I7
  if (totals.discountAmount < 0 || totals.tipAmount < 0) {
    return fail('I7', 'Descuento y propina no pueden ser negativos')
  }
  if (totals.discountAmount > totals.subtotal) {
    return fail('I7', 'El descuento no puede superar el subtotal')
  }

  // I6
  const expectedTotal =
    totals.subtotal - totals.discountAmount + totals.tipAmount
  if (totals.total !== expectedTotal) {
    return fail('I6', `Total inconsistente: declarado ${totals.total}, esperado ${expectedTotal}`)
  }

  return { ok: true }
}
