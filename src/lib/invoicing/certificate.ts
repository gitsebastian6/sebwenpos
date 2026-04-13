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

import { createHash, createPrivateKey, createSign, randomUUID, X509Certificate } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

// ─── Interfaces ────────────────────────────────────────────────────────────

/**
 * Información extraída de un certificado X.509.
 */
export interface CertificateInfo {
  /** DN del sujeto: CN=Bar La Terraza, O=Bar La Terraza S.A.S... */
  subject: string
  /** DN de la entidad emisora (CA) */
  issuer: string
  /** Número de serie del certificado */
  serialNumber: string
  /** Fecha de inicio de vigencia */
  validFrom: Date
  /** Fecha de fin de vigencia */
  validTo: Date
  /** Indica si el certificado ya expiró */
  isExpired: boolean
  /** Días restantes de vigencia (negativo si ya expiró) */
  daysUntilExpiry: number
  /** Algoritmo de la llave pública (ej: RSA) */
  publicKeyAlgorithm: string
  /** Huella digital SHA-256 en formato hexadecimal */
  fingerprint: string
}

/**
 * Resultado de la firma XML digital.
 */
export interface SignXMLResult {
  /** XML completo con la firma insertada */
  signedXml: string
  /** Valor de la firma en Base64 */
  signatureValue: string
  /** Cadena del certificado en Base64 (sin headers PEM) */
  certificateBase64: string
  /** Fragmento XML KeyInfo */
  keyInfo: string
}

// ─── Utilidades de canonicalización XML ────────────────────────────────────

/**
 * Implementación simplificada de Exclusive XML Canonicalization (C14N).
 *
 * Normaliza un fragmento XML para producir una representación canónica
 * determinista que se usa para calcular el digest y firmar.
 *
 * Soporta los requisitos principales de DIAN:
 * - Eliminación de declaraciones XML
 * - Normalización de espacios en blanco
 * - Codificación UTF-8
 *
 * NOTA: Para producción con validación estricta de la DIAN se recomienda
 * usar la librería `xml-crypto` que implementa C14N completo.
 */
function exclusiveCanonicalize(xml: string): string {
  let canon = xml

  // 1. Eliminar declaración XML si está presente
  canon = canon.replace(/^<\?xml[^?]*\?>\s*/i, '')

  // 2. Eliminar comentarios XML
  canon = canon.replace(/<!--[\s\S]*?-->/g, '')

  // 3. Eliminar instrucciones de procesamiento
  canon = canon.replace(/<\?[^?]*\?>/g, '')

  // 4. Normalizar espacios en blanco en atributos
  //    - Reemplazar secuencias de espacios/tabs/newlines por un solo espacio
  //    - Eliminar espacios al inicio y final de valores de atributos
  canon = canon.replace(/="([^"]*?)"/g, (_match, value: string) => {
    const normalized = value.replace(/\s+/g, ' ').trim()
    return `="${normalized}"`
  })

  // 5. Eliminar espacios sobrantes entre atributos
  canon = canon.replace(/\s{2,}/g, ' ')

  // 6. Normalizar espacios en blanco entre etiquetas
  //    (eliminar para firma enveloped)
  canon = canon.replace(/>\s+</g, '><')

  // 7. Eliminar CDATA wrappers y escapar contenido
  canon = canon.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_match, content: string) => {
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  })

  // 8. Eliminar espacios alrededor del signo = en atributos
  canon = canon.replace(/\s*=\s*/g, '=')

  return canon.trim()
}

/**
 * Normaliza las entidades XML para canonicalización.
 * Convierte entidades numéricas y nombradas a su forma canónica.
 */
function normalizeEntities(xml: string): string {
  return xml
    .replace(/&nbsp;/g, '&#160;')
    .replace(/&copy;/g, '&#169;')
    .replace(/&reg;/g, '&#174;')
    .replace(/&trade;/g, '&#8482;')
}

// ─── Utilidades de encoding ────────────────────────────────────────────────

/**
 * Convierte un Buffer a Base64 sin saltos de línea.
 */
function toBase64(data: Buffer | Uint8Array): string {
  return Buffer.from(data).toString('base64').replace(/\r?\n/g, '')
}

