import { describe, it, expect, beforeEach } from 'vitest'
import { encryptField, decryptField } from '../field-encryption'

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
})
