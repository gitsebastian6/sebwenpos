'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { unwrapArray, throwIfNotOk } from './query-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Role {
  id: number
  storeId: number
  name: string
  description: string | null
  permissions: string
  isDefault: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
  _count: { employees: number }
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useRoles(storeId: number | undefined | null) {
  return useQuery<Role[]>({
    queryKey: ['roles', storeId],
    queryFn: async () =>
      unwrapArray<Role>(
        await fetch(`/api/roles?storeId=${storeId}`)
      ),
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useCreateRole() {
  const queryClient = useQueryClient()

  return useMutation<Role, Error, { body: Record<string, unknown> }>({
    mutationFn: async ({ body }) =>
      throwIfNotOk(
        await fetch('/api/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
  })
}

export function useUpdateRole() {
  const queryClient = useQueryClient()

  return useMutation<Role, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: async ({ id, body }) =>
      throwIfNotOk(
        await fetch(`/api/roles/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
  })
}

export function usePatchRole() {
  const queryClient = useQueryClient()

  return useMutation<Role, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: async ({ id, body }) =>
      throwIfNotOk(
        await fetch(`/api/roles/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
  })
}

export function useDeleteRole() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { id: number }>({
    mutationFn: async ({ id }) =>
      throwIfNotOk(await fetch(`/api/roles/${id}`, { method: 'DELETE' })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roles'] })
    },
  })
}
