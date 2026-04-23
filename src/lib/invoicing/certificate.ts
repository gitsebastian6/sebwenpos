/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Módulo de certificados digitales para facturación electrónica DIAN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Manejo de certificados .p12 / .pem para firmar documentos XML
 * conforme al estándar W3C XML-DSIG y los requisitos de la DIAN Colombia.
 *
 * Todas las funciones son exclusivas del lado del servidor.
 */

import { createPrivateKey, X509Certificate } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { decryptField } from '@/lib/field-encryption'

// ─── Re-exports for backward compatibility ─────────────────────────────────
export type { CertificateInfo, SignXMLResult, CertificateValidation } from './certificate-types'
export { signXML } from './xml-signing'

// ─── Internal imports ─────────────────────────────────────────────────────
import type { LoadedKeyPair, CryptoKeyObject } from './certificate-types'
import type { CertificateInfo, CertificateValidation, SignXMLResult } from './certificate-types'
import { signXML as signXMLImpl } from './xml-signing'

// Synchronous require for built-in crypto (needed to access crypto.pkcs12)
const require = createRequire(import.meta.url)

/**
 * Cached reference to `crypto.pkcs12` if available (Node.js 20–22).
 * In Node.js 23+ the API was removed, so we fall back to OpenSSL CLI.
 */
const cryptoPkcs12 = (() => {
  try {
    const cryptoModule = require('node:crypto')
    const pkcs12 = cryptoModule.pkcs12
    if (pkcs12 && typeof pkcs12.parse === 'function') {
      return pkcs12 as {
        parse: (buf: Buffer, pass: string) => { cert?: { export: (opts: object) => Buffer }; key?: { export: (opts: object) => Buffer } }
      }
    }
  } catch {
    // Not available
  }
  return null
})()

// ─── Carga de certificados ────────────────────────────────────────────────

/**
 * Carga un certificado y llave privada desde archivos PEM.
 *
 * @param certPath - Ruta al archivo del certificado (.pem / .crt)
 * @param keyPath  - Ruta al archivo de la llave privada (.pem / .key)
 * @returns Objeto con el certificado X.509 y la llave privada
 * @throws Error si los archivos no existen o no se pueden leer
 */
export function loadFromPEM(certPath: string, keyPath: string): LoadedKeyPair {
  // ── Validar que los archivos existen ──
  if (!existsSync(certPath)) {
    throw new Error(
      `El archivo del certificado no existe: ${certPath}. ` +
      'Verifique la ruta del archivo .pem o .crt en la configuración de facturación electrónica.'
    )
  }

  if (!existsSync(keyPath)) {
    throw new Error(
      `El archivo de la llave privada no existe: ${keyPath}. ` +
      'Verifique la ruta del archivo .key o .pem en la configuración de facturación electrónica.'
    )
  }

  // ── Leer archivos ──
  let certPem: string
  let keyPem: string

  try {
    certPem = readFileSync(certPath, 'utf-8')
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Desconocido'
    throw new Error(
      `No se pudo leer el archivo del certificado: ${certPath}. Error: ${msg}`
    )
  }

  try {
    keyPem = readFileSync(keyPath, 'utf-8')
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Desconocido'
    throw new Error(
      `No se pudo leer la llave privada: ${keyPath}. Error: ${msg}`
    )
  }

  // ── Parsear certificado X.509 ──
  let cert: X509Certificate
  try {
    cert = new X509Certificate(certPem)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Desconocido'
    throw new Error(
      `El archivo del certificado no es un certificado X.509 PEM válido: ${msg}`
    )
  }

  // ── Cargar llave privada ──
  let key: CryptoKeyObject
  try {
    key = createPrivateKey(keyPem)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Desconocido'
    throw new Error(
      `La llave privada no es válida o está en un formato no soportado: ${msg}`
    )
  }

  return { cert, key }
}

