'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryFetch, throwIfNotOk } from './query-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrderDetail {
  id: number
  storeId: number
  orderNumber: string
  status: string
  subtotal: number
  discountAmount: number
  tipAmount: number
  taxAmount: number
  total: number
  paymentMethod: string
  paymentStatus: string
  source: string
  notes: string | null
  customerName: string | null
  customerPhone: string | null
  customerId: number | null
  invoiceId: number | null
  tableSessionId: number | null
  tableName: string | null
  items: OrderItem[]
  payments: OrderPayment[]
  createdById: number
  createdBy: { id: number; fullName: string; cedula?: string | null } | null
  createdAt: string
  updatedAt: string
}

export interface OrderItem {
  id: number
  orderId: number
  productId: number | null
  serviceId: number | null
  name: string
  sku: string | null
  quantity: number
  unitPrice: number
  discountAmount: number
  taxAmount: number
  total: number
  notes: string | null
  isService: boolean
}

export interface OrderPayment {
  id: number
  orderId: number
  amount: number
  paymentMethod: string
  reference: string | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/**
 * Fetches a single order by ID with full detail (items, payments).
 */
export function useOrderDetail(
  orderId: number | undefined | null,
  storeId?: number | undefined | null
) {
  return useQuery<OrderDetail>({
    queryKey: ['order', orderId, storeId],
    queryFn: async () => {
      const sp = new URLSearchParams()
      if (storeId) sp.set('storeId', String(storeId))
      const qs = sp.toString()
      return queryFetch<OrderDetail>(
        `/api/orders/${orderId}${qs ? `?${qs}` : ''}`
      )
    },
    enabled: !!orderId,
    staleTime: 15_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

/**
 * Creates a new order.
 */
export function useCreateOrder() {
  const queryClient = useQueryClient()

  return useMutation<OrderDetail, Error, Record<string, unknown>>({
    mutationFn: async (body) => {
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
      queryClient.invalidateQueries({ queryKey: ['current-shift'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

/**
 * Returns an order (full or partial) by creating a return.
 */
export function useReturnOrder() {
  const queryClient = useQueryClient()

  return useMutation<unknown, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: async ({ id, body }) => {
      return throwIfNotOk(
        await fetch(`/api/orders/${id}/return`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}
