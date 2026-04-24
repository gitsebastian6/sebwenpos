'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { throwIfNotOk } from './query-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvoiceDetail {
  id: number
  storeId: number
  prefix: string
  consecutive: string
  number: string
  type: string
  customerId: number | null
  customerName: string | null
  customerNIT: string | null
  customerEmail: string | null
  customerPhone: string | null
  customerAddress: string | null
  orderId: number | null
  subtotal: number
  discountAmount: number
  taxAmount: number
  tipAmount: number
  total: number
  paymentMethod: string
  status: string
  xml: string | null
  pdfBase64: string | null
  cufe: string | null
  notes: string | null
  errorCode: string | null
  errorMessage: string | null
  items: InvoiceItem[]
  createdAt: string
  updatedAt: string
}

export interface InvoiceItem {
  id: number
  name: string
  sku: string | null
  quantity: number
  unitPrice: number
  discountAmount: number
  taxAmount: number
  total: number
  taxRate: number
}

export interface InvoiceStatus {
  status: string
  errorCode: string | null
  errorMessage: string | null
}

export interface ResolutionStatus {
  enabled: boolean
  hasActiveResolution: boolean
  resolution: {
    prefix: string
    startNumber: number
    endNumber: number
    currentNumber: number
    startDate: string
    endDate: string | null
  } | null
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/**
 * Fetches a single invoice by ID.
 */
export function useInvoiceDetail(
  id: number | undefined | null,
  storeId?: number | undefined | null
) {
  return useQuery<InvoiceDetail>({
    queryKey: ['invoice', id, storeId],
    queryFn: async () => {
      const sp = new URLSearchParams()
      if (storeId) sp.set('storeId', String(storeId))
      const qs = sp.toString()
      const res = await fetch(
        `/api/invoices/${id}${qs ? `?${qs}` : ''}`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const message =
          body?.error ?? body?.message ?? `Error ${res.status}: ${res.statusText}`
        throw new Error(message)
      }
      return res.json()
    },
    enabled: !!id,
    staleTime: 15_000,
  })
}

/**
 * Fetches invoice processing status.
 */
export function useInvoiceStatus(
  id: number | undefined | null,
  storeId?: number | undefined | null
) {
  return useQuery<InvoiceStatus>({
    queryKey: ['invoice-status', id, storeId],
    queryFn: async () => {
      const sp = new URLSearchParams()
      if (storeId) sp.set('storeId', String(storeId))
      const qs = sp.toString()
      const res = await fetch(
        `/api/invoices/${id}/status${qs ? `?${qs}` : ''}`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const message =
          body?.error ?? body?.message ?? `Error ${res.status}: ${res.statusText}`
        throw new Error(message)
      }
      return res.json()
    },
    enabled: !!id,
    staleTime: 10_000,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      // Keep polling while status is PENDING or PROCESSING
      if (status === 'PENDING' || status === 'PROCESSING') return 5_000
      return false
    },
  })
}

/**
 * Fetches the electronic invoicing resolution status for a store.
 */
export function useResolutionStatus(storeId: number | undefined | null) {
  return useQuery<ResolutionStatus>({
    queryKey: ['resolution-status', storeId],
    queryFn: async () => {
      const res = await fetch(
        `/api/invoices/resolution-status?storeId=${storeId}`
      )
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const message =
          body?.error ?? body?.message ?? `Error ${res.status}: ${res.statusText}`
        throw new Error(message)
      }
      return res.json()
    },
    enabled: !!storeId,
    staleTime: 60_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

/**
 * Creates a new invoice.
 */
export function useCreateInvoice() {
  const queryClient = useQueryClient()

  return useMutation<InvoiceDetail, Error, Record<string, unknown>>({
    mutationFn: async (body) => {
      return throwIfNotOk(
        await fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
    },
  })
}

/**
 * Sends an invoice to DIAN for processing.
 */
export function useSendInvoice() {
  const queryClient = useQueryClient()

  return useMutation<InvoiceDetail, Error, { id: number; body?: Record<string, unknown> }>({
    mutationFn: async ({ id, body }) => {
      const sp = new URLSearchParams()
      if (body?.storeId) sp.set('storeId', String(body.storeId))
      const qs = sp.toString()
      return throwIfNotOk(
        await fetch(`/api/invoices/${id}/send${qs ? `?${qs}` : ''}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        })
      )
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] })
      queryClient.invalidateQueries({ queryKey: ['invoice-status', id] })
    },
  })
}

/**
 * Emails an invoice to the customer.
 */
export function useEmailInvoice() {
  return useMutation<
    unknown,
    Error,
    { id: number; body?: Record<string, unknown> }
  >({
    mutationFn: async ({ id, body }) => {
      const sp = new URLSearchParams()
      if (body?.storeId) sp.set('storeId', String(body.storeId))
      const qs = sp.toString()
      return throwIfNotOk(
        await fetch(`/api/invoices/${id}/email${qs ? `?${qs}` : ''}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        })
      )
    },
  })
}
