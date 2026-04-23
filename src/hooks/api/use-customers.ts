'use client'

import { useQuery } from '@tanstack/react-query'
import type { Customer } from '@/types'

interface UseCustomersParams {
  search?: string
  limit?: number
}

interface CustomersResponse {
  data: Customer[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export function useCustomers(
  storeId: number | undefined | null,
  params?: UseCustomersParams
) {
  return useQuery<CustomersResponse>({
    queryKey: ['customers', storeId, params ?? {}],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      if (params?.search) sp.set('q', params.search)
      if (params?.limit) sp.set('limit', String(params.limit))

      const res = await fetch(`/api/customers?${sp.toString()}`)
      if (!res.ok) throw new Error('Error al cargar clientes')
      return res.json()
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}