// ─── Carga de certificados ────────────────────────────────────────────────

/**
 * Resultado de la carga de un certificado y su llave privada.
 */
interface LoadedKeyPair {
  cert: X509Certificate
  key: CryptoKeyObject
}

/** Re-exportar tipo KeyObject de crypto */
type CryptoKeyObject = ReturnType<typeof createPrivateKey>

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
 * Carga un certificado y llave privada desde un archivo PKCS#12 (.p12).
 *
 * IMPORTANTE: Esta función requiere que el archivo .p12 se convierta previamente
 * a formato PEM usando OpenSSL, ya que el entorno de ejecución actual no
 * dispone de `crypto.pkcs12.parse()` de forma nativa.
 *
 * Para convertir .p12 a .pem ejecute los siguientes comandos:
 * ```
 * openssl pkcs12 -in cert.p12 -nocerts -out key.pem
 * openssl pkcs12 -in cert.p12 -clcerts -nokeys -out cert.pem
 * ```
 *
 * Luego use `loadFromPEM(certPath, keyPath)` en su lugar.
 *
 * @param _p12Path  - Ruta al archivo .p12
 * @param _password - Contraseña del archivo PKCS#12
 * @throws Error siempre, con instrucciones para convertir a PEM
 */
export function loadFromP12(_p12Path: string, _password: string): never {
  throw new Error(
    'La carga directa de archivos .p12 (PKCS#12) no está disponible en este entorno. ' +
    'Para utilizar su certificado digital, conviértalo a formato PEM con los siguientes comandos:\n\n' +
    '  openssl pkcs12 -in cert.p12 -nocerts -out key.pem\n' +
    '  openssl pkcs12 -in cert.p12 -clcerts -nokeys -out cert.pem\n\n' +
    'Luego configure las variables de entorno:\n' +
    '  DIAN_CERT_PATH=/ruta/al/cert.pem\n' +
    '  DIAN_KEY_PATH=/ruta/al/key.pem\n\n' +
    'Alternativamente, si el archivo .p12 ya está convertido a PEM, use la función loadFromPEM().'
  )
}

/**
 * Carga un certificado detectando automáticamente el formato (.p12 o .pem).
 *
 * Si `p12Path` es proporcionado, intenta cargar como PKCS#12 (lanza error
 * con instrucciones para convertir a PEM).
 * Si `certPath` y `keyPath` son proporcionados, los carga como PEM.
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

  if (p12Path) {
    if (!p12Password) {
      throw new Error(
        'Se requiere la contraseña para abrir el archivo PKCS#12 (.p12). ' +
        'Proporcione el parámetro p12Password.'
      )
    }
    return loadFromP12(p12Path, p12Password)
  }

  if (certPath && keyPath) {
    return loadFromPEM(certPath, keyPath)
  }

  throw new Error(
    'No se proporcionaron rutas de certificado válidas. ' +
    'Debe especificar p12Path + p12Password (para .p12) o certPath + keyPath (para .pem).'
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

// ─── Firma XML Digital ────────────────────────────────────────────────────

/**
 * URIs de algoritmos XML-DSIG estándar W3C.
 */
const XMLDSIG_ALGORITHMS = {
  /** Canonicalización exclusiva sin comentarios */
  CANONICALIZATION: 'http://www.w3.org/2001/10/xml-exc-c14n#',
  /** Firma RSA con SHA-256 */
  SIGNATURE_RSA_SHA256: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  /** Digest SHA-256 */
  DIGEST_SHA256: 'http://www.w3.org/2001/04/xmlenc#sha256',
  /** Transforma Enveloped Signature (elimina el nodo Signature para digest) */
  ENVELOPED_SIGNATURE: 'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
} as const

/**
 * Espacio de nombres XML-DSIG.
 */
const DS_NS = 'http://www.w3.org/2000/09/xmldsig#'
const DS_PREFIX = 'ds'

/**
 * Genera un identificador único de referencia para la firma.
 */
function generateReferenceId(): string {
  return `_${randomUUID()}`
}

/**
 * Construye el elemento KeyInfo en XML.
 *
 * @param certBase64 - Certificado en Base64 (sin headers PEM)
 * @returns Fragmento XML con KeyInfo
 */
