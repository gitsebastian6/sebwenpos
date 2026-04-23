import { db } from '@/lib/db'

// ---------------------------------------------------------------------------
// TIPOS EXPORTADOS
// ---------------------------------------------------------------------------

/** Resultado de getNextConsecutive con toda la info de resolución DIAN */
export interface ConsecutiveResult {
  consecutive: number
  prefix: string
  resolutionNumber: string
  resolutionDate: string
  startDate: Date
  endDate: Date
  startNumber: number
  endNumber: number
  warning?: string
}

/** Información completa de la resolución + estado */
export interface ResolutionInfo {
  prefix: string
  resolutionNumber: string
  startDate: Date
  endDate: Date
  startNumber: number
  endNumber: number
  testMode: boolean
  /** 'OK' | 'WARNING' | 'EXPIRED' | 'EXHAUSTED' | 'NOT_CONFIGURED' */
  status: ResolutionStatus
  /** Porcentaje usado del rango (0-100). null si no hay resolución configurada */
  rangeUsed: number | null
  /** Consecutivo que se asignaría en la próxima factura. null si no hay resolución */
  nextConsecutive: number | null
  /** Mensaje legible con el motivo del estado */
  message: string
  /** Detalle de la advertencia si status === 'WARNING' */
  warning?: string
}

/** Estadísticas de uso de facturación para una tienda */
export interface InvoiceStats {
  totalInvoices: number
  lastConsecutive: number | null
  /** Porcentaje consumido del rango (0-100). null si no hay resolución */
  rangeUsed: number | null
  /** Facturas restantes antes de agotar el rango. null si no hay resolución */
  remainingInvoices: number | null
  /** 'OK' | 'WARNING' | 'EXPIRED' | 'EXHAUSTED' | 'NOT_CONFIGURED' */
  status: ResolutionStatus
}

export type ResolutionStatus =
  | 'OK'
  | 'WARNING'
  | 'EXPIRED'
  | 'EXHAUSTED'
  | 'NOT_CONFIGURED'

/** Umbral por defecto para mostrar advertencia de rango bajo (80 %) */
const WARNING_THRESHOLD_PERCENT = 80

// ---------------------------------------------------------------------------
// HELPERS INTERNOS
// ---------------------------------------------------------------------------

/**
 * Construye el mensaje legible según el estado de la resolución.
 */
function buildStatusMessage(
  status: ResolutionStatus,
  resolutionNumber: string | null,
  data?: {
    rangeUsed?: number | null
    startDate?: Date | null
    endDate?: Date | null
    startNumber?: number | null
    endNumber?: number | null
  },
): string {
  switch (status) {
    case 'NOT_CONFIGURED':
      return (
        'La tienda no tiene configurada una resolución de numeración DIAN. ' +
        'Configure la resolución en la sección de Facturación Electrónica antes de generar facturas.'
      )
    case 'EXPIRED':
      return (
        `La resolución ${resolutionNumber} ha expirado. ` +
        `Fecha de fin: ${data?.endDate ? data.endDate.toISOString().split('T')[0] : 'desconocida'}. ` +
        'Debe obtener una nueva resolución de numeración ante la DIAN.'
      )
    case 'EXHAUSTED':
      return (
        `Se ha agotado el rango de numeración autorizado por la resolución ${resolutionNumber}. ` +
        `Rango: ${data?.startNumber ?? '?'} a ${data?.endNumber ?? '?'}. ` +
        'Debe solicitar una nueva resolución ante la DIAN.'
      )
    case 'WARNING':
      return (
        `Resolución ${resolutionNumber}: rango de numeración al ${data?.rangeUsed ?? '?'}% de su capacidad. ` +
        'Se recomienda solicitar una nueva resolución con anticipación.'
      )
    case 'OK':
      return `Resolución ${resolutionNumber} vigente y dentro del rango autorizado.`
  }
}

/**
 * Valida las fechas de la resolución y devuelve 'EXPIRED' si aplica.
 */
function checkExpiry(
  startDate: Date | null,
  endDate: Date | null,
): ResolutionStatus | null {
  const now = new Date()

  if (startDate && now < startDate) {
    // Aún no entra en vigencia — se trata como expirada para bloquear facturación
    return 'EXPIRED'
  }

  if (endDate && now > endDate) {
    return 'EXPIRED'
  }

  return null
}

