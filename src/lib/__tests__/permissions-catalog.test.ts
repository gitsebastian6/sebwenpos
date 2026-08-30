import { describe, expect, it } from 'vitest'
import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  emptyPermissions,
  fullPermissions,
} from '../permissions-catalog'

describe('permissions-catalog', () => {
  it('no tiene keys duplicadas', () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length)
  })

  it('cada key tiene etiqueta en español', () => {
    for (const k of PERMISSION_KEYS) {
      expect(PERMISSION_LABELS[k]).toBeTruthy()
    }
    expect(Object.keys(PERMISSION_LABELS).sort()).toEqual([...PERMISSION_KEYS].sort())
  })

  it('emptyPermissions() = todas las keys en false', () => {
    const p = emptyPermissions()
    expect(Object.keys(p).sort()).toEqual([...PERMISSION_KEYS].sort())
    expect(Object.values(p).every((v) => v === false)).toBe(true)
  })

  it('fullPermissions() = todas las keys en true', () => {
    const p = fullPermissions()
    expect(Object.keys(p).sort()).toEqual([...PERMISSION_KEYS].sort())
    expect(Object.values(p).every((v) => v === true)).toBe(true)
  })

  it('incluye purchases y onlineOrders (regresión de drift)', () => {
    expect(PERMISSION_KEYS).toContain('purchases')
    expect(PERMISSION_KEYS).toContain('onlineOrders')
  })
})
