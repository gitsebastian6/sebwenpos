'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Category } from '@/types'
import { throwIfNotOk } from './query-helpers'

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useCategories(storeId: number | undefined | null) {
  return useQuery<Category[]>({
    queryKey: ['categories', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/categories?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error al cargar categorías')
      return res.json()
    },
    enabled: !!storeId,
    staleTime: 60_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useCreateCategory() {
  const queryClient = useQueryClient()

  return useMutation<Category, Error, { body: Record<string, unknown> }>({
    mutationFn: async ({ body }) => {
      return throwIfNotOk(
        await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
    },
  })
}

export function useUpdateCategory() {
  const queryClient = useQueryClient()

  return useMutation<Category, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: async ({ id, body }) => {
      return throwIfNotOk(
        await fetch(`/api/categories/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}

export function useDeleteCategory() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      await throwIfNotOk(await fetch(`/api/categories/${id}`, { method: 'DELETE' }))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })
}
