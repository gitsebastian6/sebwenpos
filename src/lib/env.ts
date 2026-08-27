// ---------------------------------------------------------------------------
// Sebwen POS — Environment Variable Validation
// ---------------------------------------------------------------------------
// Centralized access to environment variables with type-safe, fail-fast
// validation.  Secrets that are missing in production will crash the server
// at startup rather than silently weakening security.
// ---------------------------------------------------------------------------

// Check dynamically so tests can change NODE_ENV
function isDev(): boolean {
  return process.env.NODE_ENV === 'development'
}

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

  if (isDev()) {
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
// Pre-validated environment variable getters
// ---------------------------------------------------------------------------
// These are functions (not constants) so they can be called lazily,
// avoiding module-load-time crashes in test environments.

/** HMAC signing key for all auth tokens — REQUIRED in production */
export const getAuthSecret = () => requireEnv('AUTH_SECRET')

/** Secret for internal API-to-API auth (cron, webhooks) — REQUIRED in production */
export const getInternalSecret = () => requireEnv('INTERNAL_SECRET')

/** Public URL of the app (used for DIAN, QR, email links) — REQUIRED in production */
export const getAppUrl = () => requireEnv('NEXT_PUBLIC_APP_URL')

/** SMTP sender email — REQUIRED when sending invoices by email */
export const getSmtpFrom = () => requireEnv('SMTP_FROM')

/** SMTP sender display name */
export const getSmtpFromName = () => envOrDefault('SMTP_FROM_NAME', 'Facturación')

/** SMTP port — standard 587 default */
export const getSmtpPort = () => envOrDefaultInt('SMTP_PORT', 587)

/** SMTP use TLS — defaults to false (STARTTLS on 587) */
export const getSmtpSecure = () => envOrDefaultBool('SMTP_SECURE', false)

/** Cron service alert API base URL */
export const getAlertApiBase = () => requireEnv('ALERT_API_BASE')

/** Cron service port */
export const getCronPort = () => envOrDefaultInt('CRON_PORT', 3010)

// ---------------------------------------------------------------------------
// Startup validation
// ---------------------------------------------------------------------------
// Called once from instrumentation.ts register() on the Node.js runtime so a
// misconfigured production deploy fails immediately instead of 500-ing on the
// first request that happens to touch a secret.

/** Secrets the server cannot securely operate without in production. */
const REQUIRED_IN_PRODUCTION = ['AUTH_SECRET', 'INTERNAL_SECRET', 'NEXT_PUBLIC_APP_URL'] as const

/** Not fatal, but a real weakness if unset — warned about in every environment. */
const RECOMMENDED = ['ENCRYPTION_KEY'] as const

function isSet(name: string): boolean {
  const v = process.env[name]
  return !!v && v.trim().length > 0
}

/**
 * Validate the environment at boot. In production, throws (crashing the server)
 * if any REQUIRED_IN_PRODUCTION variable is missing, listing all of them at
 * once. In development, only logs warnings so local work is not blocked.
 * Idempotent and side-effect free apart from logging / throwing.
 */
export function assertRequiredEnv(): void {
  const missingRequired = REQUIRED_IN_PRODUCTION.filter((n) => !isSet(n))
  const missingRecommended = RECOMMENDED.filter((n) => !isSet(n))

  if (missingRecommended.length > 0) {
    console.warn(
      `[ENV] Recommended variable(s) not set: ${missingRecommended.join(', ')}. ` +
        `ENCRYPTION_KEY falls back to AUTH_SECRET — set a distinct value in production.`,
    )
  }

  if (missingRequired.length === 0) return

  const msg =
    `[ENV] FATAL: missing required environment variable(s): ${missingRequired.join(', ')}. ` +
    `Add them to your .env file. See .env.example for reference.`

  if (isDev()) {
    console.warn(`\n${msg}\n[ENV] Running in development mode — continuing anyway. FIX THIS BEFORE PRODUCTION.\n`)
    return
  }

  throw new Error(msg)
}
