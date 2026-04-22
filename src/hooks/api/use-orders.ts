'use client'

import { useQuery } from '@tanstack/react-query'

interface UseOrdersParams {
  status?: string
  from?: string
  to?: string
  expand?: string
  page?: number
  limit?: number
  q?: string
  customerId?: number
}

interface OrdersResponse {
  data: any[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export function useOrders(
  storeId: number | undefined | null,
  params?: UseOrdersParams
) {
  return useQuery<OrdersResponse>({
    queryKey: ['orders', storeId, params ?? {}],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      if (params?.status && params.status !== 'ALL') sp.set('status', params.status)
      if (params?.from) sp.set('from', params.from)
      if (params?.to) sp.set('to', params.to)
      if (params?.expand) sp.set('expand', params.expand)
      if (params?.page) sp.set('page', String(params.page))
      if (params?.limit) sp.set('limit', String(params.limit))
      if (params?.q) sp.set('q', params.q)
      if (params?.customerId) sp.set('customerId', String(params.customerId))

      const res = await fetch(`/api/orders?${sp.toString()}`)
      if (!res.ok) throw new Error('Error al cargar órdenes')
      return res.json()
    },
    enabled: !!storeId,
    staleTime: 15_000,
  })
}
