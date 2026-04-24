// ─── Certificate Types ────────────────────────────────────────────────────────
// All interfaces and types for the invoicing certificate module

import type { X509Certificate } from 'node:crypto'
import type { createPrivateKey } from 'node:crypto'

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
 * Resultado de la carga de un certificado y su llave privada.
 */
export interface LoadedKeyPair {
  cert: X509Certificate
  key: CryptoKeyObject
}

/** Re-exportar tipo KeyObject de crypto */
export type CryptoKeyObject = ReturnType<typeof createPrivateKey>
