'use client'

import { useQuery } from '@tanstack/react-query'
import type { Category } from '@/types'

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
