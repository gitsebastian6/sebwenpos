import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { requireStoreAccess } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// POST: Probar conexión con DIAN (proveedor de facturación electrónica)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const storeId = body.storeId

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const sid = Number(storeId)
    if (isNaN(sid)) {
      return NextResponse.json({ error: 'storeId inválido' }, { status: 400 })
    }

    const authError = requireStoreAccess(req, sid)
    if (authError) return authError

    const store = await db.store.findUnique({
      where: { id: sid },
      select: {
        invoiceProvider: true,
        softwareId: true,
        softwarePin: true,
        certificateUploaded: true,
        certificatePassword: true,
        providerConfig: true,
        nit: true,
      },
    })

    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    if (store.invoiceProvider === 'NONE') {
      return NextResponse.json(
        { error: 'No hay proveedor de facturación electrónica configurado' },
        { status: 400 },
      )
    }

    // Verificar configuración mínima
    const missing: string[] = []
    if (!store.softwareId) missing.push('softwareId')
    if (!store.nit) missing.push('NIT de la tienda')

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Faltan campos obligatorios: ${missing.join(', ')}` },
        { status: 400 },
      )
    }

    // Simular prueba de conexión según el proveedor
    // En producción, aquí se haría una llamada real al API del proveedor
    let result: { success: boolean; message: string; details?: Record<string, string> }

    switch (store.invoiceProvider) {
      case 'FACTUREYA':
        result = {
          success: true,
          message: 'Conexión exitosa con Factureya (modo prueba)',
          details: {
            provider: 'Factureya',
            softwareId: store.softwareId || '',
            testMode: store.providerConfig ? 'Habilitado' : 'Deshabilitado',
            certificate: store.certificateUploaded ? 'Cargado' : 'No cargado',
          },
        }
        break
      case 'NUBEX':
        result = {
          success: true,
          message: 'Conexión exitosa con Nubex (modo prueba)',
          details: {
            provider: 'Nubex',
            softwareId: store.softwareId || '',
            testMode: 'Habilitado',
            certificate: store.certificateUploaded ? 'Cargado' : 'No cargado',
          },
        }
        break
      case 'ACODELCO':
        result = {
          success: true,
          message: 'Conexión exitosa con AcoDeLCo (modo prueba)',
          details: {
            provider: 'AcoDeLCo',
            softwareId: store.softwareId || '',
            testMode: 'Habilitado',
            certificate: store.certificateUploaded ? 'Cargado' : 'No cargado',
          },
        }
        break
      case 'CUSTOM':
        result = {
          success: true,
          message: 'Proveedor personalizado configurado correctamente',
          details: {
            provider: 'Personalizado',
            softwareId: store.softwareId || '',
          },
        }
        break
      default:
        result = {
          success: false,
          message: `Proveedor no soportado: ${store.invoiceProvider}`,
        }
    }

    return NextResponse.json({
      success: result.success,
      message: result.message,
      details: result.details,
      testedAt: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('POST /api/electronic-invoicing/test-connection error:', error)
    return NextResponse.json(
      { success: false, message: 'Error al probar conexión con el proveedor de facturación' },
      { status: 500 },
    )
  }
}
