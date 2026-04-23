'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { throwIfNotOk } from './query-helpers'

interface UseServicesParams {
  include?: string
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useServices(
  storeId: number | undefined | null,
  params?: UseServicesParams
) {
  return useQuery<any[]>({
    queryKey: ['services', storeId, params ?? {}],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      if (params?.include) sp.set('include', params.include)

      const res = await fetch(`/api/services?${sp.toString()}`)
      if (!res.ok) throw new Error('Error al cargar servicios')
      return res.json()
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useCreateService() {
  const queryClient = useQueryClient()

  return useMutation<any, Error, { body: Record<string, unknown> }>({
    mutationFn: async ({ body }) => {
      return throwIfNotOk(
        await fetch('/api/services', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
    },
  })
}

export function useUpdateService() {
  const queryClient = useQueryClient()

  return useMutation<any, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: async ({ id, body }) => {
      return throwIfNotOk(
        await fetch(`/api/services/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
    },
  })
}

export function useDeleteService() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      await throwIfNotOk(await fetch(`/api/services/${id}`, { method: 'DELETE' }))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
    },
  })
}

export function useUpdateServiceTransaction() {
  const queryClient = useQueryClient()

  return useMutation<any, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: async ({ id, body }) => {
      return throwIfNotOk(
        await fetch(`/api/services/transactions/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
    },
  })
}

export function useDeleteServiceTransaction() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      await throwIfNotOk(await fetch(`/api/services/transactions/${id}`, { method: 'DELETE' }))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] })
    },
  })
}
