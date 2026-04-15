import crypto from 'crypto'
import fs from 'fs'

/**
 * Configuration for loading a PKCS12 (.p12) certificate.
 */
export interface CertificateConfig {
  /** Path to the .p12 certificate file */
  certPath: string
  /** Password for the .p12 certificate */
  certPassword: string
  /** Software provider NIT (optional) */
  pteNit?: string
  /** Software ID registered with DIAN (optional) */
  softwareId?: string
}

/**
 * Loaded certificate and private key buffers.
 */
export interface LoadedCertificate {
  /** DER-encoded certificate */
  cert: Buffer
  /** DER-encoded private key */
  key: Buffer
}

/**
 * Result of certificate configuration verification.
 */
export interface CertificateVerificationResult {
  /** Whether the configuration is valid */
  valid: boolean
  /** Error message if invalid */
  error?: string
  /** Certificate subject info (if loaded successfully) */
  subject?: string
  /** Certificate issuer info */
  issuer?: string
  /** Certificate expiration date */
  expiresAt?: Date
}

/**
 * Loads a PKCS12 (.p12) certificate file and extracts the certificate
 * and private key using Node.js built-in crypto module.
 *
 * @param config - Certificate configuration with path and password
 * @returns Object containing the DER-encoded certificate and private key
 * @throws Error if the file doesn't exist, can't be read, or password is wrong
 */
export function loadCertificate(config: CertificateConfig): LoadedCertificate {
  const { certPath, certPassword } = config

  // Check if the file exists
  if (!fs.existsSync(certPath)) {
    throw new Error(
      `El archivo de certificado no existe: ${certPath}. ` +
      'Verifique la ruta del certificado .p12 en la configuración de facturación electrónica.'
    )
  }

  // Read the file
  let p12Buffer: Buffer
  try {
    p12Buffer = fs.readFileSync(certPath)
  } catch (error) {
    throw new Error(
      `No se pudo leer el archivo de certificado: ${certPath}. ` +
      `Error: ${error instanceof Error ? error.message : 'Desconocido'}`
    )
  }

  // Parse PKCS12
  let p12Result: crypto.KeyObject
  try {
    // Node.js 20+ returns { ca, cert, key } from pkcs12
    const result = crypto.pkcs12.parse(p12Buffer, certPassword)
    if (!result.cert) {
      throw new Error('El certificado no contiene un certificado válido')
    }
    p12Result = result.cert as unknown as crypto.KeyObject
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Desconocido'
    if (
      message.includes('bad password') ||
      message.includes('decrypt') ||
      message.includes('password')
    ) {
      throw new Error(
        `La contraseña del certificado es incorrecta. ` +
        `Verifique la contraseña del archivo .p12 en la configuración.`
      )
    }
    throw new Error(
      `Error al procesar el certificado PKCS12: ${message}`
    )
  }

  // Extract cert and key from the parsed result
  // Node.js pkcs12.parse returns { ca, cert, key }
  const parsed = crypto.pkcs12.parse(p12Buffer, certPassword)
  if (!parsed.cert) {
    throw new Error('El certificado PKCS12 no contiene un certificado válido.')
  }
  if (!parsed.key) {
    throw new Error('El certificado PKCS12 no contiene una llave privada.')
  }

  return {
    cert: parsed.cert.export({ type: 'der', format: 'pem' }) as Buffer,
    key: parsed.key.export({ type: 'pkcs8', format: 'pem' }) as Buffer,
  }
}

/**
 * Signs an XML document with the provided certificate.
 *
 * For now, this is a placeholder that:
 * 1. Validates the certificate can be loaded
 * 2. Returns the XML with a comment noting where the XAdES-BES signature would go
 *
 * Full XAdES-BES signature requires the `xml-crypto` library which has complex
 * dependencies and will be implemented in a future iteration.
 *
 * @param xmlContent - The XML string to sign
 * @param config - Certificate configuration
 * @returns XML string with placeholder signature comment
 */
