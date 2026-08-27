import { createCipheriv, createDecipheriv, randomBytes, createHash, scryptSync } from 'crypto'
import { logger } from './logger'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const SALT_LENGTH = 16
const KEY_LENGTH = 32
// scrypt cost params — deliberate: these fields are written a handful of times
// per store and read once per DIAN document, so ~50ms/derivation is fine.
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1

// Marker for the salted-scrypt scheme. Values without it are treated as either
// the legacy unsalted-SHA256 scheme (v1) or plain text (pre-encryption data).
const V2_PREFIX = 'v2'

/**
 * Raw secret used to derive encryption keys. Prefers ENCRYPTION_KEY, falls back
 * to AUTH_SECRET for backwards compatibility.
 */
function getSecret(): string {
  const key = process.env.ENCRYPTION_KEY || process.env.AUTH_SECRET
  if (!key) {
    throw new Error('ENCRYPTION_KEY or AUTH_SECRET environment variable is required for field encryption')
  }
  return key
}

/** Legacy (v1) key derivation: a single unsalted SHA-256 of the secret. */
function legacyKey(): Buffer {
  return createHash('sha256').update(getSecret()).digest()
}

/** Current (v2) key derivation: scrypt with a per-record random salt. */
function deriveKey(salt: Buffer): Buffer {
  return scryptSync(getSecret(), salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P })
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 * Output: base64("v2" : hex(salt) : hex(iv) : hex(authTag) : hex(ciphertext))
 */
export function encryptField(plaintext: string): string {
  if (!plaintext) return plaintext
  const salt = randomBytes(SALT_LENGTH)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, deriveKey(salt), iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  const packed = [
    V2_PREFIX,
    salt.toString('hex'),
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted,
  ].join(':')
  return Buffer.from(packed, 'utf8').toString('base64')
}

/**
 * True when the value is stored under the legacy v1 scheme and should be
 * re-saved through encryptField() to upgrade it to the salted v2 scheme.
 * (v2 values, plain text, and empty values all return false.)
 */
export function needsReencryption(value: string): boolean {
  if (!value) return false
  try {
    const parts = Buffer.from(value, 'base64').toString('utf8').split(':')
    return parts.length === 3 && parts[0] !== V2_PREFIX
  } catch {
    return false
  }
}

/**
 * Decrypt a field encrypted with encryptField().
 * Reads the current v2 scheme, the legacy v1 scheme, and returns plain text
 * unchanged (backwards compatibility with values written before encryption
 * existed). A value that *looks* encrypted but fails authentication is logged
 * and returned as-is so the caller's flow does not hard-crash.
 */
export function decryptField(encrypted: string): string {
  if (!encrypted) return encrypted

  let parts: string[]
  try {
    parts = Buffer.from(encrypted, 'base64').toString('utf8').split(':')
  } catch {
    return encrypted
  }

  // ── v2: salted scrypt ──
  if (parts[0] === V2_PREFIX && parts.length === 5) {
    try {
      const [, saltHex, ivHex, tagHex, ciphertext] = parts
      const decipher = createDecipheriv(ALGORITHM, deriveKey(Buffer.from(saltHex, 'hex')), Buffer.from(ivHex, 'hex'))
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
      let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      return decrypted
    } catch (err) {
      logger.error('[field-encryption] v2 decryption failed — returning stored value unchanged. Check ENCRYPTION_KEY/AUTH_SECRET.', err)
      return encrypted
    }
  }

  // ── v1: legacy unsalted SHA-256 ──
  if (parts.length === 3) {
    try {
      const [ivHex, tagHex, ciphertext] = parts
      const decipher = createDecipheriv(ALGORITHM, legacyKey(), Buffer.from(ivHex, 'hex'))
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
      let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      return decrypted
    } catch (err) {
      logger.warn('[field-encryption] v1 decryption failed — value may be plain text or the key changed.', err)
      return encrypted
    }
  }

  // Not encrypted — return as-is (pre-encryption plain text).
  return encrypted
}
