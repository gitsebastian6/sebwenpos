'use client'

import { useQuery } from '@tanstack/react-query'

interface UseServicesParams {
  include?: string
}

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