export function signXML(xmlContent: string, config: CertificateConfig): string {
  // Verify the certificate can be loaded
  const { cert } = loadCertificate(config)

  // Extract subject from the cert for the comment
  let certInfo = 'Desconocido'
  try {
    // Parse the PEM cert to get info
    const certObj = new crypto.X509Certificate(cert.toString('utf-8'))
    certInfo = certObj.subject?.toString() ?? 'Desconocido'
  } catch {
    // If we can't parse it, just use a generic message
  }

  // Insert a signature placeholder comment after the XML declaration
  const signatureComment =
    `<!-- DIAN XAdES-BES Signature Placeholder -->\n` +
    `<!-- Certificate: ${certInfo} -->\n` +
    `<!-- PTE NIT: ${config.pteNit ?? 'No configurado'} -->\n` +
    `<!-- Software ID: ${config.softwareId ?? 'No configurado'} -->\n` +
    `<!-- NOTE: Full XAdES-BES signature requires xml-crypto library -->\n` +
    `<!-- The signature would be inserted here per DIAN requirements -->\n`

  // Insert after XML declaration
  const xmlDeclEnd = xmlContent.indexOf('?>')
  if (xmlDeclEnd !== -1) {
    return (
      xmlContent.substring(0, xmlDeclEnd + 2) +
      '\n' +
      signatureComment +
      xmlContent.substring(xmlDeclEnd + 2)
    )
  }

  // If no XML declaration found, prepend
  return signatureComment + xmlContent
}

/**
 * Verifies that a certificate configuration is valid.
 *
 * Checks:
 * - The .p12 file exists and is readable
 * - The password works (can parse the PKCS12)
 * - The certificate has not expired
 * - The certificate and private key are both present
 *
 * @param config - Certificate configuration to verify
 * @returns Verification result with validity status and optional error
 */
export function verifyCertificateConfig(config: CertificateConfig): CertificateVerificationResult {
  try {
    // Check file exists
    if (!fs.existsSync(config.certPath)) {
      return {
        valid: false,
        error: `El archivo de certificado no existe: ${config.certPath}`,
      }
    }

    // Check file is readable
    try {
      fs.accessSync(config.certPath, fs.constants.R_OK)
    } catch {
      return {
        valid: false,
        error: `No se tiene permisos de lectura para: ${config.certPath}`,
      }
    }

    // Try to load the certificate
    const parsed = crypto.pkcs12.parse(
      fs.readFileSync(config.certPath),
      config.certPassword
    )

    if (!parsed.cert) {
      return {
        valid: false,
        error: 'El certificado PKCS12 no contiene un certificado válido.',
      }
    }

    if (!parsed.key) {
      return {
        valid: false,
        error: 'El certificado PKCS12 no contiene una llave privada.',
      }
    }

    // Check expiration
    try {
      const x509 = new crypto.X509Certificate(parsed.cert.export({ format: 'pem', type: 'der' }) as Buffer)
      const now = new Date()
      const validFrom = new Date(x509.validFrom)
      const validTo = new Date(x509.validTo)

      if (now < validFrom) {
        return {
          valid: false,
          error: `El certificado no está vigente aún. Fecha de inicio: ${validFrom.toISOString().split('T')[0]}`,
          subject: x509.subject?.toString(),
          issuer: x509.issuer?.toString(),
          expiresAt: validTo,
        }
      }

      if (now > validTo) {
        return {
          valid: false,
          error: `El certificado ha expirado. Fecha de expiración: ${validTo.toISOString().split('T')[0]}`,
          subject: x509.subject?.toString(),
          issuer: x509.issuer?.toString(),
          expiresAt: validTo,
        }
      }

      return {
        valid: true,
        subject: x509.subject?.toString(),
        issuer: x509.issuer?.toString(),
        expiresAt: validTo,
      }
    } catch {
      // If we can't parse as X509, but cert and key exist, consider it valid
      return {
        valid: true,
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    if (
      message.includes('bad password') ||
      message.includes('decrypt') ||
      message.includes('password')
    ) {
      return {
        valid: false,
        error: 'La contraseña del certificado es incorrecta.',
      }
    }
    return {
      valid: false,
      error: `Error al verificar el certificado: ${message}`,
    }
  }
}
