import { beforeEach, describe, expect, it, vi } from 'vitest'

// Wiring test: NO se mockean @/lib/api-auth ni @/lib/permissions — se ejercita
// la cadena real requireStoreAccess → requirePermission → resolveEmployeePermissions
// desde un route handler, con un EMPLEADO sin el permiso. Los demás tests de ruta
// mockean getAuthUser como OWNER y nunca tocan la rama de denegación.

const mockDb = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
  role: { findMany: vi.fn().mockResolvedValue([]) },
}))
vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

import { GET } from '../route'

function reqAs(role: string, opts: { storeId?: number; employeeId?: number } = {}) {
  const h = new Headers({
    'x-auth-user-id': '1',
    'x-auth-role': role,
    'x-auth-store-id': String(opts.storeId ?? 1),
  })
  if (opts.employeeId) h.set('x-auth-employee-id', String(opts.employeeId))
  return new Request('http://localhost/api/roles?storeId=1', { headers: h }) as never
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/roles — RBAC wiring', () => {
  it('403: EMPLOYEE sin manageRoles', async () => {
    mockDb.employee.findUnique.mockResolvedValue({ isActive: true, permissions: '{}', role: null })
    const res = await GET(reqAs('EMPLOYEE', { employeeId: 9 }))
    expect(res.status).toBe(403)
    expect(mockDb.role.findMany).not.toHaveBeenCalled()
  })

  it('200: EMPLOYEE con manageRoles=true', async () => {
    mockDb.employee.findUnique.mockResolvedValue({
      isActive: true,
      permissions: JSON.stringify({ manageRoles: true }),
      role: null,
    })
    const res = await GET(reqAs('EMPLOYEE', { employeeId: 9 }))
    expect(res.status).toBe(200)
    expect(mockDb.role.findMany).toHaveBeenCalled()
  })

  it('200: OWNER pasa sin lookup de empleado', async () => {
    const res = await GET(reqAs('OWNER'))
    expect(res.status).toBe(200)
    expect(mockDb.employee.findUnique).not.toHaveBeenCalled()
  })

  it('403: EMPLOYEE de otra tienda (requireStoreAccess)', async () => {
    const res = await GET(reqAs('EMPLOYEE', { storeId: 2, employeeId: 9 }))
    expect(res.status).toBe(403)
    expect(mockDb.employee.findUnique).not.toHaveBeenCalled()
  })
})
