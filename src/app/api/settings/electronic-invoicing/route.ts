import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/settings/electronic-invoicing?storeId=1
 * 
 * Returns a complete status summary of electronic invoicing configuration.
 * Used by the settings UI to show setup progress and readiness.
 */
export async function GET(request: NextRequest) {
  try {
    const storeId = request.nextUrl.searchParams.get('storeId')
    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const store = await db.store.findUnique({
      where: { id: parseInt(storeId) },
      select: {
        electronicInvoicingEnabled: true,
        connectionMode: true,
        invoiceTestMode: true,
        // Tributary data
        legalName: true,
        nit: true,
        address: true,
        // Resolution
        invoicePrefix: true,
        resolutionNumber: true,
        resolutionStartDate: true,
        resolutionEndDate: true,
        resolutionStartNumber: true,
        resolutionEndNumber: true,
        // Certificate
        certUploadedAt: true,
        certExpiresAt: true,
        certSubject: true,
        // PTE
        pteNit: true,
        pteApiUrl: true,
        pteApiKey: true,
        softwareId: true,
        softwarePin: true,
      },
    })

    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    // ── Calculate readiness checklist ──
    const now = new Date()
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

    // Step 1: Tributary data (legalName + NIT)
    const tributaryReady = !!(store.legalName && store.nit)

    // Step 2: Resolution configured
    const resolutionReady = !!(
      store.resolutionNumber &&
      store.invoicePrefix &&
      store.resolutionStartDate &&
      store.resolutionEndDate &&
      store.resolutionStartNumber &&
      store.resolutionEndNumber
    )

    // Check resolution dates validity
    let resolutionExpired = false
    let resolutionNotActive = false
    if (resolutionReady) {
      if (store.resolutionEndDate && new Date(store.resolutionEndDate) < now) {
        resolutionExpired = true
      }
      if (store.resolutionStartDate && new Date(store.resolutionStartDate) > now) {
        resolutionNotActive = true
      }
    }

    // Step 3: Certificate loaded and valid
    const certReady = !!store.certUploadedAt
    const certExpired = store.certExpiresAt ? store.certExpiresAt < now : false
    const certExpiringSoon = store.certExpiresAt
      ? store.certExpiresAt < thirtyDaysFromNow && !certExpired
      : false
    const daysUntilCertExpiry = store.certExpiresAt
      ? Math.ceil((store.certExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null

    // Step 4: Connection mode configured
    const connectionMode = store.connectionMode || 'DIRECT'
    const isDirectMode = connectionMode === 'DIRECT' || connectionMode === 'HYBRID'
    const isPteMode = connectionMode === 'PTE' || connectionMode === 'HYBRID'

    const directReady = isDirectMode ? certReady && !certExpired : true
    const pteReady = isPteMode ? !!(store.pteNit || store.pteApiUrl) : true

    // Step 5: Software ID (required for DIAN)
    const softwareReady = !!(store.softwareId && store.softwarePin)

    // ── Resolution usage stats ──
    let resolutionStats = null
    if (resolutionReady) {
      const invoices = await db.invoice.findMany({
        where: {
          storeId: parseInt(storeId),
          status: { not: 'CANCELLED' },
        },
        select: { consecutive: true },
      })

      const maxConsecutive = invoices.length > 0
        ? Math.max(...invoices.map(i => i.consecutive))
        : (store.resolutionStartNumber || 1) - 1

      const totalRange = (store.resolutionEndNumber || 0) - (store.resolutionStartNumber || 0) + 1
      const usedCount = Math.max(0, maxConsecutive - (store.resolutionStartNumber || 1) + 1)
      const remaining = Math.max(0, (store.resolutionEndNumber || 0) - maxConsecutive)

      resolutionStats = {
        currentConsecutive: maxConsecutive,
        usedCount,
        totalRange,
        remaining,
        percentageUsed: totalRange > 0 ? Math.round((usedCount / totalRange) * 100) : 0,
      }
    }

    // ── Overall readiness ──
    const steps = [
      { key: 'tributary', label: 'Datos Tributarios', ready: tributaryReady },
      { key: 'resolution', label: 'Resolución DIAN', ready: resolutionReady && !resolutionExpired && !resolutionNotActive },
      { key: 'certificate', label: 'Certificado Digital', ready: certReady && !certExpired },
      { key: 'connection', label: 'Modo de Conexión', ready: directReady && pteReady },
      { key: 'software', label: 'Software DIAN', ready: softwareReady },
    ]

    const completedSteps = steps.filter(s => s.ready).length
    const totalSteps = steps.length
    const isReadyForProduction = completedSteps === totalSteps && !store.invoiceTestMode
    const isReadyForTesting = completedSteps === totalSteps && store.invoiceTestMode

    return NextResponse.json({
      // Master config
      enabled: store.electronicInvoicingEnabled,
      connectionMode,
      testMode: store.invoiceTestMode,
      // Readiness
      steps,
      completedSteps,
      totalSteps,
      readinessPercentage: Math.round((completedSteps / totalSteps) * 100),
      isReadyForProduction,
      isReadyForTesting,
      // Certificate details
      certificate: {
        uploaded: certReady,
        uploadedAt: store.certUploadedAt?.toISOString() ?? null,
        expiresAt: store.certExpiresAt?.toISOString() ?? null,
        subject: store.certSubject,
        expired: certExpired,
        expiringSoon: certExpiringSoon,
        daysUntilExpiry: daysUntilCertExpiry,
      },
      // Resolution details
      resolution: {
        configured: resolutionReady,
        expired: resolutionExpired,
        notActive: resolutionNotActive,
        prefix: store.invoicePrefix,
        number: store.resolutionNumber,
        startDate: store.resolutionStartDate?.toISOString() ?? null,
        endDate: store.resolutionEndDate?.toISOString() ?? null,
        startNumber: store.resolutionStartNumber,
        endNumber: store.resolutionEndNumber,
        stats: resolutionStats,
      },
      // PTE details
      pte: {
        configured: isPteMode && pteReady,
        nit: store.pteNit,
        apiUrl: store.pteApiUrl ? '***configured***' : null,
        hasApiKey: store.pteApiKey ? true : false,
      },
      // Software
      software: {
        configured: softwareReady,
        id: store.softwareId,
        hasPin: !!store.softwarePin,
      },
    })
  } catch (error) {
    console.error('Error fetching electronic invoicing status:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
