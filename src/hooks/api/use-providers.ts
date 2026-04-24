'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { unwrapArray, throwIfNotOk } from './query-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Provider {
  id: number
  storeId: number
  name: string
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  nit: string | null
  dv: string | null
  regime: string | null
  autoretainer: boolean | null
  paymentTerms: string | null
  creditLimit: number | null
  totalDebt: number | null
  totalPurchases: number | null
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseProvidersParams {
  q?: string
  active?: boolean | string
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/**
 * Fetches providers for a store with optional search and active filter.
 * API returns a plain array `Provider[]`.
 */
export function useProviders(
  storeId: number | undefined | null,
  params?: UseProvidersParams
) {
  return useQuery<Provider[]>({
    queryKey: ['providers', storeId, params ?? {}],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      if (params?.q) sp.set('q', params.q)
      if (params?.active === true) sp.set('active', 'true')
      if (params?.active === false) sp.set('active', 'false')

      return unwrapArray<Provider>(
        await fetch(`/api/providers?${sp.toString()}`)
      )
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useCreateProvider() {
  const queryClient = useQueryClient()

  return useMutation<{ id: number; name: string }, Error, { body: Record<string, unknown> }>({
    mutationFn: async ({ body }) => {
      return throwIfNotOk(
        await fetch('/api/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
    },
  })
}

export function useUpdateProvider() {
  const queryClient = useQueryClient()

  return useMutation<Provider, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: async ({ id, body }) => {
      return throwIfNotOk(
        await fetch(`/api/providers/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
    },
  })
}

export function usePatchProvider() {
  const queryClient = useQueryClient()

  return useMutation<Provider, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: async ({ id, body }) => {
      return throwIfNotOk(
        await fetch(`/api/providers/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
    },
  })
}

export function useDeleteProvider() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      await throwIfNotOk(
        await fetch(`/api/providers/${id}`, { method: 'DELETE' })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
    },
  })
}