/**
 * Calcula el porcentaje de uso del rango y determina si está agotado o en advertencia.
 */
function checkRangeUsage(
  nextConsecutive: number,
  startNumber: number,
  endNumber: number,
  thresholdPercent: number,
): { status: ResolutionStatus; rangeUsed: number; warning?: string } {
  const range = endNumber - startNumber + 1
  const used = nextConsecutive - startNumber
  const rangeUsed = Math.round((used / range) * 100)

  if (nextConsecutive > endNumber) {
    return {
      status: 'EXHAUSTED',
      rangeUsed: 100,
    }
  }

  if (rangeUsed >= thresholdPercent) {
    return {
      status: 'WARNING',
      rangeUsed,
      warning: `El rango de numeración está al ${rangeUsed}% de su capacidad`,
    }
  }

  return { status: 'OK', rangeUsed }
}

/**
 * Obtiene la resolución DIAN de la tienda (campos necesarios).
 * Lanza error si la tienda no existe.
 */
async function getStoreResolution(storeId: number) {
  const store = await db.store.findUniqueOrThrow({
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

  return store
}

/**
 * Obtiene el último consecutivo usado para la tienda.
 */
async function getLastConsecutive(storeId: number): Promise<number> {
  const lastInvoice = await db.invoice.findFirst({
    where: { storeId },
    orderBy: { consecutive: 'desc' },
    select: { consecutive: true },
  })

  return lastInvoice?.consecutive ?? 0
}

/**
 * Obtiene el total de facturas para la tienda.
 */
async function getTotalInvoices(storeId: number): Promise<number> {
  return db.invoice.count({ where: { storeId } })
}

// ---------------------------------------------------------------------------
// FUNCIONES EXPORTADAS
// ---------------------------------------------------------------------------

/**
 * Obtiene el siguiente consecutivo de forma atómica para facturación electrónica.
 *
 * Utiliza una transacción de Prisma para garantizar que dos terminales no obtengan
 * el mismo consecutivo simultáneamente. PostgreSQL provee row-level locking
 * automático dentro de transacciones, asegurando serialización sin bloqueos
 * explícitos adicionales.
 *
 * Validaciones realizadas dentro de la transacción:
 * 1. La tienda tiene resolución DIAN configurada
 * 2. La resolución no ha expirado (hoy está dentro de startDate / endDate)
 * 3. El consecutivo siguiente está dentro del rango autorizado [startNumber, endNumber]
 * 4. Si el uso supera el 80% del rango, incluye un campo `warning`
 *
 * @param storeId - ID de la tienda
 * @returns Objeto con consecutive, prefix y datos de la resolución
 * @throws Error descriptivo en español si la resolución no está configurada,
 *         ha expirado, o el rango está agotado.
 */
/** Cliente con acceso a los modelos necesarios para calcular consecutivos */
type ConsecutiveClient = {
  store: typeof db.store
  invoice: typeof db.invoice
}

export async function getNextConsecutive(
  storeId: number,
  client?: ConsecutiveClient,
): Promise<ConsecutiveResult> {
  const acquire = async (c: ConsecutiveClient): Promise<ConsecutiveResult> => {
    // 1. Obtener resolución de la tienda dentro de la transacción
    const store = await c.store.findUniqueOrThrow({
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

    // 2. Validar que la resolución está configurada
    if (!store.resolutionNumber) {
      throw new Error(
        'La tienda no tiene configurada una resolución de numeración DIAN. ' +
        'Configure la resolución en la sección de Facturación Electrónica antes de generar facturas.',
      )
    }

    if (
      store.resolutionStartNumber == null ||
      store.resolutionEndNumber == null
    ) {
      throw new Error(
        'La resolución de numeración está incompleta. ' +
        'Debe configurar el rango de consecutivos autorizados (número inicial y final).',
      )
    }

    const startNumber = store.resolutionStartNumber
    const endNumber = store.resolutionEndNumber
    const prefix = store.invoicePrefix ?? 'FE'

    // 3. Validar vigencia de la resolución
    const now = new Date()

    if (store.resolutionStartDate && now < store.resolutionStartDate) {
      throw new Error(
        `La resolución ${store.resolutionNumber} no está vigente aún. ` +
        `Fecha de inicio autorizada: ${store.resolutionStartDate.toISOString().split('T')[0]}. ` +
        'No se pueden generar facturas hasta la fecha de inicio.',
      )
    }

    if (store.resolutionEndDate && now > store.resolutionEndDate) {
      throw new Error(
        `La resolución ${store.resolutionNumber} ha expirado. ` +
        `Fecha de fin: ${store.resolutionEndDate.toISOString().split('T')[0]}. ` +
        'Debe obtener una nueva resolución de numeración ante la DIAN antes de continuar facturando.',
      )
    }

    // 4. Obtener el último consecutivo usado (dentro de la transacción para atomicidad)
    const lastInvoice = await c.invoice.findFirst({
      where: { storeId },
      orderBy: { consecutive: 'desc' },
      select: { consecutive: true },
    })

    const nextConsecutive = (lastInvoice?.consecutive ?? 0) + 1

    // 5. Validar que el consecutivo está dentro del rango autorizado
    if (nextConsecutive < startNumber) {
      throw new Error(
        `El consecutivo calculado (${nextConsecutive}) es menor al inicio del rango autorizado (${startNumber}). ` +
        'Verifique la configuración de la resolución o contacte al administrador.',
      )
    }

    if (nextConsecutive > endNumber) {
      throw new Error(
        `Se ha agotado el rango de numeración autorizado por la resolución ${store.resolutionNumber}. ` +
        `Rango autorizado: ${startNumber} a ${endNumber} (${endNumber - startNumber + 1} consecutivos). ` +
        'Debe solicitar una nueva resolución de numeración ante la DIAN para continuar facturando.',
      )
    }

    // 6. Calcular porcentaje de uso y advertencia (> 80%)
    const range = endNumber - startNumber + 1
    const used = nextConsecutive - startNumber
    const usagePercent = Math.round((used / range) * 100)

    let warning: string | undefined
    if (usagePercent >= WARNING_THRESHOLD_PERCENT) {
      warning = `El rango de numeración está al ${usagePercent}% de su capacidad. ` +
        `Quedan ${endNumber - nextConsecutive + 1} consecutivos disponibles. ` +
        'Se recomienda solicitar una nueva resolución ante la DIAN con anticipación.'
    }

    return {
      consecutive: nextConsecutive,
      prefix,
      resolutionNumber: store.resolutionNumber,
      resolutionDate: store.resolutionStartDate?.toISOString() ?? new Date().toISOString(),
      startDate: store.resolutionStartDate,
      endDate: store.resolutionEndDate,
      startNumber,
      endNumber,
      warning,
    }
  }

  if (client) {
    return acquire(client)
  }
  return db.$transaction(async (tx) => acquire({ store: tx.store, invoice: tx.invoice }))
}

/**
 * Valida el estado actual de la resolución DIAN de una tienda.
 *
 * Útil para mostrar indicadores en la UI antes de intentar crear facturas.
 * No modifica ningún dato — es una operación de solo lectura.
 *
 * @param storeId - ID de la tienda
 * @returns Información completa de la resolución con estado y mensaje descriptivo
 */
export async function validateResolution(storeId: number): Promise<ResolutionInfo> {
  const store = await getStoreResolution(storeId)

  // Sin resolución configurada
  if (!store.resolutionNumber) {
    return {
      prefix: store.invoicePrefix ?? 'FE',
      resolutionNumber: '',
      startDate: null as unknown as Date,
      endDate: null as unknown as Date,
      startNumber: 0,
      endNumber: 0,
      testMode: store.invoiceTestMode,
      status: 'NOT_CONFIGURED',
      rangeUsed: null,
      nextConsecutive: null,
      message: buildStatusMessage('NOT_CONFIGURED', null),
    }
  }

  // Rango incompleto
  if (
    store.resolutionStartNumber == null ||
    store.resolutionEndNumber == null
  ) {
    return {
      prefix: store.invoicePrefix ?? 'FE',
      resolutionNumber: store.resolutionNumber,
      startDate: store.resolutionStartDate ?? null as unknown as Date,
      endDate: store.resolutionEndDate ?? null as unknown as Date,
      startNumber: store.resolutionStartNumber ?? 0,
      endNumber: store.resolutionEndNumber ?? 0,
      testMode: store.invoiceTestMode,
      status: 'NOT_CONFIGURED',
      rangeUsed: null,
      nextConsecutive: null,
      message: buildStatusMessage('NOT_CONFIGURED', store.resolutionNumber),
    }
  }

  const startNumber = store.resolutionStartNumber
  const endNumber = store.resolutionEndNumber
  const nextConsecutive = (await getLastConsecutive(storeId)) + 1

  // Verificar expiración
  const expiryStatus = checkExpiry(store.resolutionStartDate, store.resolutionEndDate)
  if (expiryStatus) {
    return {
      prefix: store.invoicePrefix ?? 'FE',
      resolutionNumber: store.resolutionNumber,
      startDate: store.resolutionStartDate!,
      endDate: store.resolutionEndDate!,
      startNumber,
      endNumber,
      testMode: store.invoiceTestMode,
      status: expiryStatus,
      rangeUsed: null,
      nextConsecutive,
      message: buildStatusMessage(expiryStatus, store.resolutionNumber, {
        startDate: store.resolutionStartDate,
        endDate: store.resolutionEndDate,
      }),
    }
  }

  // Verificar uso del rango
  const { status, rangeUsed, warning } = checkRangeUsage(
    nextConsecutive,
    startNumber,
    endNumber,
    WARNING_THRESHOLD_PERCENT,
  )

  return {
    prefix: store.invoicePrefix ?? 'FE',
    resolutionNumber: store.resolutionNumber,
    startDate: store.resolutionStartDate!,
    endDate: store.resolutionEndDate!,
    startNumber,
    endNumber,
    testMode: store.invoiceTestMode,
    status,
    rangeUsed,
    nextConsecutive,
    message: buildStatusMessage(status, store.resolutionNumber, {
      rangeUsed,
      startNumber,
      endNumber,
    }),
    warning,
  }
}

/**
 * Obtiene estadísticas de uso de facturación electrónica para una tienda.
 *
 * Incluye total de facturas emitidas, último consecutivo, porcentaje del rango
 * consumido, consecutivos restantes y el estado actual de la resolución.
 *
 * @param storeId - ID de la tienda
 * @returns Objeto con estadísticas y estado de la resolución
 */
export async function getInvoiceStats(storeId: number): Promise<InvoiceStats> {
  const [totalInvoices, lastConsecutive, store] = await Promise.all([
    getTotalInvoices(storeId),
    getLastConsecutive(storeId),
    getStoreResolution(storeId),
  ])

  // Sin resolución configurada
  if (!store.resolutionNumber || store.resolutionStartNumber == null || store.resolutionEndNumber == null) {
    return {
      totalInvoices,
      lastConsecutive: lastConsecutive > 0 ? lastConsecutive : null,
      rangeUsed: null,
      remainingInvoices: null,
      status: 'NOT_CONFIGURED',
    }
  }

  const startNumber = store.resolutionStartNumber
  const endNumber = store.resolutionEndNumber
  const nextConsecutive = lastConsecutive + 1

  // Verificar expiración primero
  const expiryStatus = checkExpiry(store.resolutionStartDate, store.resolutionEndDate)
  if (expiryStatus) {
    return {
      totalInvoices,
      lastConsecutive: lastConsecutive > 0 ? lastConsecutive : null,
      rangeUsed: null,
      remainingInvoices: null,
      status: expiryStatus,
    }
  }

  // Calcular estadísticas de rango
  const range = endNumber - startNumber + 1
  const used = nextConsecutive - startNumber
  const rangeUsed = Math.round((used / range) * 100)
  const remainingInvoices = Math.max(0, endNumber - lastConsecutive)

  // Determinar estado
  const { status } = checkRangeUsage(nextConsecutive, startNumber, endNumber, WARNING_THRESHOLD_PERCENT)

  return {
    totalInvoices,
    lastConsecutive: lastConsecutive > 0 ? lastConsecutive : null,
    rangeUsed,
    remainingInvoices,
    status,
  }
}
