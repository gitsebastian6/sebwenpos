'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Product } from '@/types'
import { throwIfNotOk } from './query-helpers'

interface UseProductsParams {
  search?: string
  categoryId?: string
  active?: string
  limit?: number
}

interface ProductsResponse {
  data: Product[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useProducts(
  storeId: number | undefined | null,
  params?: UseProductsParams
) {
  return useQuery<ProductsResponse>({
    queryKey: ['products', storeId, params ?? {}],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      if (params?.search) sp.set('q', params.search)
      if (params?.categoryId && params.categoryId !== 'all') sp.set('categoryId', params.categoryId)
      if (params?.active && params.active !== 'all') sp.set('active', params.active)
      if (params?.limit) sp.set('limit', String(params.limit))

      const res = await fetch(`/api/products?${sp.toString()}`)
      if (!res.ok) throw new Error('Error al cargar productos')
      return res.json()
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useCreateProduct() {
  const queryClient = useQueryClient()

  return useMutation<Product, Error, { body: Record<string, unknown> }>({
    mutationFn: async ({ body }) => {
      return throwIfNotOk(
        await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      // Compras keeps its own product picker cache (['purchase-products', storeId])
      // since it needs a bigger page size — it must be refreshed too, or newly
      // created/edited products (and their presentations) won't show up there.
      queryClient.invalidateQueries({ queryKey: ['purchase-products'] })
    },
  })
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()

  return useMutation<Product, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: async ({ id, body }) => {
      return throwIfNotOk(
        await fetch(`/api/products/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-products'] })
    },
  })
}

export function useDeleteProduct() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      await throwIfNotOk(await fetch(`/api/products/${id}`, { method: 'DELETE' }))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-products'] })
    },
  })
}

export function useImportProducts() {
  const queryClient = useQueryClient()

  return useMutation<any, Error, { file: File }>({
    mutationFn: async ({ file }) => {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/products/import', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error al importar productos')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['purchase-products'] })
    },
  })
}
