// ---------------------------------------------------------------------------
// Ventify POS — Environment Variable Validation
// ---------------------------------------------------------------------------
// Centralized access to environment variables with type-safe, fail-fast
// validation.  Secrets that are missing in production will crash the server
// at startup rather than silently weakening security.
// ---------------------------------------------------------------------------

const isDev = process.env.NODE_ENV === 'development'

/**
 * Require an environment variable. Throws at startup if missing.
 * In development mode, logs a warning instead of crashing so the app
 * can still boot for local testing (but the warning is very visible).
 */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (value && value.trim().length > 0) return value.trim()

  const msg = `[ENV] FATAL: Environment variable ${name} is required but not set. ` +
    `Add it to your .env file. See .env.example for reference.`

  if (isDev) {
    console.warn(`\n${msg}\n[ENV] Running in development mode — using empty string as fallback. FIX THIS BEFORE PRODUCTION.\n`)
    return ''
  }

  throw new Error(msg)
}

/**
 * Get an env var with a safe default. Use ONLY for non-sensitive values
 * where a default makes sense (ports, feature flags, etc.).
 * Never use this for secrets, URLs, or credentials.
 */
export function envOrDefault(name: string, defaultValue: string): string {
  const value = process.env[name]
  if (value && value.trim().length > 0) return value.trim()
  return defaultValue
}

/**
 * Get an env var as a number with a safe default.
 */
export function envOrDefaultInt(name: string, defaultValue: number): number {
  const raw = process.env[name]
  if (!raw || raw.trim().length === 0) return defaultValue
  const parsed = parseInt(raw, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

/**
 * Get an env var as a boolean. Defaults to false if not set.
 */
export function envOrDefaultBool(name: string, defaultValue: boolean = false): boolean {
  const raw = process.env[name]
  if (!raw || raw.trim().length === 0) return defaultValue
  return raw.trim().toLowerCase() === 'true'
}

// ---------------------------------------------------------------------------
// Pre-validated environment variables (resolved once at module load)
// ---------------------------------------------------------------------------

/** HMAC signing key for all auth tokens — REQUIRED in production */
export const AUTH_SECRET = requireEnv('AUTH_SECRET')

/** Secret for internal API-to-API auth (cron, webhooks) — REQUIRED in production */
export const INTERNAL_SECRET = requireEnv('INTERNAL_SECRET')

/** Public URL of the app (used for DIAN, QR, email links) — REQUIRED in production */
export const APP_URL = requireEnv('NEXT_PUBLIC_APP_URL')

/** SMTP sender email — REQUIRED when sending invoices by email */
export const SMTP_FROM = requireEnv('SMTP_FROM')

/** SMTP sender display name */
export const SMTP_FROM_NAME = envOrDefault('SMTP_FROM_NAME', 'Facturación')

/** SMTP port — standard 587 default */
export const SMTP_PORT = envOrDefaultInt('SMTP_PORT', 587)

/** SMTP use TLS — defaults to false (STARTTLS on 587) */
export const SMTP_SECURE = envOrDefaultBool('SMTP_SECURE', false)

/** Cron service alert API base URL */
export const ALERT_API_BASE = requireEnv('ALERT_API_BASE')

/** Cron service port */
export const CRON_PORT = envOrDefaultInt('CRON_PORT', 3010)
