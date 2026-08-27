import { describe, it, expect, beforeEach } from 'vitest'
import { createCipheriv, createHash, randomBytes } from 'crypto'
import { encryptField, decryptField, needsReencryption } from '../field-encryption'

// Reproduce the legacy v1 packing (unsalted SHA-256 key) so we can prove
// decryptField still reads values written before the salted v2 scheme.
function encryptV1(plaintext: string, secret: string): string {
  const key = createHash('sha256').update(secret).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  let enc = cipher.update(plaintext, 'utf8', 'hex')
  enc += cipher.final('hex')
  const tag = cipher.getAuthTag()
  const packed = `${iv.toString('hex')}:${tag.toString('hex')}:${enc}`
  return Buffer.from(packed, 'utf8').toString('base64')
}

describe('field-encryption', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = 'test-auth-secret-for-encryption-tests'
    process.env.ENCRYPTION_KEY = ''
  })

  it('round-trip: decryptField(encryptField(text)) returns original text', () => {
    const original = 'mi-password-secreto-123'
    const encrypted = encryptField(original)
    const decrypted = decryptField(encrypted)
    expect(decrypted).toBe(original)
  })

  it('encrypted value is different from original', () => {
    const original = 'password123'
    const encrypted = encryptField(original)
    expect(encrypted).not.toBe(original)
  })

  it('handles empty string — returns empty string without encrypting', () => {
    const encrypted = encryptField('')
    expect(encrypted).toBe('')
    expect(decryptField(encrypted)).toBe('')
  })

  it('handles non-encrypted value gracefully (backward compatibility)', () => {
    const plainText = 'this-is-not-encrypted'
    const result = decryptField(plainText)
    expect(result).toBe(plainText)
  })

  it('produces different encrypted values each time (random IV)', () => {
    const original = 'same-input'
    const encrypted1 = encryptField(original)
    const encrypted2 = encryptField(original)
    expect(encrypted1).not.toBe(encrypted2)
    expect(decryptField(encrypted1)).toBe(original)
    expect(decryptField(encrypted2)).toBe(original)
  })

  it('handles long strings', () => {
    const original = 'a'.repeat(10000)
    const encrypted = encryptField(original)
    const decrypted = decryptField(encrypted)
    expect(decrypted).toBe(original)
  })

  it('handles special characters', () => {
    const original = 'p@ssw0rd!#$%^&*()_+-={}[]|\\:";\'<>?,./'
    const encrypted = encryptField(original)
    const decrypted = decryptField(encrypted)
    expect(decrypted).toBe(original)
  })

  it('handles unicode characters', () => {
    const original = 'contraseña-ñ-ü-é-á-í-ó-ú'
    const encrypted = encryptField(original)
    const decrypted = decryptField(encrypted)
    expect(decrypted).toBe(original)
  })

  it('decryptField handles empty string input', () => {
    expect(decryptField('')).toBe('')
  })

  it('decrypts legacy v1 (unsalted SHA-256) values', () => {
    const original = 'legacy-dian-pin-9876'
    const v1 = encryptV1(original, process.env.AUTH_SECRET as string)
    expect(decryptField(v1)).toBe(original)
  })

  it('needsReencryption: true for v1, false for v2 / plain text / empty', () => {
    const v1 = encryptV1('x', process.env.AUTH_SECRET as string)
    expect(needsReencryption(v1)).toBe(true)
    expect(needsReencryption(encryptField('x'))).toBe(false)
    expect(needsReencryption('plain-text-value')).toBe(false)
    expect(needsReencryption('')).toBe(false)
  })

  it('new values use the v2 scheme', () => {
    const packed = Buffer.from(encryptField('abc'), 'base64').toString('utf8')
    expect(packed.startsWith('v2:')).toBe(true)
    expect(packed.split(':')).toHaveLength(5)
  })

  it('tampered v2 ciphertext returns the stored value unchanged (no throw)', () => {
    const enc = encryptField('sensitive')
    const raw = Buffer.from(enc, 'base64').toString('utf8')
    const parts = raw.split(':')
    parts[4] = parts[4].replace(/.$/, (c) => (c === '0' ? '1' : '0')) // flip last hex nibble
    const tampered = Buffer.from(parts.join(':'), 'utf8').toString('base64')
    expect(decryptField(tampered)).toBe(tampered)
  })
})
