// ---------------------------------------------------------------------------
// Sebwen POS — Server-side RBAC (module permissions)
// ---------------------------------------------------------------------------
// The client `hasPermission(module)` in src/stores/auth-store.ts only hides
// UI. This module is the authoritative check: it re-resolves the caller's
// permissions from the database on every gated request so an employee cannot
// bypass the UI with a raw HTTP call.
//
// Permission model (mirrors src/app/api/auth/login/route.ts):
//   - SUPER_ADMIN / OWNER  → full access, no lookup.
//   - EMPLOYEE             → the assigned Role's permissions when the role is
//                            active, otherwise the permissions stored directly
//                            on the Employee row. Missing key / parse error → deny.
//
// ── Where to apply `requirePermission` (convention) ──────────────────────
// The role model has one boolean per module — it does NOT distinguish read
// from write. Applying it bluntly to a GET would break cross-module reads:
// the POS cashier holds only `pos` yet legitimately reads the catalog,
// customers, services, tax rates and the open cash shift (see
// src/hooks/pos/*, src/lib/offline/sync.ts).
//
//   • State-changing handlers (POST / PUT / PATCH / DELETE) → always gate on
//     the owning module's permission, after `requireStoreAccess`.
//   • GET handlers → gate only when the data is private to that one module
//     (e.g. purchases, reports, the ledger). Leave shared reference reads
//     (products, categories, customers, services, taxes, cash-register/current)
//     at `requireStoreAccess` so the POS keeps working.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/api-auth'

/** Module/capability keys used by the sidebar and the role editor. */
export const PERMISSION_KEYS = [
  'dashboard',
  'pos',
  'tables',
  'products',
  'customers',
  'providers',
  'purchases',
  'orders',
  'invoices',
  'inventory',
  'accounting',
  'services',
  'reports',
  'settings',
  'quotations',
  'manageEmployees',
  'manageRoles',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

/**
 * Resolve an employee's effective permission map the same way `auth/login`
 * does: the active Role wins, else the Employee's own permissions. An inactive
 * employee, a missing row, or unparseable JSON all resolve to `{}` (deny-all).
 */
export async function resolveEmployeePermissions(
  employeeId: number,
): Promise<Record<string, boolean>> {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: {
      isActive: true,
      permissions: true,
      role: { select: { isActive: true, permissions: true } },
    },
  })

  if (!employee || !employee.isActive) return {}

  const raw = employee.role?.isActive ? employee.role.permissions : employee.permissions
  try {
    const parsed = JSON.parse(raw || '{}')
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

/**
 * Server-side permission gate for an API route handler.
 *
 *   const permErr = await requirePermission(req, 'manageEmployees')
 *   if (permErr) return permErr
 *
 * Returns `null` when the caller may act, or a ready-to-return `NextResponse`
 * (401 unauthenticated / 403 forbidden). Call it after `requireStoreAccess`
 * so store isolation is checked first.
 */
export async function requirePermission(
  request: NextRequest,
  permission: PermissionKey,
): Promise<null | NextResponse> {
  return requireAnyPermission(request, [permission])
}

/**
 * Like `requirePermission`, but passes when the caller holds *any* of the
 * given permissions. Use for a read that legitimately belongs to more than one
 * module — e.g. `/api/reports/daily` is consulted from both the Reports view
 * (`reports`) and the Accounting view (`accounting`).
 */
export async function requireAnyPermission(
  request: NextRequest,
  permissions: PermissionKey[],
): Promise<null | NextResponse> {
  const user = getAuthUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Autenticación requerida' }, { status: 401 })
  }

  if (user.role === 'SUPER_ADMIN' || user.role === 'OWNER') return null

  if (user.role === 'EMPLOYEE' && user.employeeId) {
    const perms = await resolveEmployeePermissions(user.employeeId)
    if (permissions.some((p) => perms[p] === true)) return null
  }

  return NextResponse.json(
    { error: 'No tienes permiso para realizar esta acción' },
    { status: 403 },
  )
}
