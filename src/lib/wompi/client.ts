// ---------------------------------------------------------------------------
// Ventify POS — Wompi Payment Gateway Client
// ---------------------------------------------------------------------------
// Wraps the Wompi REST API (sandbox + production) for:
//   - Creating payment links (for subscription/POS payments)
//   - Querying transaction status
//   - Verifying webhook signatures (HMAC-SHA256)
//
// Wompi API Docs: https://docs.wompi.co/
// Environment vars: WOMPI_PRIVATE_KEY, WOMPI_PUBLIC_KEY, WOMPI_WEBHOOK_SECRET, WOMPI_ENV
// ---------------------------------------------------------------------------

import { logger } from '@/lib/logger'
import { createHmac } from 'crypto'

// ── Configuration ──

const BASE_URLS = {
  sandbox: 'https://sandbox.wompi.co/v1',
  production: 'https://production.wompi.co/v1',
} as const

type WompiEnv = keyof typeof BASE_URLS

function getBaseUrl(): string {
  const env = (process.env.WOMPI_ENV || 'sandbox') as WompiEnv
  return BASE_URLS[env] || BASE_URLS.sandbox
}

function getPrivateKey(): string {
  const key = process.env.WOMPI_PRIVATE_KEY
  if (!key) {
    throw new Error('[Wompi] WOMPI_PRIVATE_KEY is not set in environment variables')
  }
  return key
}

function getPublicKey(): string {
  const key = process.env.WOMPI_PUBLIC_KEY
  if (!key) {
    throw new Error('[Wompi] WOMPI_PUBLIC_KEY is not set in environment variables')
  }
  return key
}

function getWebhookSecret(): string {
  const secret = process.env.WOMPI_WEBHOOK_SECRET
  if (!secret) {
    throw new Error('[Wompi] WOMPI_WEBHOOK_SECRET is not set in environment variables')
  }
  return secret
}

// ── Types ──

export interface WompiPaymentMethod {
  type: string          // CARD, NEQUI, DAVIPLATA, PSE, BANCOLOMBIA
  icon?: string
  extra?: Record<string, unknown>
}

export interface WompiTransaction {
  id: number
  createdAt: string
  amountInCents: number
  reference: string
  currency: string
  status: string         // PENDING, APPROVED, DECLINED, VOIDED, ERROR
  paymentMethodType: string
  paymentMethod: WompiPaymentMethod | null
  customerEmail?: string
  customerName?: string
  customerPhone?: string
  customerDocument?: string
  receiptUrl?: string
  paymentLinkId?: number
  finalizedAt?: string
}

export interface WompiPaymentLink {
  id: number
  createdAt: string
  name: string
  description: string
  amountInCents: number
  currency: string
  status: string
  singleUse: boolean
  checkoutUrl: string
  reference: string
  expiresAt?: string
}

export interface WompiWebhookEvent {
  event: string
  data: {
    transaction?: WompiTransaction
    payment_link?: WompiPaymentLink
  }
  timestamp: number
  signature?: {
    checksum: string
    properties: string[]
  }
}

export interface CreatePaymentLinkParams {
  name: string
  description: string
  amountInCents: number
  currency?: string
  reference: string
  singleUse?: boolean
  expiresAt?: string        // ISO 8601
  redirectUrl?: string
  customerEmail?: string
  customerName?: string
  customerPhone?: string
  customerDocument?: string
}

// ── API Client ──

/**
 * Make an authenticated request to the Wompi API.
 */
