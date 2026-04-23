'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { throwIfNotOk } from './query-helpers'

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

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

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

export function useOrderDetail(orderId: number | undefined | null, storeId: number | undefined | null) {
  return useQuery<any>({
    queryKey: ['order', orderId, storeId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error al cargar detalle de orden')
      return res.json()
    },
    enabled: !!orderId && !!storeId,
    staleTime: 15_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useCreateOrder() {
  const queryClient = useQueryClient()

  return useMutation<any, Error, { body: Record<string, unknown> }>({
    mutationFn: async ({ body }) => {
      return throwIfNotOk(
        await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}

export function useReturnOrder() {
  const queryClient = useQueryClient()

  return useMutation<any, Error, { id: number; body: { items: Array<{ orderItemId: number; quantity: number }>; reason?: string } }>({
    mutationFn: async ({ id, body }) => {
      return throwIfNotOk(
        await fetch(`/api/orders/${id}/return`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}