function buildKeyInfo(certBase64: string): string {
  return [
    `<${DS_PREFIX}:KeyInfo>`,
    `  <${DS_PREFIX}:X509Data>`,
    `    <${DS_PREFIX}:X509Certificate>${certBase64}</${DS_PREFIX}:X509Certificate>`,
    `  </${DS_PREFIX}:X509Data>`,
    `</${DS_PREFIX}:KeyInfo>`,
  ].join('\n')
}

/**
 * Extrae el certificado en Base64 limpio (sin headers PEM ni saltos de línea).
 *
 * Utiliza `cert.toString()` que devuelve el PEM completo, y extrae
 * solo la porción Base64.
 *
 * @param cert - Objeto X509Certificate
 * @returns Certificado en Base64 limpio
 */
function extractCertBase64(cert: X509Certificate): string {
  const pem = cert.toString() // Retorna el certificado codificado en PEM
  // Extraer solo la parte Base64 del PEM
  const base64Match = pem.match(
    /-----BEGIN CERTIFICATE-----(?:\r?\n)?([\s\S]*?)(?:\r?\n)?-----END CERTIFICATE-----/
  )
  if (base64Match) {
    return base64Match[1].replace(/\s/g, '')
  }
  // Si no tiene headers PEM, devolver el contenido como Base64
  return pem.replace(/\s/g, '')
}

/**
 * Firma un documento XML usando el estándar W3C XML Digital Signature.
 *
 * Implementa una firma XML-DSIG Enveloped con:
 * - Canonicalización: Exclusive XML Canonicalization (C14N)
 * - Método de firma: RSA-SHA256
 * - Método de digest: SHA-256
 * - Transform: Enveloped Signature
 *
 * El elemento `<ds:Signature>` se inserta como hijo del elemento raíz del XML,
 * inmediatamente después de los elementos de extensión UBL (si existen).
 *
 * @param xmlContent - Contenido XML a firmar
 * @param cert       - Certificado X.509 del emisor
 * @param key        - Llave privada para firmar
 * @returns Resultado de la firma con XML firmado, valor de firma y datos del certificado
 * @throws Error si la llave privada no es compatible con RSA
 */