/**
 * Carga un certificado y llave privada desde un archivo PKCS#12 (.p12 / .pfx).
 *
 * Soporta dos estrategias de extracción:
 * 1. `crypto.pkcs12.parse()` nativo (disponible en Node.js 20–22)
 * 2. OpenSSL CLI como fallback (para Node.js 23+ donde pkcs12 fue removido)
 *
 * @param p12Path   - Ruta al archivo .p12 / .pfx
 * @param password  - Contraseña del archivo PKCS#12
 * @returns Objeto con el certificado X.509 y la llave privada
 * @throws Error si el archivo no existe, la contraseña es incorrecta o el formato es inválido
 */
export function loadFromP12(p12Path: string, password: string): LoadedKeyPair {
  // ── Validar que el archivo existe ──
  if (!existsSync(p12Path)) {
    throw new Error(
      `El archivo PKCS#12 no existe: ${p12Path}. ` +
      'Verifique la ruta del certificado .p12 en la configuración de facturación electrónica.'
    )
  }

  // ── Leer archivo binario ──
  let p12Buffer: Buffer
  try {
    p12Buffer = readFileSync(p12Path)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Desconocido'
    throw new Error(`No se pudo leer el archivo PKCS#12: ${p12Path}. Error: ${msg}`)
  }

  // ── Estrategia 1: crypto.pkcs12.parse() (Node.js 20–22) ──
  if (cryptoPkcs12) {
    try {
      const parsed = cryptoPkcs12.parse(p12Buffer, password)

      if (!parsed.cert) {
        throw new Error('El archivo PKCS#12 no contiene un certificado válido.')
      }
      if (!parsed.key) {
        throw new Error('El archivo PKCS#12 no contiene una llave privada.')
      }

      const certPem = parsed.cert.export({ type: 'pem', format: 'der' }) as Buffer
      const keyPem = parsed.key.export({ type: 'pkcs8', format: 'pem' }) as Buffer

      const cert = new X509Certificate(certPem)
      const key = createPrivateKey(keyPem)

      return { cert, key }
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      if (msg.includes('bad password') || msg.includes('decrypt') || msg.includes('password')) {
        throw new Error(
          'La contraseña del certificado PKCS#12 es incorrecta. ' +
          'Verifique la contraseña configurada en la facturación electrónica.'
        )
      }
      if (msg.includes('no contiene')) {
        throw error
      }
      // For other errors (e.g. corrupt file), fall through to OpenSSL fallback
    }
  }

  // ── Estrategia 2: OpenSSL CLI fallback (Node.js 23+) ──
  return loadFromP12ViaOpenSSL(p12Path, password, p12Buffer)
}

/**
 * Extrae certificado y llave de un .p12 usando OpenSSL CLI.
 *
 * Este fallback se utiliza cuando `crypto.pkcs12.parse()` no está disponible
 * (Node.js 23+), ya que la API fue removida del módulo crypto nativo.
 */
