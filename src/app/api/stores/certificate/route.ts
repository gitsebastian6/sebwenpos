import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes, X509Certificate } from 'node:crypto'
import crypto from 'node:crypto'

// Simple reversible encryption for cert password at rest
function encrypt(text: string): string {
  const key = process.env.ENCRYPTION_KEY || 'default-pos-key-32!'
  const buf = Buffer.from(text, 'utf8')
  const keyBuf = Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf8')
  const encrypted = Buffer.alloc(buf.length)
  for (let i = 0; i < buf.length; i++) {
    encrypted[i] = buf[i] ^ keyBuf[i % keyBuf.length]
  }
  return encrypted.toString('base64')
}

function decrypt(encrypted: string): string {
  const key = process.env.ENCRYPTION_KEY || 'default-pos-key-32!'
  const buf = Buffer.from(encrypted, 'base64')
  const keyBuf = Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf8')
  const decrypted = Buffer.alloc(buf.length)
  for (let i = 0; i < buf.length; i++) {
    decrypted[i] = buf[i] ^ keyBuf[i % keyBuf.length]
  }
  return decrypted.toString('utf8')
}

// Extract certificate info from .p12
function extractCertInfo(p12Path: string, password: string): {
  subject: string
  issuer: string
  expiresAt: Date
  serial: string
} | null {
  try {
    const p12Data = readFileSync(p12Path)
    const parsed = crypto.pkcs12.parse(p12Data, password)

    if (!parsed || !parsed.cert) {
      throw new Error('No se pudo leer el certificado. Verifica la contraseña.')
    }

    const cert = new X509Certificate(parsed.cert.toString('binary'))

    return {
      subject: cert.subject,
      issuer: cert.issuer,
      expiresAt: cert.validTo ? new Date(cert.validTo) : new Date(),
      serial: cert.serialNumber || '',
    }
  } catch (error: unknown) {
    if (error instanceof Error && (error.message?.includes('password') || error.message?.includes('decrypt') || (error as NodeJS.ErrnoException).code === 'ERR_OSSL_')) {
      throw new Error('Contraseña del certificado incorrecta. Verifica e intenta de nuevo.')
    }
    throw new Error('Error al leer el certificado: ' + (error instanceof Error ? error.message : 'Formato inválido'))
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
    const storeId = request.nextUrl.searchParams.get('storeId')
    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const store = await db.store.findUnique({
      where: { id: parseInt(storeId) },
    })

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
        where: { id: parseInt(storeId) },
        data: {
          certData: null,
          certPassword: null,
          certUploadedAt: null,
          certExpiresAt: null,
          certSubject: null,
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
        where: { id: parseInt(storeId) },
        data: {
          certData: certDataBase64,
          certPassword: encrypt(certPassword.trim()),
          certUploadedAt: new Date(),
          certExpiresAt: certInfo.expiresAt,
          certSubject: certInfo.subject,
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
    const storeId = request.nextUrl.searchParams.get('storeId')
    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const store = await db.store.findUnique({
      where: { id: parseInt(storeId) },
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
