'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { unwrapArray, throwIfNotOk } from './query-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaxRate {
  id: number
  storeId: number
  name: string
  code: string
  rateType: string
  rate: number
  applyTo: string
  category: string
  isDefault: boolean
  isActive: boolean
  description: string | null
  _count?: { products: number }
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseTaxesParams {
  category?: string
  isActive?: boolean
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/**
 * Fetches tax rates for a store.
 * API returns a plain array `TaxRate[]`.
 */
export function useTaxes(
  storeId: number | undefined | null,
  params?: UseTaxesParams
) {
  return useQuery<TaxRate[]>({
    queryKey: ['taxes', storeId, params ?? {}],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      if (params?.category) sp.set('category', params.category)
      if (params?.isActive !== undefined) sp.set('isActive', String(params.isActive))

      return unwrapArray<TaxRate>(
        await fetch(`/api/taxes?${sp.toString()}`)
      )
    },
    enabled: !!storeId,
    staleTime: 60_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useCreateTax() {
  const queryClient = useQueryClient()

  return useMutation<TaxRate, Error, { body: Record<string, unknown> }>({
    mutationFn: async ({ body }) => {
      return throwIfNotOk(
        await fetch('/api/taxes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxes'] })
    },
  })
}

export function useUpdateTax() {
  const queryClient = useQueryClient()

  return useMutation<TaxRate, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: async ({ id, body }) => {
      return throwIfNotOk(
        await fetch(`/api/taxes/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxes'] })
    },
  })
}

export function useDeleteTax() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      await throwIfNotOk(
        await fetch(`/api/taxes/${id}`, { method: 'DELETE' })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxes'] })
    },
  })
}
