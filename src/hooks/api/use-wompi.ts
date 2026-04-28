'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { mutationFetch, queryFetch } from './query-helpers'

// ── Types ──

export interface WompiPaymentLinkResponse {
  checkoutUrl: string
  reference: string
  wompiTransactionId: number
  wompiPaymentLinkId: number
  amount: number
  amountInCents: number
  currency: string
  expiresAt: string | null
}

export interface WompiTransactionData {
  id: number
  storeId: number
  store?: { id: number; name: string }
  subscriptionId: number | null
  subscription?: { id: number; status: string; plan: { name: string; price: number } } | null
  orderId: number | null
  receiptId: number | null
  receipt?: { id: number; status: string } | null
  wompiId: string | null
  wompiPaymentLinkId: string | null
  reference: string
  amount: number
  amountInCents: number
  currency: string
  paymentMethod: string | null
  paymentMethodType: string | null
  status: string
  wompiStatus: string | null
  customerEmail: string | null
  customerName: string | null
  customerPhone: string | null
  customerDocument: string | null
  paidAt: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  refreshedFromWompi?: boolean
}

export interface WompiTransactionsResponse {
  transactions: WompiTransactionData[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ── Create payment link mutation ──
// Crea un enlace de pago Wompi para suscripción o POS

export function useCreateWompiPaymentLink() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ storeId, amount, planId, planName, billingPeriod, type, customerEmail, customerName, customerDocument }: {
      storeId: number
      amount: number
      planId?: number
      planName?: string
      billingPeriod?: string
      type: 'SUBSCRIPTION' | 'POS'
      customerEmail?: string
      customerName?: string
      customerDocument?: string
    }) =>
      mutationFetch<WompiPaymentLinkResponse>(`/api/payments/wompi/create-link?storeId=${storeId}`, 'POST', {
        amount,
        planId,
        planName,
        billingPeriod,
        type,
        customerEmail,
        customerName,
        customerDocument,
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['wompi-transactions', variables.storeId] })
      qc.invalidateQueries({ queryKey: ['payment-receipts', variables.storeId] })
      qc.invalidateQueries({ queryKey: ['subscription-current', variables.storeId] })
    },
  })
}

// ── Get Wompi transaction status ──
// Consulta el estado de una transacción Wompi con polling automático

export function useWompiTransactionStatus(transactionId: number | null, options?: { refresh?: boolean }) {
  return useQuery<WompiTransactionData>({
    queryKey: ['wompi-transaction-status', transactionId, options?.refresh],
    queryFn: () => queryFetch<WompiTransactionData>(`/api/payments/wompi/status/${transactionId}${options?.refresh ? '?refresh=true' : ''}`),
    enabled: !!transactionId,
    refetchInterval: (query) => {
      const data = query.state.data
      if (data && ['PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR'].includes(data.status)) {
        return data.status === 'PENDING' ? 5000 : false // Poll cada 5s mientras esté pendiente
      }
      return false
    },
    staleTime: 3000,
  })
}

// ── List Wompi transactions ──
// Lista transacciones Wompi con filtros por tienda, estado y tipo

export function useWompiTransactions(
  storeId: number | undefined,
  options?: { status?: string; type?: string; page?: number; limit?: number },
) {
  return useQuery<WompiTransactionsResponse>({
    queryKey: ['wompi-transactions', storeId, options],
    queryFn: () => {
      const params = new URLSearchParams()
      if (storeId) params.set('storeId', storeId.toString())
      if (options?.status) params.set('status', options.status)
      if (options?.type) params.set('type', options.type)
      if (options?.page) params.set('page', options.page.toString())
      if (options?.limit) params.set('limit', options.limit.toString())
      return queryFetch<WompiTransactionsResponse>(`/api/payments/wompi/transactions?${params.toString()}`)
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}
