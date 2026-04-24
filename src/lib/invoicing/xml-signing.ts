// ─── XML Digital Signature (XML-DSIG) ─────────────────────────────────────────
// W3C XML-DSIG signing implementation for DIAN electronic invoicing

import { createHash, createSign, randomUUID } from 'node:crypto'
import type { X509Certificate } from 'node:crypto'
import type { SignXMLResult, CryptoKeyObject } from './certificate-types'
import { exclusiveCanonicalize, normalizeEntities, toBase64 } from './xml-canonicalization'

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * URIs de algoritmos XML-DSIG estándar W3C.
 */
export const XMLDSIG_ALGORITHMS = {
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
export const DS_NS = 'http://www.w3.org/2000/09/xmldsig#'
export const DS_PREFIX = 'ds'

// ─── Helpers ──────────────────────────────────────────────────────────────

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

// ─── Main Signing Function ────────────────────────────────────────────────

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
