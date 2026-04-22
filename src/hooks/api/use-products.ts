'use client'

import { useQuery } from '@tanstack/react-query'
import type { Product } from '@/types'

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
