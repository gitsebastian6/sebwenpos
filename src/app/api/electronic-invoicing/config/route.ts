import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { writeFile, unlink, access } from 'fs/promises'
import path from 'path'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'
import { encryptField, decryptField } from '@/lib/field-encryption'
import { storeHasFeature, featureGatedResponse } from '@/lib/subscription-helpers'

const eInvoicingConfigSchema = z.object({
  invoiceEnabled: z.boolean().optional(),
  invoiceProvider: z.enum(['NONE', 'DIAN_DIRECT', 'ACCORD_TECHNOLOGY']).optional(),
  certificatePassword: z.string().max(200).optional().nullable().default(null),
  softwareId: z.string().max(50).optional().nullable().default(null),
  softwarePin: z.string().max(50).optional().nullable().default(null),
  providerConfig: z.record(z.string(), z.unknown()).optional().nullable().default(null),
})

// POST /api/electronic-invoicing/config — Save provider config
export async function POST(req: NextRequest) {
  try {
    const storeId = req.headers.get('x-auth-store-id')
    if (!storeId) {
      return NextResponse.json({ error: 'Tienda no identificada' }, { status: 401 })
    }

    const storeIdNum = Number(storeId)
    const storeAccessErr = requireStoreAccess(req, Number(storeId))
    if (storeAccessErr) return storeAccessErr

    // ── Feature Gate: electronicInvoicing ──
    const hasEInvoicing = await storeHasFeature(storeIdNum, 'electronicInvoicing')
    if (!hasEInvoicing) {
      const sub = await db.subscription.findUnique({
        where: { storeId: storeIdNum },
        include: { plan: { select: { name: true } } },
      })
      return NextResponse.json(
        featureGatedResponse('Facturación Electrónica', sub?.plan?.name || 'Sin plan'),
        { status: 403 },
      )
    }

    const body = await req.json()
    const data = eInvoicingConfigSchema.parse(body)

    const { invoiceEnabled, invoiceProvider, certificatePassword, softwareId, softwarePin, providerConfig } = data

    const store = await db.store.findUnique({ where: { id: Number(storeId) } })
    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    // Validate provider-specific required fields
    if (invoiceProvider && invoiceProvider !== 'NONE') {
      if (invoiceProvider === 'DIAN_DIRECT' && !softwareId) {
        return NextResponse.json({ error: 'Para DIAN Directo se requiere el Software ID' }, { status: 400 })
      }
    }

    const updated = await db.store.update({
      where: { id: Number(storeId) },
      data: {
        ...(invoiceEnabled !== undefined && { invoiceEnabled: Boolean(invoiceEnabled) }),
        ...(invoiceProvider && { invoiceProvider: String(invoiceProvider) }),
        ...(certificatePassword !== undefined && { certificatePassword: certificatePassword ? encryptField(String(certificatePassword)) : null }),
        ...(softwareId !== undefined && { softwareId: String(softwareId) || null }),
        ...(softwarePin !== undefined && { softwarePin: softwarePin ? encryptField(String(softwarePin)) : null }),
        ...(providerConfig && { providerConfig: typeof providerConfig === 'string' ? providerConfig : JSON.stringify(providerConfig) }),
      },
    })

    // Parse providerConfig for response
    let parsedConfig = {}
    try { parsedConfig = JSON.parse(updated.providerConfig) } catch {}

    return NextResponse.json({
      ...updated,
      providerConfig: parsedConfig,
      certificatePassword: undefined, // Never send password back
    })
  } catch (error: unknown) {
    logger.error('[E-Invoicing Config]', error)
    const message = error instanceof Error ? error.message : 'Error al guardar configuración'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// GET /api/electronic-invoicing/config?storeId=X — Get current config
export async function GET(req: NextRequest) {
  try {
    const storeId = req.headers.get('x-auth-store-id') || req.nextUrl.searchParams.get('storeId')
    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const storeAccessErr = requireStoreAccess(req, Number(storeId))
    if (storeAccessErr) return storeAccessErr

    const store = await db.store.findUnique({
      where: { id: Number(storeId) },
      select: {
        id: true,
        name: true,
        nit: true,
        legalName: true,
        invoiceEnabled: true,
        invoiceProvider: true,
        invoiceTestMode: true,
        invoicePrefix: true,
        resolutionNumber: true,
        resolutionStartDate: true,
        resolutionEndDate: true,
        resolutionStartNumber: true,
        resolutionEndNumber: true,
        certificateUploaded: true,
        softwareId: true,
        softwarePin: true,
        providerConfig: true,
        // NOT returning certificatePassword for security
      },
    })

    if (!store) {
      // Return safe defaults instead of 404 — store might not have config yet
      return NextResponse.json({
        id: Number(storeId),
        name: '',
        nit: null,
        legalName: null,
        invoiceEnabled: false,
        invoiceProvider: 'NONE',
        invoiceTestMode: true,
        invoicePrefix: null,
        resolutionNumber: null,
        resolutionStartDate: null,
        resolutionEndDate: null,
        resolutionStartNumber: null,
        resolutionEndNumber: null,
        certificateUploaded: false,
        softwareId: null,
        softwarePin: null,
        providerConfig: {},
      })
    }

    // Parse providerConfig safely
    let parsedConfig: Record<string, unknown> = {}
    try {
      if (store.providerConfig) {
        parsedConfig = JSON.parse(store.providerConfig)
        if (!parsedConfig || typeof parsedConfig !== 'object' || Array.isArray(parsedConfig)) {
          parsedConfig = {}
        }
      }
    } catch {
      parsedConfig = {}
    }

    return NextResponse.json({
      ...store,
      providerConfig: parsedConfig,
      softwarePin: store.softwarePin ? decryptField(store.softwarePin) : null,
    })
  } catch (error: unknown) {
    logger.error('[E-Invoicing Config GET]', error)
    const message = error instanceof Error ? error.message : 'Error al consultar configuración'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
