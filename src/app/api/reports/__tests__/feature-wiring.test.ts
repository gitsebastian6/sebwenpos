import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Wiring de requireFeature: sin mockear @/lib/permissions ni @/lib/subscription-guard.
// Un EMPLEADO CON permiso 'reports' pero en un plan SIN la feature 'reports'
// debe recibir 403 (upgradeRequired) antes de la lógica pesada del informe.

const mockDb = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  subscription: { findUnique: vi.fn() },
  store: { findUnique: vi.fn() },
}))
vi.mock('@/lib/db', () => ({ db: mockDb, sql: (s: TemplateStringsArray) => s.join('') }))
vi.mock('@/lib/db-dialect', () => ({ sql: (s: TemplateStringsArray) => s.join('') }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/subscription-cache', () => ({ setSubscriptionStatus: vi.fn() }))

import { GET } from '../informes/route'

function empReq(storeId = 1) {
  return new NextRequest(`http://localhost/api/reports/informes?storeId=${storeId}`, {
    headers: {
      'x-auth-user-id': '1',
      'x-auth-role': 'EMPLOYEE',
      'x-auth-store-id': String(storeId),
      'x-auth-employee-id': '9',
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Empleado CON el permiso de módulo 'reports'.
  mockDb.employee.findUnique.mockResolvedValue({
    isActive: true,
    permissions: JSON.stringify({ reports: true }),
    role: null,
  })
})

describe('GET /api/reports/informes — feature gate wiring', () => {
  it('403 upgradeRequired: plan ACTIVE sin la feature "reports"', async () => {
    mockDb.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE', plan: { features: '{}' } })
    const res = await GET(empReq())
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ upgradeRequired: true })
  })

  it('403: sucursal cuyo padre tampoco tiene la feature', async () => {
    mockDb.subscription.findUnique
      .mockResolvedValueOnce(null) // la sucursal no tiene fila propia
      .mockResolvedValueOnce({ status: 'ACTIVE', plan: { features: '{}' } }) // el padre
    mockDb.store.findUnique.mockResolvedValue({ parentStoreId: 5 })
    const res = await GET(empReq())
    expect(res.status).toBe(403)
  })
})