function loadFromP12ViaOpenSSL(p12Path: string, password: string, _p12Buffer: Buffer): LoadedKeyPair {
  const tmpDir = path.join(process.cwd(), '.tmp-p12')

  // Create temp directory if needed
  if (!existsSync(tmpDir)) {
    execSync(`mkdir -p "${tmpDir}"`, { stdio: 'pipe' })
  }

  const certTmp = path.join(tmpDir, `cert_${Date.now()}.pem`)
  const keyTmp = path.join(tmpDir, `key_${Date.now()}.pem`)

  try {
    // Extract certificate (PEM)
    execSync(
      `openssl pkcs12 -in "${p12Path}" -clcerts -nokeys -out "${certTmp}" -passin pass:"${password.replace(/"/g, '\\"')}"`,
      { stdio: 'pipe', timeout: 15000 }
    )

    // Extract private key (PEM)
    execSync(
      `openssl pkcs12 -in "${p12Path}" -nocerts -out "${keyTmp}" -passin pass:"${password.replace(/"/g, '\\"')}" -passout pass:"${password.replace(/"/g, '\\"')}"`,
      { stdio: 'pipe', timeout: 15000 }
    )

    // Remove passphrase from the key (so createPrivateKey can read it directly)
    const keyTmpDecrypted = path.join(tmpDir, `key_dec_${Date.now()}.pem`)
    execSync(
      `openssl rsa -in "${keyTmp}" -out "${keyTmpDecrypted}" -passin pass:"${password.replace(/"/g, '\\"')}"`,
      { stdio: 'pipe', timeout: 15000 }
    )

    // Now load via PEM path
    const result = loadFromPEM(certTmp, keyTmpDecrypted)
    return result
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Desconocido'
    if (
      msg.includes('bad password') ||
      msg.includes('bad decrypt') ||
      msg.includes('wrong password') ||
      msg.includes('MAC verify')
    ) {
      throw new Error(
        'La contraseña del certificado PKCS#12 es incorrecta. ' +
        'Verifique la contraseña configurada en la facturación electrónica.'
      )
    }
    throw new Error(`Error al extraer datos del archivo PKCS#12 usando OpenSSL: ${msg}`)
  } finally {
    // Clean up temp files
    for (const f of [certTmp, keyTmp]) {
      try { execSync(`rm -f "${f}"`, { stdio: 'pipe' }) } catch { /* ignore */ }
    }
    // Also clean up decrypted key temp file if it was created
    const decFiles = existsSync(tmpDir)
      ? execSync(`ls "${tmpDir}"/key_dec_*.pem 2>/dev/null`, { stdio: 'pipe', timeout: 3000 }).toString().trim().split('\n')
      : []
    for (const f of decFiles) {
      if (f) try { execSync(`rm -f "${f}"`, { stdio: 'pipe' }) } catch { /* ignore */ }
    }
  }
}

/**
 * Carga un certificado detectando automáticamente el formato (.p12 o .pem).
 *
 * Soporta múltiples combinaciones de entrada:
 * - `p12Path` + `p12Password` → carga directa PKCS#12
 * - `certPath` → auto-detecta formato: si termina en .p12/.pfx usa `loadFromP12`,
 *   si termina en .pem/.crt usa `loadFromPEM` con `keyPath`
 * - `certPath` + `keyPath` → carga PEM
 *
 * @param options - Rutas y contraseñas del certificado
 * @returns Objeto con el certificado X.509 y la llave privada
 */
export function loadCertificate(options: {
  p12Path?: string
  p12Password?: string
  certPath?: string
  keyPath?: string
}): LoadedKeyPair {
  const { p12Path, p12Password, certPath, keyPath } = options

  // ── Ruta explícita PKCS#12 ──
  if (p12Path) {
    if (!p12Password) {
      throw new Error(
        'Se requiere la contraseña para abrir el archivo PKCS#12 (.p12). ' +
        'Proporcione el parámetro p12Password.'
      )
    }
    return loadFromP12(p12Path, p12Password)
  }

  // ── Auto-detectar formato por extensión de archivo ──
  if (certPath) {
    const ext = certPath.toLowerCase()
    const isP12 = ext.endsWith('.p12') || ext.endsWith('.pfx')

    if (isP12) {
      const pwd = p12Password || process.env.DIAN_CERT_PASSWORD || ''
      return loadFromP12(certPath, pwd)
    }

    if (keyPath) {
      return loadFromPEM(certPath, keyPath)
    }

    throw new Error(
      `Se proporcionó certPath (${certPath}) pero no keyPath. ` +
      'Para certificados PEM se requiere también la llave privada (keyPath).'
    )
  }

  throw new Error(
    'No se proporcionaron rutas de certificado válidas. ' +
    'Debe especificar p12Path + p12Password (para .p12), o certPath + keyPath (para .pem).'
  )
}

// ─── Información del certificado ───────────────────────────────────────────

/**
 * Extrae la información relevante de un certificado X.509.
 *
 * @param cert - Objeto X509Certificate de Node.js
 * @returns Información estructurada del certificado
 */
