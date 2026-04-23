'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryFetch, unwrapArray, throwIfNotOk } from './query-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InventoryMovement {
  id: number
  productId: number
  productName: string
  quantity: number
  movementType: string
  notes: string | null
  createdAt: string
}

export interface KardexMovement {
  id: number
  date: string
  type: string
  quantity: number
  balance: number
  notes: string
  referenceId?: string | null
}

interface KardexResponse {
  product: Record<string, unknown>
  movements: KardexMovement[]
  currentStock: number
}

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseInventoryParams {
  type?: string
  productId?: string
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/**
 * Fetches inventory movements for a store with optional filters.
 * API returns a plain array `InventoryMovement[]`.
 */
export function useInventory(
  storeId: number | undefined | null,
  params?: UseInventoryParams
) {
  return useQuery<InventoryMovement[]>({
    queryKey: ['inventory', storeId, params ?? {}],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      if (params?.type && params.type !== 'ALL') sp.set('type', params.type)
      if (params?.productId && params.productId !== 'ALL') sp.set('productId', params.productId)

      return unwrapArray<InventoryMovement>(
        await fetch(`/api/inventory?${sp.toString()}`)
      )
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

/**
 * Fetches kardex (stock card) for a specific product.
 * API returns { product, movements, currentStock }.
 */
export function useKardex(
  productId: number | undefined | null,
  storeId: number | undefined | null
) {
  return useQuery<KardexMovement[]>({
    queryKey: ['kardex', productId, storeId],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      sp.set('productId', String(productId))
      const res = await queryFetch<KardexResponse>(`/api/inventory/kardex?${sp.toString()}`)
      return res.movements ?? []
    },
    enabled: !!productId && !!storeId,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useResetStock() {
  const queryClient = useQueryClient()

  return useMutation<{ message: string }, Error, { body: Record<string, unknown> }>({
    mutationFn: async ({ body }) => {
      return throwIfNotOk(
        await fetch('/api/inventory/reset-stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
  })
}

export function useInventoryAdjustment() {
  const queryClient = useQueryClient()

  return useMutation<InventoryMovement, Error, { body: Record<string, unknown> }>({
    mutationFn: async ({ body }) => {
      return throwIfNotOk(
        await fetch('/api/inventory/adjustments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
  })
}

export function useInventoryReturn() {
  const queryClient = useQueryClient()

  return useMutation<InventoryMovement, Error, { body: Record<string, unknown> }>({
    mutationFn: async ({ body }) => {
      return throwIfNotOk(
        await fetch('/api/inventory/returns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
  })
}

export function useInventoryLoss() {
  const queryClient = useQueryClient()

  return useMutation<InventoryMovement, Error, { body: Record<string, unknown> }>({
    mutationFn: async ({ body }) => {
      return throwIfNotOk(
        await fetch('/api/inventory/losses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
  })
}
