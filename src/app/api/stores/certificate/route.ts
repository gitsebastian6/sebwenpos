import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { encryptField, decryptField } from '@/lib/field-encryption'
import { requireAuthStoreId } from '@/lib/api-auth'
import { loadFromP12 } from '@/lib/invoicing/certificate'

// Extract certificate info from .p12
function extractCertInfo(p12Path: string, password: string): {
  subject: string
  issuer: string
  expiresAt: Date
  serial: string
} | null {
  const { cert } = loadFromP12(p12Path, password)

  return {
    subject: cert.subject,
    issuer: cert.issuer,
    expiresAt: cert.validTo ? new Date(cert.validTo) : new Date(),
    serial: cert.serialNumber || '',
  }
}

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'certificates')

// Ensure upload directory exists
function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    // Create recursively
    const parentDir = join(process.cwd(), 'uploads')
    if (!existsSync(parentDir)) {
      writeFileSync(join(parentDir, '.gitkeep'), '')
    }
    writeFileSync(join(UPLOAD_DIR, '.gitkeep'), '')
  }
}

export async function POST(request: NextRequest) {
  try {
    // Tenant isolation: validate storeId against JWT
    const rawStoreId = request.nextUrl.searchParams.get('storeId')
    const storeIdOrErr = requireAuthStoreId(request, rawStoreId ? parseInt(rawStoreId, 10) : undefined)
    if (storeIdOrErr instanceof NextResponse) return storeIdOrErr
    const storeId = storeIdOrErr

    const store = await db.store.findUnique({ where: { id: storeId } })

    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    const formData = await request.formData()
    const certFile = formData.get('certificate') as File | null
    const certPassword = formData.get('password') as string | null
    const action = formData.get('action') as string | null // 'upload' or 'remove'

    // Remove certificate
    if (action === 'remove') {
      await db.store.update({
        where: { id: storeId },
        data: {
          certificatePassword: null,
          certUploadedAt: null,
          certExpiresAt: null,
          certSubject: null,
          certificateUploaded: false,
        },
      })

      return NextResponse.json({
        success: true,
        message: 'Certificado eliminado correctamente',
      })
    }

    // Upload certificate
    if (!certFile) {
      return NextResponse.json({ error: 'El archivo del certificado es requerido' }, { status: 400 })
    }

    if (!certPassword || certPassword.trim().length === 0) {
      return NextResponse.json({ error: 'La contraseña del certificado es requerida' }, { status: 400 })
    }

    // Validate file type
    if (!certFile.name.endsWith('.p12') && !certFile.name.endsWith('.pfx')) {
      return NextResponse.json(
        { error: 'El certificado debe ser un archivo .p12 o .pfx' },
        { status: 400 }
      )
    }

    // Validate file size (max 100KB for p12)
    if (certFile.size > 100 * 1024) {
      return NextResponse.json(
        { error: 'El archivo es demasiado grande. Tamaño máximo: 100KB' },
        { status: 400 }
      )
    }

    // Save to temp file to extract info
    ensureUploadDir()
    const tempPath = join(UPLOAD_DIR, `temp_${randomBytes(8).toString('hex')}.p12`)

    try {
      const bytes = await certFile.arrayBuffer()
      writeFileSync(tempPath, Buffer.from(bytes))

      // Extract certificate info
      const certInfo = extractCertInfo(tempPath, certPassword.trim())

      if (!certInfo) {
        return NextResponse.json({ error: 'No se pudo extraer información del certificado' }, { status: 400 })
      }

      // Check if certificate is expired
      if (certInfo.expiresAt < new Date()) {
        return NextResponse.json(
          { error: 'El certificado está vencido. Necesitas un certificado vigente.' },
          { status: 400 }
        )
      }

      // Check if certificate is expiring within 30 days
      const thirtyDaysFromNow = new Date()
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
      const expiringSoon = certInfo.expiresAt < thirtyDaysFromNow

      // Read file as base64
      const fileBuffer = readFileSync(tempPath)
      const certDataBase64 = fileBuffer.toString('base64')

      // Store in database
      await db.store.update({
        where: { id: storeId },
        data: {
          certificatePassword: encryptField(certPassword.trim()),
          certUploadedAt: new Date(),
          certExpiresAt: certInfo.expiresAt,
          certSubject: certInfo.subject,
          certificateUploaded: true,
        },
      })

      return NextResponse.json({
        success: true,
        message: 'Certificado cargado correctamente',
        certInfo: {
          subject: certInfo.subject,
          issuer: certInfo.issuer,
          expiresAt: certInfo.expiresAt.toISOString(),
          serial: certInfo.serial,
          expiringSoon,
        },
      })
    } finally {
      // Clean up temp file
      if (existsSync(tempPath)) {
        try { unlinkSync(tempPath) } catch {}
      }
    }
  } catch (error: unknown) {
    console.error('Error uploading certificate:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    // Tenant isolation: validate storeId against JWT
    const rawStoreId = request.nextUrl.searchParams.get('storeId')
    const storeIdOrErr = requireAuthStoreId(request, rawStoreId ? parseInt(rawStoreId, 10) : undefined)
    if (storeIdOrErr instanceof NextResponse) return storeIdOrErr
    const storeId = storeIdOrErr

    const store = await db.store.findUnique({
      where: { id: storeId },
      select: {
        certUploadedAt: true,
        certExpiresAt: true,
        certSubject: true,
        invoiceTestMode: true,
      },
    })

    if (!store) {
      return NextResponse.json({ error: 'Tienda no encontrada' }, { status: 404 })
    }

    const hasCertificate = !!store.certUploadedAt

    const now = new Date()
    const isExpired = store.certExpiresAt ? store.certExpiresAt < now : false
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)
    const isExpiringSoon = store.certExpiresAt ? store.certExpiresAt < thirtyDaysFromNow && !isExpired : false
    const daysUntilExpiry = store.certExpiresAt
      ? Math.ceil((store.certExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null

    return NextResponse.json({
      hasCertificate,
      uploadedAt: store.certUploadedAt?.toISOString() ?? null,
      expiresAt: store.certExpiresAt?.toISOString() ?? null,
      subject: store.certSubject,
      isExpired,
      isExpiringSoon,
      daysUntilExpiry,
      testMode: store.invoiceTestMode,
    })
  } catch (error) {
    console.error('Error fetching certificate info:', error)
    const msg = error instanceof Error ? error.message : 'Error interno del servidor'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
