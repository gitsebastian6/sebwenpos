'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { unwrapArray, throwIfNotOk } from './query-helpers'
import type { TaxBreakdownEntry } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuotationListItem {
  id: number
  quotationNumber: string
  customerName: string | null
  customerNit: string | null
  total: number
  status: string
  validUntil: string | null
  createdAt: string
  itemCount: number
}

export interface QuotationItem {
  id: number
  productId: number | null
  productName: string
  presentationId: number | null
  presentationName: string | null
  unitsPerPack: number
  quantity: number
  unitPrice: number
  totalRow: number
  taxCode: string | null
  taxRate: number
  taxAmount: number
  taxBase: number
  notes: string | null
}

export interface QuotationDetail {
  id: number
  quotationNumber: string
  customerName: string | null
  customerNit: string | null
  customerEmail: string | null
  customerPhone: string | null
  customerAddress: string | null
  total: number
  status: string
  validUntil: string | null
  createdAt: string
  updatedAt: string
  subtotal: number
  taxAmount: number
  taxBreakdown: TaxBreakdownEntry[] | null
  discountAmount: number
  discountType: string
  notes: string | null
  convertedToOrderId: number | null
  items: QuotationItem[]
}

interface ConvertQuotationResult {
  message: string
  orderNumber: string
  total: number
  orderId?: number
}

// ---------------------------------------------------------------------------
// Params interfaces
// ---------------------------------------------------------------------------

export interface UseQuotationsParams {
  q?: string
  status?: string
}



// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/**
 * Fetches the list of quotations for a store.
 *
 * Supports optional search (`q`) and status filtering.
 */
export function useQuotations(
  storeId: number | undefined | null,
  params?: UseQuotationsParams
) {
  return useQuery<QuotationListItem[]>({
    queryKey: ['quotations', storeId, params ?? {}],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      if (params?.q) sp.set('q', params.q)
      if (params?.status && params.status !== 'ALL') sp.set('status', params.status)

      return unwrapArray<QuotationListItem>(
        await fetch(`/api/quotations?${sp.toString()}`)
      )
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

/**
 * Fetches a single quotation by its ID, including line items.
 */
export function useQuotationDetail(
  id: number | undefined | null,
  storeId: number | undefined | null
) {
  return useQuery<QuotationDetail>({
    queryKey: ['quotation', id, storeId],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      const res = await fetch(`/api/quotations/${id}?${sp.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const message =
          body?.error ?? body?.message ?? `Error ${res.status}: ${res.statusText}`
        throw new Error(message)
      }
      return res.json()
    },
    enabled: !!id && !!storeId,
    staleTime: 15_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

/**
 * Creates a new quotation.
 *
 * @example
 * ```ts
 * const create = useCreateQuotation()
 * create.mutate({ body: { storeId, customerName, items: [...] } })
 * ```
 */
export function useCreateQuotation() {
  const queryClient = useQueryClient()

  return useMutation<QuotationDetail, Error, { body: Record<string, unknown> }>({
    mutationFn: async ({ body }) => {
      return throwIfNotOk(
        await fetch('/api/quotations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
    },
  })
}

/**
 * Updates an existing quotation by ID (e.g. cancellation).
 *
 * @example
 * ```ts
 * const update = useUpdateQuotation()
 * update.mutate({ id: 42, body: { status: 'CANCELLED', storeId: store.id } })
 * ```
 */
export function useUpdateQuotation() {
  const queryClient = useQueryClient()

  return useMutation<QuotationDetail, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: async ({ id, body }) => {
      const storeId = body.storeId as number
      const sp = new URLSearchParams()
      if (storeId) sp.set('storeId', String(storeId))
      return throwIfNotOk(
        await fetch(`/api/quotations/${id}?${sp.toString()}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
    },
  })
}

/**
 * Converts a quotation to a sale/order.
 *
 * @example
 * ```ts
 * const convert = useConvertQuotation()
 * convert.mutate({ id: 42, body: { storeId, paymentMethod: 'CASH' } })
 * ```
 */
export function useConvertQuotation() {
  const queryClient = useQueryClient()

  return useMutation<
    ConvertQuotationResult,
    Error,
    {
      id: number
      body: {
        storeId: number
        paymentMethod: string
      }
    }
  >({
    mutationFn: async ({ id, body }) => {
      return throwIfNotOk(
        await fetch(`/api/quotations/${id}/convert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      queryClient.invalidateQueries({ queryKey: ['quotation', id] })
    },
  })
}
