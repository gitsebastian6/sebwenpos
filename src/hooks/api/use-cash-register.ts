'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryFetch, mutationFetch, throwIfNotOk } from './query-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CashShiftUser {
  id: number
  fullName: string
  cedula?: string | null
}

export interface CashShift {
  id: number
  storeId: number
  userId: number
  user: CashShiftUser
  openingBalance: number
  closingBalance: number | null
  difference: number | null
  expectedCash: number | null
  countBreakdown: string | null
  status: 'OPEN' | 'CLOSED'
  notes: string | null
  openedAt: string
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CashShiftSummary {
  totalOrders: number
  totalSales: number
  totalTips: number
  cashSales: number
  otherSales: number
  byPayment: Record<string, { count: number; total: number; tips: number }>
}

export interface OpenShiftData {
  shift: CashShift
  orderCount: number
  totalSales: number
  totalTips: number
  cashSales: number
  otherSales: number
  creditSales: number
  cxcCollected: number
  pettyCashExpenses: number
  expectedCash: number
  byPayment: Record<string, { count: number; total: number; tips: number }>
  recentOrders: Array<{
    id: number
    orderNumber: string
    total: number
    paymentMethod: string
    status: string
    createdAt: string
  }>
}

export interface ShiftDetailData {
  shift: CashShift
  orderSummary: CashShiftSummary
  aggregatedProducts: Array<{
    productId: number | null
    serviceId: number | null
    name: string
    category: string | null
    sku: string | null
    quantity: number
    total: number
    isService: boolean
  }>
  orders: Array<{
    id: number
    orderNumber: string
    total: number
    subtotal: number
    tipAmount: number
    paymentMethod: string
    status: string
    createdAt: string
    customer: { id: number; name: string; phone: string | null } | null
    tableName: string | null
    items: Array<{
      id: number
      name: string
      sku: string | null
      category: string | null
      quantity: number
      unitPrice: number
      totalRow: number
      isService: boolean
    }>
  }>
}

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseShiftHistoryParams {
  from?: string
  to?: string
  limit?: number
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/**
 * Fetches currently open shifts for a store.
 */
export function useCurrentShift(storeId: number | undefined | null) {
  return useQuery<OpenShiftData[]>({
    queryKey: ['current-shift', storeId],
    queryFn: async () => {
      const data = await queryFetch<{ shifts: OpenShiftData[] }>(
        `/api/cash-register/current?storeId=${storeId}`
      )
      return data.shifts || []
    },
    enabled: !!storeId,
    staleTime: 10_000,
    refetchInterval: 30_000,
  })
}

/**
 * Fetches shift history for a store, optionally filtered by date range.
 */
export function useShiftHistory(
  storeId: number | undefined | null,
  params?: UseShiftHistoryParams
) {
  return useQuery<CashShift[]>({
    queryKey: ['shift-history', storeId, params ?? {}],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      sp.set('limit', String(params?.limit ?? 50))
      if (params?.from) sp.set('from', params.from)
      if (params?.to) sp.set('to', params.to)
      const data = await queryFetch<{ shifts: CashShift[] }>(
        `/api/cash-register?${sp.toString()}`
      )
      return data.shifts || []
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

/**
 * Fetches detail for a specific shift (with optional order breakdown).
 */
export function useShiftDetail(
  shiftId: number | undefined | null,
  storeId: number | undefined | null,
  includeOrders?: boolean
) {
  return useQuery<ShiftDetailData>({
    queryKey: ['shift-detail', shiftId, storeId, includeOrders],
    queryFn: async () => {
      const sp = new URLSearchParams()
      if (storeId) sp.set('storeId', String(storeId))
      if (includeOrders) sp.set('includeOrders', 'true')
      const qs = sp.toString()
      return queryFetch<ShiftDetailData>(
        `/api/cash-register/${shiftId}${qs ? `?${qs}` : ''}`
      )
    },
    enabled: !!shiftId,
    staleTime: 15_000,
  })
}

/**
 * Fetches shift data for printing (without orders).
 */
export function useShiftPrintData(
  shiftId: number | undefined | null,
  storeId: number | undefined | null
) {
  return useQuery<{ shift: CashShift; orderSummary: CashShiftSummary }>({
    queryKey: ['shift-print', shiftId, storeId],
    queryFn: async () => {
      return queryFetch<{ shift: CashShift; orderSummary: CashShiftSummary }>(
        `/api/cash-register/${shiftId}?storeId=${storeId}`
      )
    },
    enabled: !!shiftId,
    staleTime: 60_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

/**
 * Opens a new cash register shift.
 */
export function useOpenShift() {
  const queryClient = useQueryClient()

  return useMutation<unknown, Error, Record<string, unknown>>({
    mutationFn: async (body) => {
      return throwIfNotOk(
        await fetch('/api/cash-register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-shift'] })
      queryClient.invalidateQueries({ queryKey: ['shift-history'] })
    },
  })
}

/**
 * Closes an existing cash register shift.
 */
export function useCloseShift() {
  const queryClient = useQueryClient()

  return useMutation<
    { shift: CashShift },
    Error,
    { id: number; body: Record<string, unknown> }
  >({
    mutationFn: async ({ id, body }) => {
      const res = await fetch(`/api/cash-register/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const responseText = await res.text()
      let data: Record<string, unknown> | null = null
      try {
        data = JSON.parse(responseText)
      } catch {
        /* not JSON */
      }
      if (!res.ok || !data) {
        const errMsg = String(
          data?.error || `Error ${res.status}: ${responseText.slice(0, 100)}`
        )
        throw new Error(errMsg)
      }
      return data as unknown as { shift: CashShift }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-shift'] })
      queryClient.invalidateQueries({ queryKey: ['shift-history'] })
    },
  })
}

/**
 * Reopens a closed cash register shift.
 */
export function useReopenShift() {
  const queryClient = useQueryClient()

  return useMutation<unknown, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      return throwIfNotOk(
        await fetch(`/api/cash-register/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reopen' }),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-shift'] })
      queryClient.invalidateQueries({ queryKey: ['shift-history'] })
    },
  })
}

/**
 * Deletes a cash register shift.
 */
export function useDeleteShift() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      await throwIfNotOk(
        await fetch(`/api/cash-register/${id}`, { method: 'DELETE' })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-shift'] })
      queryClient.invalidateQueries({ queryKey: ['shift-history'] })
    },
  })
}
