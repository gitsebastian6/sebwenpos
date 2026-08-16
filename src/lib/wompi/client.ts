// ---------------------------------------------------------------------------
// Sebwen POS — Wompi Payment Gateway Client (Demo + Real)
// ---------------------------------------------------------------------------
// Supports three modes via WOMPI_ENV:
//   - "demo"       → Simulates Wompi API (no keys needed, auto-approves)
//   - "sandbox"    → Wompi sandbox API (test keys required)
//   - "production" → Wompi production API (real keys required)
//
// The demo mode uses the Strategy pattern:
//   - All business logic (validations, DB writes) is IDENTICAL
//   - Only the external API call is replaced with a mock response
//   - Switching to production = change WOMPI_ENV, no code changes
// ---------------------------------------------------------------------------

import { logger } from '@/lib/logger'
import { createHmac } from 'crypto'

// ── Configuration ──

const BASE_URLS = {
  sandbox: 'https://sandbox.wompi.co/v1',
  production: 'https://production.wompi.co/v1',
} as const

type WompiEnv = 'demo' | 'sandbox' | 'production'

function getWompiEnvValue(): WompiEnv {
  const env = (process.env.WOMPI_ENV || 'demo') as WompiEnv
  if (env === 'demo' || env === 'sandbox' || env === 'production') return env
  return 'demo'
}

function isDemoMode(): boolean {
  return getWompiEnvValue() === 'demo'
}

