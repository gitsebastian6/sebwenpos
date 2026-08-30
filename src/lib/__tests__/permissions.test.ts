import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

// ─── Hoisted mocks ─────────────────────────────────────────────────────────

const mockDb = vi.hoisted(() => ({
  employee: { findUnique: vi.fn() },
}))
const mockAuth = vi.hoisted(() => ({ getAuthUser: vi.fn() }))

vi.mock('@/lib/db', () => ({ db: mockDb }))
vi.mock('@/lib/api-auth', () => mockAuth)

import { resolveEmployeePermissions, requirePermission } from '../permissions'

const req = {} as NextRequest

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── resolveEmployeePermissions ───────────────────────────────────────────

describe('resolveEmployeePermissions', () => {
  it('uses the active role permissions over the employee row', async () => {
    mockDb.employee.findUnique.mockResolvedValue({
      isActive: true,
      permissions: JSON.stringify({ accounting: true }),
      role: { isActive: true, permissions: JSON.stringify({ accounting: false, reports: true }) },
    })
    expect(await resolveEmployeePermissions(1)).toEqual({ accounting: false, reports: true })
  })

  it('falls back to the employee row when the role is inactive', async () => {
    mockDb.employee.findUnique.mockResolvedValue({
      isActive: true,
      permissions: JSON.stringify({ pos: true }),
      role: { isActive: false, permissions: JSON.stringify({ pos: false }) },
    })
    expect(await resolveEmployeePermissions(1)).toEqual({ pos: true })
  })

  it('uses the employee row when there is no role', async () => {
    mockDb.employee.findUnique.mockResolvedValue({
      isActive: true,
      permissions: JSON.stringify({ manageRoles: true }),
      role: null,
    })
    expect(await resolveEmployeePermissions(1)).toEqual({ manageRoles: true })
  })

  it('denies all when the employee is inactive', async () => {
    mockDb.employee.findUnique.mockResolvedValue({
      isActive: false,
      permissions: JSON.stringify({ manageRoles: true }),
      role: null,
    })
    expect(await resolveEmployeePermissions(1)).toEqual({})
  })

  it('denies all when the employee is not found', async () => {
    mockDb.employee.findUnique.mockResolvedValue(null)
    expect(await resolveEmployeePermissions(999)).toEqual({})
  })

  it('denies all on unparseable permissions JSON', async () => {
    mockDb.employee.findUnique.mockResolvedValue({
      isActive: true,
      permissions: 'not json',
      role: null,
    })
    expect(await resolveEmployeePermissions(1)).toEqual({})
  })
})

// ─── requirePermission ────────────────────────────────────────────────────

describe('requirePermission', () => {
  it('returns 401 when unauthenticated', async () => {
    mockAuth.getAuthUser.mockReturnValue(null)
    const res = await requirePermission(req, 'manageEmployees')
    expect(res?.status).toBe(401)
  })

  it('allows SUPER_ADMIN without a DB lookup', async () => {
    mockAuth.getAuthUser.mockReturnValue({ userId: 1, role: 'SUPER_ADMIN', storeId: null, employeeId: null })
    expect(await requirePermission(req, 'manageRoles')).toBeNull()
    expect(mockDb.employee.findUnique).not.toHaveBeenCalled()
  })

  it('allows OWNER without a DB lookup', async () => {
    mockAuth.getAuthUser.mockReturnValue({ userId: 2, role: 'OWNER', storeId: 5, employeeId: null })
    expect(await requirePermission(req, 'manageRoles')).toBeNull()
    expect(mockDb.employee.findUnique).not.toHaveBeenCalled()
  })

  it('allows an EMPLOYEE whose resolved permission is true', async () => {
    mockAuth.getAuthUser.mockReturnValue({ userId: 3, role: 'EMPLOYEE', storeId: 5, employeeId: 9 })
    mockDb.employee.findUnique.mockResolvedValue({
      isActive: true,
      permissions: JSON.stringify({ manageEmployees: true }),
      role: null,
    })
    expect(await requirePermission(req, 'manageEmployees')).toBeNull()
  })

  it('forbids an EMPLOYEE whose resolved permission is false', async () => {
    mockAuth.getAuthUser.mockReturnValue({ userId: 3, role: 'EMPLOYEE', storeId: 5, employeeId: 9 })
    mockDb.employee.findUnique.mockResolvedValue({
      isActive: true,
      permissions: JSON.stringify({ manageEmployees: false }),
      role: null,
    })
    const res = await requirePermission(req, 'manageEmployees')
    expect(res?.status).toBe(403)
  })

  it('forbids an EMPLOYEE when the permission key is absent', async () => {
    mockAuth.getAuthUser.mockReturnValue({ userId: 3, role: 'EMPLOYEE', storeId: 5, employeeId: 9 })
    mockDb.employee.findUnique.mockResolvedValue({
      isActive: true,
      permissions: JSON.stringify({ pos: true }),
      role: null,
    })
    const res = await requirePermission(req, 'manageEmployees')
    expect(res?.status).toBe(403)
  })

  it('forbids an EMPLOYEE with no employeeId', async () => {
    mockAuth.getAuthUser.mockReturnValue({ userId: 3, role: 'EMPLOYEE', storeId: 5, employeeId: null })
    const res = await requirePermission(req, 'manageEmployees')
    expect(res?.status).toBe(403)
    expect(mockDb.employee.findUnique).not.toHaveBeenCalled()
  })
})
