import { db } from '@/lib/db'

export interface ConsecutiveResult {
  consecutive: number
  prefix: string
  resolutionNumber: string | null
  resolutionStartDate: Date | null
  resolutionEndDate: Date | null
  resolutionStartNumber: number | null
  resolutionEndNumber: number | null
  warn: string | null
}

/**
 * Gets the next consecutive invoice number for a store atomically.
 *
 * Uses a Prisma transaction with SQLite serialization to prevent race conditions
 * when multiple terminals request consecutive numbers simultaneously.
 *
 * Validates:
 * - Resolution date range (start <= now <= end)
 * - Consecutive is within authorized range [startNumber, endNumber]
 * - Warns when usage reaches 90% of the authorized range
 *
 * @param storeId - The store ID to generate the consecutive for
 * @throws Error if resolution is expired, range exhausted, or no resolution configured
 */
export async function getNextConsecutive(storeId: number): Promise<ConsecutiveResult> {
  return await db.$transaction(async (tx) => {
    // 1. Find the max consecutive used for this store
    const lastInvoice = await tx.invoice.findFirst({
      where: { storeId },
      orderBy: { consecutive: 'desc' },
      select: { consecutive: true },
    })

    const nextConsecutive = (lastInvoice?.consecutive ?? 0) + 1

    // 2. Load store resolution fields
    const store = await tx.store.findUniqueOrThrow({
      where: { id: storeId },
      select: {
        invoicePrefix: true,
        resolutionNumber: true,
        resolutionStartDate: true,
        resolutionEndDate: true,
        resolutionStartNumber: true,
        resolutionEndNumber: true,
        invoiceTestMode: true,
      },
    })

    // 3. Validate resolution is configured
    if (!store.resolutionNumber) {
      throw new Error(
        'La tienda no tiene configurada una resolución de numeración DIAN. ' +
        'Configure la resolución en la sección de Facturación Electrónica antes de generar facturas.'
      )
    }

    const now = new Date()

    // 4. Validate resolution start date
    if (store.resolutionStartDate && now < store.resolutionStartDate) {
      throw new Error(
        `La resolución ${store.resolutionNumber} no está vigente aún. ` +
        `Fecha de inicio: ${store.resolutionStartDate.toISOString().split('T')[0]}`
      )
    }

    // 5. Validate resolution end date (expired)
    if (store.resolutionEndDate && now > store.resolutionEndDate) {
      throw new Error(
        `La resolución ${store.resolutionNumber} ha expirado. ` +
        `Fecha de fin: ${store.resolutionEndDate.toISOString().split('T')[0]}. ` +
        'Debe obtener una nueva resolución de numeración ante la DIAN.'
      )
    }

    // 6. Validate consecutive >= startNumber
    if (store.resolutionStartNumber != null && nextConsecutive < store.resolutionStartNumber) {
      throw new Error(
        `El consecutivo ${nextConsecutive} es menor al inicio autorizado (${store.resolutionStartNumber}). ` +
        'Verifique la configuración de la resolución.'
      )
    }

    // 7. Validate consecutive <= endNumber
    if (store.resolutionEndNumber != null && nextConsecutive > store.resolutionEndNumber) {
      throw new Error(
        `Se ha agotado el rango de numeración autorizado por la resolución ${store.resolutionNumber}. ` +
        `Rango: ${store.resolutionStartNumber} a ${store.resolutionEndNumber}. ` +
        'Debe solicitar una nueva resolución ante la DIAN.'
      )
    }

    // 8. Calculate usage percentage and warnings
    let warn: string | null = null
    if (store.resolutionEndNumber != null && store.resolutionStartNumber != null) {
      const range = store.resolutionEndNumber - store.resolutionStartNumber + 1
      const used = nextConsecutive - store.resolutionStartNumber + 1
      const usagePercent = Math.round((used / range) * 100)

      if (usagePercent >= 100) {
        throw new Error(
          `El rango de numeración está al 100% de su capacidad. ` +
          `Se ha agotado la resolución ${store.resolutionNumber}. ` +
          'Debe solicitar una nueva resolución ante la DIAN.'
        )
      }

      if (usagePercent >= 90) {
        warn = `El rango de numeración está al ${usagePercent}% de su capacidad`
      }
    }

    return {
      consecutive: nextConsecutive,
      prefix: store.invoicePrefix ?? 'FE',
      resolutionNumber: store.resolutionNumber,
      resolutionStartDate: store.resolutionStartDate,
      resolutionEndDate: store.resolutionEndDate,
      resolutionStartNumber: store.resolutionStartNumber,
      resolutionEndNumber: store.resolutionEndNumber,
      warn,
    }
  })
}