export function getCertificateInfo(cert: X509Certificate): CertificateInfo {
  const now = new Date()

  // Usar validFromDate / validToDate si están disponibles (Node 22.10+),
  // si no, convertir desde strings
  let validFrom: Date
  let validTo: Date
  try {
    // Preferir propiedades Date directas si existen
    validFrom = (cert as unknown as { validFromDate?: Date }).validFromDate
      ?? new Date(cert.validFrom)
    validTo = (cert as unknown as { validToDate?: Date }).validToDate
      ?? new Date(cert.validTo)
  } catch {
    validFrom = new Date(cert.validFrom)
    validTo = new Date(cert.validTo)
  }

  // Calcular días hasta expiración
  const diffMs = validTo.getTime() - now.getTime()
  const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  // Huella digital SHA-256
  const fingerprint = cert.fingerprint256.replace(/:/g, '').toUpperCase()

  // Obtener el algoritmo de la llave pública
  let publicKeyAlgorithm = 'Desconocido'
  try {
    const pubKey = cert.publicKey
    if (pubKey) {
      publicKeyAlgorithm = pubKey.asymmetricKeyType?.toString() ?? 'Desconocido'
    }
  } catch {
    // Si no se puede obtener, dejar como desconocido
  }

  return {
    subject: cert.subject,
    issuer: cert.issuer,
    serialNumber: cert.serialNumber.toUpperCase(),
    validFrom,
    validTo,
    isExpired: now > validTo,
    daysUntilExpiry,
    publicKeyAlgorithm,
    fingerprint,
  }
}

// ─── Validación del certificado ────────────────────────────────────────────

/**
 * Valida que los archivos de certificado existan y sean aptos para firmar.
 *
 * Comprueba:
 * - Los archivos existen en disco
 * - El certificado se puede cargar y parsear
 * - El certificado no está expirado
 * - El certificado aún no está vigente (fecha futura)
 *
 * @param certPath - Ruta al certificado (.pem, .crt, .p12)
 * @param keyPath  - Ruta a la llave privada (.pem, .key). Null si se usa .p12
 * @returns Resultado de la validación
 */
