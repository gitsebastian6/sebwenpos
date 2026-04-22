import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

/**
 * Get the encryption key from ENCRYPTION_KEY env var.
 * Falls back to AUTH_SECRET if ENCRYPTION_KEY is not set (for backwards compatibility).
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY || process.env.AUTH_SECRET
  if (!key) {
    throw new Error('ENCRYPTION_KEY or AUTH_SECRET environment variable is required for field encryption')
  }
  // SHA-256 hash the key to get exactly 32 bytes for AES-256
  return createHash('sha256').update(key).digest()
}

/**
 * Encrypt a plaintext string. Returns format: base64(iv:authTag:ciphertext)
 */
export function encryptField(plaintext: string): string {
  if (!plaintext) return plaintext
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  // Pack: iv:authTag:ciphertext (all hex)
  const packed = iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted
  return Buffer.from(packed, 'utf8').toString('base64')
}

/**
 * Decrypt a field that was encrypted with encryptField().
 * Returns the original plaintext string.
 * If the value is not encrypted (no base64 match), returns it as-is (backwards compatibility).
 */
export function decryptField(encrypted: string): string {
  if (!encrypted) return encrypted
  try {
    const packed = Buffer.from(encrypted, 'base64').toString('utf8')
    const parts = packed.split(':')
    if (parts.length !== 3) {
      // Not encrypted (backwards compatibility with existing plain text values)
      return encrypted
    }

    const key = getEncryptionKey()
    const iv = Buffer.from(parts[0], 'hex')
    const authTag = Buffer.from(parts[1], 'hex')
    const ciphertext = parts[2]

    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch {
    // If decryption fails, return as-is (might be plain text from before encryption)
    return encrypted
  }
}