export function signXML(
  xmlContent: string,
  cert: X509Certificate,
  key: CryptoKeyObject
): SignXMLResult {
  // ── Validar que la llave soporta RSA ──
  if (key.asymmetricKeyType !== 'rsa') {
    throw new Error(
      `El algoritmo de la llave privada no es RSA (${key.asymmetricKeyType}). ` +
      'La DIAN requiere firmas RSA-SHA256. Verifique que el certificado use una llave RSA.'
    )
  }

  // ── Normalizar el XML de entrada ──
  const normalizedXml = normalizeEntities(xmlContent)

  // ── Generar ID de referencia ──
  const referenceUri = generateReferenceId()

  // ── Extraer certificado en Base64 ──
  const certificateBase64 = extractCertBase64(cert)

  // ── Paso 1: Calcular digest del documento original ──
  //    En una firma enveloped, el digest se calcula sobre el XML canónico
  //    del documento SIN el elemento Signature.
  const canonicalOriginal = exclusiveCanonicalize(normalizedXml)
  const documentDigest = createHash('sha256')
    .update(canonicalOriginal, 'utf-8')
    .digest('base64')

  // ── Paso 2: Construir SignedInfo ──
  const signedInfoXml = [
    `<${DS_PREFIX}:SignedInfo xmlns:${DS_PREFIX}="${DS_NS}">`,
    `  <${DS_PREFIX}:CanonicalizationMethod Algorithm="${XMLDSIG_ALGORITHMS.CANONICALIZATION}"/>`,
    `  <${DS_PREFIX}:SignatureMethod Algorithm="${XMLDSIG_ALGORITHMS.SIGNATURE_RSA_SHA256}"/>`,
    `  <${DS_PREFIX}:Reference URI="${referenceUri}">`,
    `    <${DS_PREFIX}:Transforms>`,
    `      <${DS_PREFIX}:Transform Algorithm="${XMLDSIG_ALGORITHMS.ENVELOPED_SIGNATURE}"/>`,
    `      <${DS_PREFIX}:Transform Algorithm="${XMLDSIG_ALGORITHMS.CANONICALIZATION}"/>`,
    `    </${DS_PREFIX}:Transforms>`,
    `    <${DS_PREFIX}:DigestMethod Algorithm="${XMLDSIG_ALGORITHMS.DIGEST_SHA256}"/>`,
    `    <${DS_PREFIX}:DigestValue>${documentDigest}</${DS_PREFIX}:DigestValue>`,
    `  </${DS_PREFIX}:Reference>`,
    `</${DS_PREFIX}:SignedInfo>`,
  ].join('\n')

  // ── Paso 3: Canonicalizar el SignedInfo ──
  const canonicalSignedInfo = exclusiveCanonicalize(signedInfoXml)

  // ── Paso 4: Firmar el SignedInfo canónico con RSA-SHA256 ──
  const signer = createSign('RSA-SHA256')
  signer.update(canonicalSignedInfo, 'utf-8')
  signer.end()
  const signatureBuffer = signer.sign(key)
  const signatureValue = toBase64(signatureBuffer)

  // ── Paso 5: Construir KeyInfo ──
  const keyInfo = buildKeyInfo(certificateBase64)

  // ── Paso 6: Construir el elemento Signature completo ──
  const signatureElement = [
    `<${DS_PREFIX}:Signature xmlns:${DS_PREFIX}="${DS_NS}" Id="Signature${referenceUri}">`,
    signedInfoXml,
    `  <${DS_PREFIX}:SignatureValue>${signatureValue}</${DS_PREFIX}:SignatureValue>`,
    keyInfo,
    `</${DS_PREFIX}:Signature>`,
  ].join('\n')

  // ── Paso 7: Insertar el Signature en el XML ──
  //    Para documentos UBL/DIAN, se inserta después de UBLExtensions
  const signedXml = insertSignatureIntoXml(normalizedXml, signatureElement)

  return {
    signedXml,
    signatureValue,
    certificateBase64,
    keyInfo,
  }
}

/**
 * Inserta el elemento de firma XML en el documento.
 *
 * Estrategia de inserción:
 * 1. Si existe `</ext:UBLExtensions>`, insertar después de la etiqueta de cierre
 * 2. Si existe la declaración XML, insertar después
 * 3. En caso contrario, insertar al inicio del documento
 *
 * @param xml           - Documento XML original
 * @param signatureXml  - Elemento Signature a insertar
 * @returns XML con la firma insertada
 */
function insertSignatureIntoXml(xml: string, signatureXml: string): string {
  // Intentar insertar después de </ext:UBLExtensions> (ubicación estándar DIAN)
  const ublExtensionsClose = xml.indexOf('</ext:UBLExtensions>')
  if (ublExtensionsClose !== -1) {
    const insertPos = ublExtensionsClose + '</ext:UBLExtensions>'.length
    return xml.slice(0, insertPos) + '\n' + signatureXml + '\n' + xml.slice(insertPos)
  }

  // Intentar insertar después de </cbc:Note> si existe
  const noteClose = xml.indexOf('</cbc:Note>')
  if (noteClose !== -1) {
    const insertPos = noteClose + '</cbc:Note>'.length
    return xml.slice(0, insertPos) + '\n' + signatureXml + '\n' + xml.slice(insertPos)
  }

  // Insertar después de la declaración XML
  const xmlDeclEnd = xml.indexOf('?>')
  if (xmlDeclEnd !== -1) {
    return xml.slice(0, xmlDeclEnd + 2) + '\n' + signatureXml + '\n' + xml.slice(xmlDeclEnd + 2)
  }

  // Insertar después de la etiqueta raíz de apertura
  const rootTagMatch = xml.match(/^<([^>\s]+)([^>]*)>/)
  if (rootTagMatch) {
    const insertPos = rootTagMatch[0].length
    return xml.slice(0, insertPos) + '\n' + signatureXml + '\n' + xml.slice(insertPos)
  }

  // Último recurso: anteponer
  return signatureXml + '\n' + xml
}

// ─── Validación del certificado ────────────────────────────────────────────