async function wompiRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${getBaseUrl()}${path}`
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${getPrivateKey()}`,
    'Content-Type': 'application/json',
  }

  const options: RequestInit = {
    method,
    headers,
  }

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body)
  }

  logger.debug(`[Wompi] ${method} ${path}`)

  try {
    const response = await fetch(url, options)
    const data = await response.json()

    if (!response.ok) {
      logger.error(`[Wompi] API error ${response.status}:`, data)
      throw new WompiApiError(
        data?.error?.messages?.join(', ') || `Wompi API error: ${response.status}`,
        response.status,
        data,
      )
    }

    return data as T
  } catch (error) {
    if (error instanceof WompiApiError) throw error
    logger.error('[Wompi] Request failed:', error)
    throw new Error(`[Wompi] Network error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// ── Custom Error ──

export class WompiApiError extends Error {
  statusCode: number
  details: unknown

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message)
    this.name = 'WompiApiError'
    this.statusCode = statusCode
    this.details = details
  }
}

// ── Public Methods ──

interface WompiPaymentLinkResponse {
  data: WompiPaymentLink
  meta?: Record<string, unknown>
}

interface WompiTransactionResponse {
  data: WompiTransaction
  meta?: Record<string, unknown>
}

/**
 * Create a payment link for subscription or POS payments.
 * Wompi docs: POST /payment_links
 */
export async function createPaymentLink(
  params: CreatePaymentLinkParams,
): Promise<WompiPaymentLink> {
  const payload: Record<string, unknown> = {
    name: params.name,
    description: params.description,
    amount_in_cents: params.amountInCents,
    currency: params.currency || 'COP',
    reference: params.reference,
    single_use: params.singleUse !== undefined ? params.singleUse : true,
    ...(params.expiresAt && { expires_at: params.expiresAt }),
    ...(params.redirectUrl && { redirect_url: params.redirectUrl }),
    ...(params.customerEmail && { customer_email: params.customerEmail }),
    ...(params.customerName && { customer_name: params.customerName }),
    ...(params.customerPhone && { customer_phone: params.customerPhone }),
    ...(params.customerDocument && { customer_document: params.customerDocument }),
  }

  const response = await wompiRequest<WompiPaymentLinkResponse>(
    'POST',
    '/payment_links',
    payload,
  )

  logger.info(`[Wompi] Payment link created: ${response.data.id} — ${response.data.checkoutUrl}`)
  return response.data
}

/**
 * Get transaction details from Wompi.
 * Wompi docs: GET /transactions/{id}
 */
export async function getTransaction(
  transactionId: number | string,
): Promise<WompiTransaction> {
  const response = await wompiRequest<WompiTransactionResponse>(
    'GET',
    `/transactions/${transactionId}`,
  )

  return response.data
}

/**
 * Void (cancel) a Wompi transaction before it's settled.
 * Wompi docs: POST /transactions/{id}/void
 */
export async function voidTransaction(transactionId: number | string): Promise<WompiTransaction> {
  const response = await wompiRequest<WompiTransactionResponse>(
    'POST',
    `/transactions/${transactionId}/void`,
  )
  logger.info(`[Wompi] Transaction ${transactionId} voided`)
  return response.data
}

/**
 * Verify a Wompi webhook signature using HMAC-SHA256.
 *
 * Wompi sends a checksum in the `signature.checksum` field of the webhook payload.
 * The checksum is computed as HMAC-SHA256 of the event properties listed in
 * `signature.properties`, concatenated with the event timestamp.
 *
 * Verification steps:
 * 1. Extract the property values from the event data in the order specified by signature.properties
 * 2. Concatenate them with the timestamp
 * 3. Compute HMAC-SHA256 using the webhook secret
 * 4. Compare with the provided checksum
 */
export function verifyWebhookSignature(
  payload: WompiWebhookEvent,
  checksum: string,
  timestamp: number,
): boolean {
  try {
    const secret = getWebhookSecret()

    // Build the string to sign from the event properties
    // Wompi verification: concatenate transaction properties + timestamp
    // The signature properties define which fields are included in the checksum
    const signatureProperties = payload.signature?.properties || [
      'transaction.id',
      'transaction.status',
      'transaction.amount_in_cents',
      'transaction.reference',
    ]

    // Extract values from the payload based on the property paths
    const values: string[] = []
    for (const prop of signatureProperties) {
      const value = getNestedValue(payload as unknown as Record<string, unknown>, prop)
      if (value !== undefined && value !== null) {
        values.push(String(value))
      }
    }

    // Append the timestamp
    values.push(String(timestamp))

    // Concatenate all values
    const message = values.join('')

    // Compute HMAC-SHA256
    const hmac = createHmac('sha256', secret)
    hmac.update(message)
    const computed = hmac.digest('hex')

    // Constant-time comparison
    if (computed.length !== checksum.length) return false
    const computedBuf = Buffer.from(computed, 'hex')
    const checksumBuf = Buffer.from(checksum, 'hex')
    if (computedBuf.length !== checksumBuf.length) return false

    let result = 0
    for (let i = 0; i < computedBuf.length; i++) {
      result |= computedBuf[i] ^ checksumBuf[i]
    }
    return result === 0
  } catch (error) {
    logger.error('[Wompi] Webhook signature verification failed:', error)
    return false
  }
}

/**
 * Extract a nested value from an object using dot notation path.
 * e.g., getNestedValue(obj, 'transaction.id') → obj.data.transaction.id
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  // Wompi properties are relative to event.data
  const fullPath = `data.${path}`
  const keys = fullPath.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current === null || current === undefined) return undefined
    if (typeof current === 'object' && current !== null) {
      current = (current as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }
  return current
}

/**
 * Get the current Wompi environment (sandbox/production).
 */
export function getWompiEnv(): string {
  return process.env.WOMPI_ENV || 'sandbox'
}

/**
 * Get the Wompi public key (for frontend use).
 */
export function getWompiPublicKey(): string {
  return getPublicKey()
}

/**
 * Get the Wompi public key for browser use (NEXT_PUBLIC_ prefix).
 * Falls back to the server-side WOMPI_PUBLIC_KEY if NEXT_PUBLIC_ version is not set.
 */
export function getWompiBrowserPublicKey(): string {
  return process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY || process.env.WOMPI_PUBLIC_KEY || ''
}

/**
 * Check if Wompi API keys are configured (not placeholder values).
 * Returns { configured: boolean, missingKeys: string[] }
 */
export function isWompiConfigured(): { configured: boolean; missingKeys: string[] } {
  const missingKeys: string[] = []
  const placeholderPatterns = ['xxxxxxxxxxxxx', 'test_xxx', 'xxx', 'your_', 'replace_', 'changeme']

  const privateKey = process.env.WOMPI_PRIVATE_KEY || ''
  const publicKey = process.env.WOMPI_PUBLIC_KEY || ''

  if (!privateKey || placeholderPatterns.some(p => privateKey.includes(p))) {
    missingKeys.push('WOMPI_PRIVATE_KEY')
  }
  if (!publicKey || placeholderPatterns.some(p => publicKey.includes(p))) {
    missingKeys.push('WOMPI_PUBLIC_KEY')
  }

  return { configured: missingKeys.length === 0, missingKeys }
}