export function validateCertificate(
  certPath: string | null,
  keyPath: string | null
): CertificateValidation {
  // ── Verificar que se proporcionó al menos una ruta ──
  if (!certPath) {
    return {
      valid: false,
      error: 'No se proporcionó la ruta del certificado. Configure DIAN_CERT_PATH o DIAN_P12_PATH.',
    }
  }

  // ── Verificar que el archivo existe ──
  if (!existsSync(certPath)) {
    return {
      valid: false,
      error: `El archivo del certificado no existe: ${certPath}. ` +
        'Verifique la ruta configurada en las variables de entorno.',
    }
  }

  // ── Si es formato PEM, verificar que la llave también existe ──
  const isP12 = certPath.toLowerCase().endsWith('.p12') || certPath.toLowerCase().endsWith('.pfx')
  if (!isP12 && !keyPath) {
    return {
      valid: false,
      error: 'Se proporcionó un certificado PEM pero no la llave privada. ' +
        'Configure DIAN_KEY_PATH con la ruta al archivo de la llave privada.',
    }
  }

  if (!isP12 && keyPath && !existsSync(keyPath)) {
    return {
      valid: false,
      error: `El archivo de la llave privada no existe: ${keyPath}. ` +
        'Verifique la ruta configurada en la variable de entorno DIAN_KEY_PATH.',
    }
  }

  // ── Si es .p12, validar usando loadFromP12 ──
  if (isP12) {
    const password = process.env.DIAN_CERT_PASSWORD || ''
    try {
      const loaded = loadFromP12(certPath, password)
      const cert = loaded.cert
      const info = getCertificateInfo(cert)

      const now = new Date()
      if (now > info.validTo) {
        return {
          valid: false,
          error: `El certificado ha EXPIRADO. Fecha de expiración: ${info.validTo.toISOString().split('T')[0]}. ` +
            'Debe renovar el certificado con la entidad certificadora para continuar facturando electrónicamente.',
          info,
        }
      }

      if (now < info.validFrom) {
        return {
          valid: false,
          error: `El certificado aún no está vigente. Fecha de inicio: ${info.validFrom.toISOString().split('T')[0]}. ` +
            'Verifique las fechas del certificado con la entidad certificadora.',
          info,
        }
      }

      if (info.daysUntilExpiry <= 30 && info.daysUntilExpiry > 0) {
        return {
          valid: true,
          error: `ADVERTENCIA: El certificado expira en ${info.daysUntilExpiry} día(s). ` +
            'Se recomienda renovarlo a la brevedad para evitar interrupciones en la facturación electrónica.',
          info,
        }
      }

      return { valid: true, info }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Error desconocido al cargar el certificado PKCS#12.'
      return { valid: false, error: msg }
    }
  }

  // ── Intentar cargar y extraer información del certificado PEM ──
  if (!keyPath) {
    return {
      valid: false,
      error: 'No se proporcionó la ruta de la llave privada para el formato PEM.',
    }
  }

  try {
    const loaded = loadFromPEM(certPath, keyPath)
    const cert = loaded.cert
    const info = getCertificateInfo(cert)

    // ── Verificar vigencia ──
    const now = new Date()
    if (now > info.validTo) {
      return {
        valid: false,
        error: `El certificado ha EXPIRADO. Fecha de expiración: ${info.validTo.toISOString().split('T')[0]}. ` +
          'Debe renovar el certificado con la entidad certificadora para continuar facturando electrónicamente.',
        info,
      }
    }

    if (now < info.validFrom) {
      return {
        valid: false,
        error: `El certificado aún no está vigente. Fecha de inicio: ${info.validFrom.toISOString().split('T')[0]}. ` +
          'Verifique las fechas del certificado con la entidad certificadora.',
        info,
      }
    }

    // ── Advertencia si está próximo a expirar (30 días o menos) ──
    if (info.daysUntilExpiry <= 30 && info.daysUntilExpiry > 0) {
      return {
        valid: true,
        error: `ADVERTENCIA: El certificado expira en ${info.daysUntilExpiry} día(s). ` +
          'Se recomienda renovarlo a la brevedad para evitar interrupciones en la facturación electrónica.',
        info,
      }
    }

    return {
      valid: true,
      info,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error desconocido al cargar el certificado.'
    return {
      valid: false,
      error: msg,
    }
  }
}

// ─── Wrapper DIAN ──────────────────────────────────────────────────────────

/**
 * Firma un XML para envío a la DIAN usando la configuración del entorno o del store.
 *
 * Estrategia de resolución del certificado (en orden de prioridad):
 * 1. Variables de entorno PEM: `DIAN_CERT_PATH` + `DIAN_KEY_PATH`
 * 2. Variable de entorno PKCS#12: `DIAN_P12_PATH` + `DIAN_CERT_PASSWORD`
 * 3. Certificado subido por la tienda en la configuración de e-invoicing
 *    (archivo en `/certificates/store_{storeId}_cert.p12` + `certificatePassword`)
 *
 * @param xmlContent - XML UBL 2.1 a firmar
 * @param storeId    - ID de la tienda (opcional). Si se proporciona, busca el
 *                     certificado subido en la configuración de facturación electrónica.
 * @returns Resultado de la firma XML
 * @throws Error si la configuración es incompleta o el certificado es inválido
 */
export async function signXMLForDIAN(
  xmlContent: string,
  storeId?: number | null
): Promise<SignXMLResult> {
  let cert: X509Certificate
  let key: CryptoKeyObject

  // ── Estrategia 1: PEM via variables de entorno ──
  const certPath = process.env.DIAN_CERT_PATH || null
  const keyPath = process.env.DIAN_KEY_PATH || null
  const password = process.env.DIAN_CERT_PASSWORD || ''

  if (certPath && keyPath) {
    const ext = certPath.toLowerCase()
    const isP12 = ext.endsWith('.p12') || ext.endsWith('.pfx')

    if (isP12) {
      // DIAN_CERT_PATH apunta a un .p12
      try {
        const loaded = loadFromP12(certPath, password)
        cert = loaded.cert
        key = loaded.key
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Error al cargar el certificado PKCS#12: ${error.message}`)
        }
        throw new Error('Error desconocido al cargar el certificado PKCS#12.')
      }
    } else {
      try {
        const loaded = loadFromPEM(certPath, keyPath)
        cert = loaded.cert
        key = loaded.key
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Error al cargar el certificado PEM: ${error.message}`)
        }
        throw new Error('Error desconocido al cargar el certificado PEM.')
      }
    }
  } else {
    // ── Estrategia 2: PKCS#12 via DIAN_P12_PATH ──
    const p12Path = process.env.DIAN_P12_PATH || null

    if (p12Path) {
      try {
        const loaded = loadFromP12(p12Path, password)
        cert = loaded.cert
        key = loaded.key
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`Error al cargar el certificado PKCS#12 (DIAN_P12_PATH): ${error.message}`)
        }
        throw new Error('Error desconocido al cargar el certificado PKCS#12.')
      }
    } else if (storeId) {
      // ── Estrategia 3: Certificado subido por la tienda ──
      const loaded = await loadUploadedStoreCert(storeId)
      cert = loaded.cert
      key = loaded.key
    } else {
      throw new Error(
        'No se encontró configuración de certificado. Configure una de las siguientes opciones:\n\n' +
        '1. PEM: Variables de entorno DIAN_CERT_PATH y DIAN_KEY_PATH\n' +
        '2. PKCS#12: Variables de entorno DIAN_P12_PATH y DIAN_CERT_PASSWORD\n' +
        '3. Upload: Subir un certificado .p12 desde la configuración de facturación electrónica'
      )
    }
  }

  // ── Validar vigencia del certificado ──
  const info = getCertificateInfo(cert)
  if (info.isExpired) {
    throw new Error(
      `No se puede firmar el XML: el certificado ha EXPIRADO el ${info.validTo.toISOString().split('T')[0]}. ` +
      'Debe renovar el certificado con la entidad certificadora antes de continuar.'
    )
  }

  const now = new Date()
  if (now < info.validFrom) {
    throw new Error(
      `No se puede firmar el XML: el certificado no está vigente aún. ` +
      `Fecha de inicio: ${info.validFrom.toISOString().split('T')[0]}.`
    )
  }

  // ── Firmar el XML ──
  return signXMLImpl(xmlContent, cert, key)
}

