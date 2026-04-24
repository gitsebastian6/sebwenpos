'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryFetch, throwIfNotOk } from './query-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StaffUser {
  id: number
  phone: string
  email: string | null
  fullName: string | null
  cedula: string | null
  documentType: string | null
  role: string
  roleId: number | null
  isActive: boolean
  createdAt: string
  roleName: string | null
  permissions: Record<string, boolean> | null
}

export interface StaffRole {
  id: number
  name: string
  description: string | null
  permissions: Record<string, boolean>
  isActive: boolean
  isDefault: boolean
  createdAt: string
  userCount: number
}

export interface StaffData {
  users: StaffUser[]
  roles: StaffRole[]
  stats: { totalUsers: number; activeUsers: number; totalRoles: number }
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useStaff(storeId: number | undefined | null) {
  return useQuery<StaffData>({
    queryKey: ['staff', storeId],
    queryFn: () =>
      queryFetch<StaffData>(`/api/staff?storeId=${storeId}`),
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

export function useStaffUser(userId: number | undefined | null) {
  return useQuery({
    queryKey: ['staff-user', userId],
    queryFn: () =>
      queryFetch(`/api/users?userId=${userId}`),
    enabled: !!userId,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// User Mutation hooks
// ---------------------------------------------------------------------------

export function useCreateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ body }: { body: Record<string, unknown> }) =>
      throwIfNotOk(
        await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, body }: { userId: number; body: Record<string, unknown> }) =>
      throwIfNotOk(
        await fetch(`/api/users?userId=${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
    },
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { id: number }>({
    mutationFn: async ({ id }) =>
      throwIfNotOk(await fetch(`/api/users/${id}`, { method: 'DELETE' })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
    },
  })
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      throwIfNotOk(
        await fetch(`/api/users/${id}/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ),
  })
}

// ---------------------------------------------------------------------------
// Role Mutation hooks (invalidates staff query)
// ---------------------------------------------------------------------------

export function useUpdateRoleName() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      throwIfNotOk(
        await fetch(`/api/roles/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
    },
  })
}

export function useCreateRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ body }: { body: Record<string, unknown> }) =>
      throwIfNotOk(
        await fetch('/api/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
    },
  })
}

export function useDeleteRole() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { id: number }>({
    mutationFn: async ({ id }) =>
      throwIfNotOk(await fetch(`/api/roles/${id}`, { method: 'DELETE' })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
    },
  })
}