/**
 * Resultado de la validación del certificado.
 */
export interface CertificateValidation {
  /** Indica si el certificado es válido para firmar */
  valid: boolean
  /** Mensaje de error si no es válido */
  error?: string
  /** Información del certificado si se pudo cargar */
  info?: CertificateInfo
}

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

  // ── Si es .p12, indicar que debe convertirse a PEM ──
  if (isP12) {
    return {
      valid: false,
      error:
        'El certificado proporcionado es formato .p12 (PKCS#12) el cual no es soportado ' +
        'directamente en este entorno. Conviértalo a formato PEM con:\n\n' +
        '  openssl pkcs12 -in cert.p12 -nocerts -out key.pem\n' +
        '  openssl pkcs12 -in cert.p12 -clcerts -nokeys -out cert.pem\n\n' +
        'Luego configure DIAN_CERT_PATH y DIAN_KEY_PATH con las rutas resultantes.',
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
 * Firma un XML para envío a la DIAN usando la configuración del entorno.
 *
 * Lee automáticamente las variables de entorno para determinar el formato
 * del certificado (.p12 o .pem) y firmar el documento.
 *
 * Variables de entorno requeridas:
 * - `DIAN_CERT_PATH`: Ruta al certificado PEM (.pem / .crt)
 * - `DIAN_KEY_PATH`: Ruta a la llave privada PEM (.key / .pem)
 *
 * Variables de entorno opcionales:
 * - `DIAN_P12_PATH`: Ruta al certificado PKCS#12 (lanza error con instrucciones)
 * - `DIAN_CERT_PASSWORD`: Contraseña del .p12 (si aplica)
 *
 * @param xmlContent - XML UBL 2.1 a firmar
 * @returns Resultado de la firma XML
 * @throws Error si la configuración es incompleta o el certificado es inválido
 */
export async function signXMLForDIAN(xmlContent: string): Promise<SignXMLResult> {
  // ── Determinar rutas del certificado ──
  const certPath = process.env.DIAN_CERT_PATH || null
  const keyPath = process.env.DIAN_KEY_PATH || null
  const password = process.env.DIAN_CERT_PASSWORD || ''

  // ── Verificar que hay configuración ──
  if (!certPath) {
    throw new Error(
      'No se encontró configuración de certificado. ' +
      'Configure las variables de entorno DIAN_CERT_PATH (PEM) y DIAN_KEY_PATH (llave privada). ' +
      'Si tiene un certificado .p12, conviértalo a PEM con:\n\n' +
      '  openssl pkcs12 -in cert.p12 -nocerts -out key.pem\n' +
      '  openssl pkcs12 -in cert.p12 -clcerts -nokeys -out cert.pem'
    )
  }

  if (!keyPath) {
    throw new Error(
      'No se encontró la ruta de la llave privada. ' +
      'Configure la variable de entorno DIAN_KEY_PATH con la ruta al archivo .key o .pem.'
    )
  }

  // ── Auto-detectar formato ──
  const isP12 = certPath.toLowerCase().endsWith('.p12') || certPath.toLowerCase().endsWith('.pfx')

  if (isP12) {
    throw new Error(
      'El certificado configurado (DIAN_CERT_PATH) es formato .p12 (PKCS#12) ' +
      'el cual no es soportado directamente. Conviértalo a formato PEM:\n\n' +
      '  openssl pkcs12 -in cert.p12 -nocerts -out key.pem\n' +
      '  openssl pkcs12 -in cert.p12 -clcerts -nokeys -out cert.pem\n\n' +
      'Luego actualice las variables de entorno:\n' +
      '  DIAN_CERT_PATH=/ruta/al/cert.pem\n' +
      '  DIAN_KEY_PATH=/ruta/al/key.pem'
    )
  }

  // ── Cargar certificado PEM ──
  let cert: X509Certificate
  let key: CryptoKeyObject

  try {
    const loaded = loadFromPEM(certPath, keyPath)
    cert = loaded.cert
    key = loaded.key
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Error al cargar el certificado: ${error.message}`)
    }
    throw new Error('Error desconocido al cargar el certificado.')
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
  return signXML(xmlContent, cert, key)
}