/**
 * Carga el certificado .p12 subido por la tienda desde la base de datos.
 *
 * Busca el archivo en `/certificates/store_{storeId}_cert.p12` y usa
 * el `certificatePassword` almacenado en la tabla de tiendas.
 */
async function loadUploadedStoreCert(storeId: number): Promise<LoadedKeyPair> {
  const certDir = path.join(process.cwd(), 'certificates')
  const certFileName = `store_${storeId}_cert.p12`
  const certPath = path.join(certDir, certFileName)

  if (!existsSync(certPath)) {
    throw new Error(
      `No se encontró el certificado subido para la tienda ${storeId}. ` +
      `Archivo esperado: ${certPath}. Suba un certificado .p12 desde la configuración de facturación electrónica.`
    )
  }

  // Load password from DB
  let password = ''
  try {
    // Dynamic import to avoid circular dependency issues at module load time
    const { db } = await import('@/lib/db')
    const store = await db.store.findUnique({
      where: { id: storeId },
      select: { certificatePassword: true },
    })
    password = store?.certificatePassword ? decryptField(store.certificatePassword) : ''
  } catch {
    // If DB is not available, try env var as fallback
    password = process.env.DIAN_CERT_PASSWORD || ''
  }

  if (!password) {
    throw new Error(
      `No se encontró la contraseña del certificado para la tienda ${storeId}. ` +
      'Configure la contraseña del certificado en la configuración de facturación electrónica, ' +
      'o establezca la variable de entorno DIAN_CERT_PASSWORD.'
    )
  }

  return loadFromP12(certPath, password)
}
