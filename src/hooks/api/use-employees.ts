'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { unwrapArray, throwIfNotOk } from './query-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EmployeeUser {
  id: number
  cedula: string
  fullName: string | null
  phone: string | null
  email: string | null
  role: string
  createdAt: string
}

export interface EmployeeRole {
  id: number
  name: string
  description: string | null
  permissions: string
}

export interface Employee {
  id: number
  storeId: number
  userId: number
  roleId: number | null
  position: string | null
  permissions: string
  commissionRate: number | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  user: EmployeeUser
  role: EmployeeRole | null
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useEmployees(storeId: number | undefined | null) {
  return useQuery<Employee[]>({
    queryKey: ['employees', storeId],
    queryFn: async () =>
      unwrapArray<Employee>(
        await fetch(`/api/employees?storeId=${storeId}`)
      ),
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useCreateEmployee() {
  const queryClient = useQueryClient()

  return useMutation<Employee, Error, { body: Record<string, unknown> }>({
    mutationFn: async ({ body }) =>
      throwIfNotOk(
        await fetch('/api/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient()

  return useMutation<Employee, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: async ({ id, body }) =>
      throwIfNotOk(
        await fetch(`/api/employees/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}

export function usePatchEmployee() {
  const queryClient = useQueryClient()

  return useMutation<Employee, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: async ({ id, body }) =>
      throwIfNotOk(
        await fetch(`/api/employees/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}

export function useDeleteEmployee() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { id: number }>({
    mutationFn: async ({ id }) =>
      throwIfNotOk(await fetch(`/api/employees/${id}`, { method: 'DELETE' })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}
