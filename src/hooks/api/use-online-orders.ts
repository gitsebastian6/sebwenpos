'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { throwIfNotOk } from './query-helpers'

export interface OnlineOrderItem {
  id: number
  productName: string
  presentationName: string | null
  quantity: number
  unitPrice: number
  totalRow: number
}

export interface OnlineOrder {
  id: number
  orderNumber: string
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED'
  customerName: string
  customerPhone: string
  customerPhoneNormalized: string
  fulfillmentType: 'DELIVERY' | 'PICKUP'
  deliveryAddress: string | null
  deliveryNotes: string | null
  subtotal: number
  deliveryFee: number
  total: number
  feeConfigSnapshot: { deliveryEnabled: boolean; deliveryFee: number; deliveryFreeAbove: number | null; deliveryMinOrder: number } | null
  rejectionReason: string | null
  convertedToOrderId: number | null
  createdAt: string
  items: OnlineOrderItem[]
}

interface OnlineOrdersResponse {
  data: OnlineOrder[]
  pendingCount: number
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

interface UseOnlineOrdersParams {
  status?: string
  from?: string
  to?: string
  q?: string
}

export function useOnlineOrders(storeId: number | undefined | null, params?: UseOnlineOrdersParams) {
  return useQuery<OnlineOrdersResponse>({
    queryKey: ['online-orders', storeId, params ?? {}],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      if (params?.status && params.status !== 'ALL') sp.set('status', params.status)
      if (params?.from) sp.set('from', params.from)
      if (params?.to) sp.set('to', params.to)
      if (params?.q) sp.set('q', params.q)
      const res = await fetch(`/api/online-orders?${sp.toString()}`)
      if (!res.ok) throw new Error('Error al cargar pedidos en línea')
      return res.json()
    },
    enabled: !!storeId,
    staleTime: 10_000,
    // Respaldo por si el socket está caído / la pestaña estuvo en background.
    refetchInterval: 45_000,
  })
}

export function useAcceptOnlineOrder() {
  const queryClient = useQueryClient()
  return useMutation<
    any,
    Error,
    { id: number; paymentMethod?: string; createCustomer?: boolean; items?: { onlineOrderItemId: number; quantity: number }[] }
  >({
    mutationFn: async ({ id, paymentMethod, createCustomer, items }) =>
      throwIfNotOk(
        await fetch(`/api/online-orders/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'accept', paymentMethod, createCustomer, items }),
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['online-orders'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}

export function useRejectOnlineOrder() {
  const queryClient = useQueryClient()
  return useMutation<any, Error, { id: number; reason?: string }>({
    mutationFn: async ({ id, reason }) =>
      throwIfNotOk(
        await fetch(`/api/online-orders/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject', reason }),
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['online-orders'] })
    },
  })
}
