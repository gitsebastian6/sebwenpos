import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { writeFile, unlink, stat } from 'fs/promises'
import path from 'path'
import { logger } from '@/lib/logger'
import { requireAuthStoreId } from '@/lib/api-auth'

const CERT_DIR = path.join(process.cwd(), 'certificates')

// POST /api/electronic-invoicing/upload-certificate — Upload .p12 certificate
export async function POST(req: NextRequest) {
  try {
    const storeIdOrErr = requireAuthStoreId(req)
    if (storeIdOrErr instanceof NextResponse) return storeIdOrErr
    const storeIdNum = storeIdOrErr

    const formData = await req.formData()
    const file = formData.get('certificate') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No se recibió el archivo' }, { status: 400 })
    }

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.p12') && !file.name.toLowerCase().endsWith('.pfx')) {
      return NextResponse.json({ error: 'El archivo debe ser .p12 o .pfx' }, { status: 400 })
    }

    // Validate file size (max 50KB for a .p12 cert)
    if (file.size > 50 * 1024) {
      return NextResponse.json({ error: 'El archivo no puede superar 50KB' }, { status: 400 })
    }

    // Validate file size (min 1KB - empty file check)
    if (file.size < 512) {
      return NextResponse.json({ error: 'El archivo parece estar vacío o corrupto' }, { status: 400 })
    }

    const store = await db.store.findUnique({ where: { id: storeIdNum } })
    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    // Generate safe filename
    const certFileName = `store_${storeIdNum}_cert.p12`
    const certPath = path.join(CERT_DIR, certFileName)

    // Delete old certificate if exists
    try { await unlink(certPath) } catch {}

    // Save new certificate
    const bytes = await file.arrayBuffer()
    await writeFile(certPath, Buffer.from(bytes))

    // Update store record
    await db.store.update({
      where: { id: storeIdNum },
      data: { certificateUploaded: true },
    })

    return NextResponse.json({
      message: 'Certificado cargado exitosamente',
      fileName: file.name,
      fileSize: file.size,
      uploadedAt: new Date().toISOString(),
    })
  } catch (error: unknown) {
    logger.error('[Certificate Upload]', error)
    const message = error instanceof Error ? error.message : 'Error al cargar certificado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/electronic-invoicing/upload-certificate?storeId=X — Remove certificate
export async function DELETE(req: NextRequest) {
  try {
    const storeIdOrErr = requireAuthStoreId(req)
    if (storeIdOrErr instanceof NextResponse) return storeIdOrErr
    const storeIdNum = storeIdOrErr

    const certFileName = `store_${storeIdNum}_cert.p12`
    const certPath = path.join(CERT_DIR, certFileName)

    // Delete file
    try { await unlink(certPath) } catch {}

    // Update store record
    await db.store.update({
      where: { id: storeIdNum },
      data: {
        certificateUploaded: false,
        certificatePassword: null,
      },
    })

    return NextResponse.json({ message: 'Certificado eliminado correctamente' })
  } catch (error: unknown) {
    logger.error('[Certificate Delete]', error)
    const message = error instanceof Error ? error.message : 'Error al eliminar certificado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// GET /api/electronic-invoicing/upload-certificate?storeId=X — Check certificate status
export async function GET(req: NextRequest) {
  try {
    const storeIdOrErr = requireAuthStoreId(req)
    if (storeIdOrErr instanceof NextResponse) return storeIdOrErr
    const storeIdNum = storeIdOrErr

    const certFileName = `store_${storeIdNum}_cert.p12`
    const certPath = path.join(CERT_DIR, certFileName)

    try {
      const stats = await stat(certPath)
      const store = await db.store.findUnique({
        where: { id: storeIdNum },
        select: { certificateUploaded: true },
      })

      return NextResponse.json({
        uploaded: true,
        fileName: certFileName,
        fileSize: stats.size,
        lastModified: stats.mtime.toISOString(),
        dbSynced: store?.certificateUploaded === true,
      })
    } catch {
      return NextResponse.json({
        uploaded: false,
        fileName: null,
        fileSize: 0,
        lastModified: null,
        dbSynced: false,
      })
    }
  } catch (error: unknown) {
    logger.error('[Certificate Status]', error)
    const message = error instanceof Error ? error.message : 'Error al consultar certificado'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