function getBaseUrl(): string {
  const env = getWompiEnvValue()
  if (env === 'demo') return 'https://demo.wompi.local/v1' // never actually called
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

// ── API Client (Real Wompi) ──

/**
 * Make an authenticated request to the Wompi API.
 * Only called when WOMPI_ENV is 'sandbox' or 'production'.
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

// ── Demo Mode Helpers ──

/** Generate a unique demo ID */
function demoId(): number {
  return Math.floor(Math.random() * 9000000) + 1000000
}

/** Demo auto-approval delay in milliseconds (10 seconds) */
const DEMO_APPROVAL_DELAY_MS = 10_000

/**
 * Create a mock payment link for demo mode.
 * Returns a simulated Wompi payment link with a demo checkout URL.
 */
function createDemoPaymentLink(params: CreatePaymentLinkParams): WompiPaymentLink {
  const id = demoId()
  const now = new Date()

  logger.info(`[Wompi Demo] Created demo payment link: ${id} — ref: ${params.reference}`)

  return {
    id,
    createdAt: now.toISOString(),
    name: params.name,
    description: params.description,
    amountInCents: params.amountInCents,
    currency: params.currency || 'COP',
    status: 'ACTIVE',
    singleUse: params.singleUse !== undefined ? params.singleUse : true,
    checkoutUrl: `#demo-checkout-${id}`,
    reference: params.reference,
    expiresAt: params.expiresAt,
  }
}

/**
 * Create a mock transaction for demo mode.
 * Initially PENDING — will auto-approve after DEMO_APPROVAL_DELAY_MS.
 */
function createDemoTransaction(reference: string, amountInCents: number): WompiTransaction {
  const id = demoId()
  return {
    id,
    createdAt: new Date().toISOString(),
    amountInCents,
    reference,
    currency: 'COP',
    status: 'PENDING',
    paymentMethodType: 'CARD',
    paymentMethod: {
      type: 'CARD',
      extra: { brand: 'VISA', last_four: '4242' },
    },
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
 * In demo mode, returns a simulated payment link.
 * In sandbox/production, calls the real Wompi API.
 */
export async function createPaymentLink(
  params: CreatePaymentLinkParams,
): Promise<WompiPaymentLink> {
  // ── Demo Mode ──
  if (isDemoMode()) {
    return createDemoPaymentLink(params)
  }

  // ── Real Wompi API ──
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
 * Get transaction details.
 * In demo mode, simulates status transitions (PENDING → APPROVED after delay).
 */
export async function getTransaction(
  transactionId: number | string,
): Promise<WompiTransaction> {
  // ── Demo Mode ──
  if (isDemoMode()) {
    // Demo transactions auto-approve after DEMO_APPROVAL_DELAY_MS
    // The status/[id] route handles the actual logic of checking timing
    // Here we just return a basic transaction — the route will determine status
    return {
      id: Number(transactionId),
      createdAt: new Date().toISOString(),
      amountInCents: 0,
      reference: `demo-${transactionId}`,
      currency: 'COP',
      status: 'PENDING',
      paymentMethodType: 'CARD',
      paymentMethod: null,
    }
  }

  // ── Real Wompi API ──
  const response = await wompiRequest<WompiTransactionResponse>(
    'GET',
    `/transactions/${transactionId}`,
  )

  return response.data
}

/**
 * Void (cancel) a Wompi transaction before it's settled.
 */
export async function voidTransaction(transactionId: number | string): Promise<WompiTransaction> {
  // ── Demo Mode ──
  if (isDemoMode()) {
    logger.info(`[Wompi Demo] Transaction ${transactionId} voided`)
    return {
      id: Number(transactionId),
      createdAt: new Date().toISOString(),
      amountInCents: 0,
      reference: `demo-${transactionId}`,
      currency: 'COP',
      status: 'VOIDED',
      paymentMethodType: 'CARD',
      paymentMethod: null,
    }
  }

  // ── Real Wompi API ──
  const response = await wompiRequest<WompiTransactionResponse>(
    'POST',
    `/transactions/${transactionId}/void`,
  )
  logger.info(`[Wompi] Transaction ${transactionId} voided`)
  return response.data
}

/**
 * Verify a Wompi webhook signature using HMAC-SHA256.
 * In demo mode, always returns true (no real webhooks).
 */
export function verifyWebhookSignature(
  payload: WompiWebhookEvent,
  checksum: string,
  timestamp: number,
): boolean {
  // ── Demo Mode: skip signature verification ──
  if (isDemoMode()) {
    logger.debug('[Wompi Demo] Skipping webhook signature verification')
    return true
  }

  try {
    const secret = getWebhookSecret()

    const signatureProperties = payload.signature?.properties || [
      'transaction.id',
      'transaction.status',
      'transaction.amount_in_cents',
      'transaction.reference',
    ]

    const values: string[] = []
    for (const prop of signatureProperties) {
      const value = getNestedValue(payload as unknown as Record<string, unknown>, prop)
      if (value !== undefined && value !== null) {
        values.push(String(value))
      }
    }

    values.push(String(timestamp))

    const message = values.join('')

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
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
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

// ── Environment & Config Helpers ──

/**
 * Get the current Wompi environment (demo/sandbox/production).
 */
export function getWompiEnv(): string {
  return getWompiEnvValue()
}

/**
 * Check if Wompi is in demo mode.
 */
export function isWompiDemoMode(): boolean {
  return isDemoMode()
}

/**
 * Get the Wompi public key (for server-side use).
 */
export function getWompiPublicKey(): string {
  if (isDemoMode()) return 'demo_public_key'
  return getPublicKey()
}

/**
 * Get the Wompi public key for browser use (NEXT_PUBLIC_ prefix).
 */
export function getWompiBrowserPublicKey(): string {
  return process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY || process.env.WOMPI_PUBLIC_KEY || ''
}

/**
 * Check if Wompi is configured and ready to use.
 * In demo mode, always returns configured=true (no keys needed).
 * In sandbox/production, checks that API keys are set and not placeholders.
 */
export function isWompiConfigured(): { configured: boolean; missingKeys: string[]; mode: string } {
  // ── Demo Mode: always configured ──
  if (isDemoMode()) {
    return { configured: true, missingKeys: [], mode: 'demo' }
  }

  // ── Real Mode: check keys ──
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

  return {
    configured: missingKeys.length === 0,
    missingKeys,
    mode: getWompiEnvValue(),
  }
}

/**
 * Get the Wompi redirect URL (where Wompi sends the user after payment).
 * Falls back to NEXT_PUBLIC_APP_URL if WOMPI_REDIRECT_URL is not set.
 */
export function getWompiRedirectUrl(): string {
  return process.env.WOMPI_REDIRECT_URL || process.env.NEXT_PUBLIC_APP_URL || ''
}

/**
 * Get the demo auto-approval delay in seconds.
 */
export function getDemoApprovalDelay(): number {
  return DEMO_APPROVAL_DELAY_MS / 1000
}

/**
 * Check if a demo transaction should be auto-approved based on creation time.
 * Returns the simulated WompiTransaction with appropriate status.
 */
export function getDemoTransactionStatus(
  createdAt: Date,
  amount: number,
  reference: string,
): { status: string; wompiStatus: string; paymentMethodType: string } {
  const elapsed = Date.now() - new Date(createdAt).getTime()

  if (elapsed >= DEMO_APPROVAL_DELAY_MS) {
    return {
      status: 'APPROVED',
      wompiStatus: 'APPROVED',
      paymentMethodType: 'CARD',
    }
  }

  return {
    status: 'PENDING',
    wompiStatus: 'PENDING',
    paymentMethodType: 'CARD',
  }
}
