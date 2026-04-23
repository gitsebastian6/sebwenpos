'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { throwIfNotOk } from './query-helpers'

interface UseInvoicesParams {
  status?: string
  from?: string
  to?: string
  q?: string
  page?: number
  limit?: number
}

interface InvoicesResponse {
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

export function useInvoices(
  storeId: number | undefined | null,
  params?: UseInvoicesParams
) {
  return useQuery<InvoicesResponse>({
    queryKey: ['invoices', storeId, params ?? {}],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      if (params?.status && params.status !== 'ALL') sp.set('status', params.status)
      if (params?.from) sp.set('from', params.from)
      if (params?.to) sp.set('to', params.to)
      if (params?.q) sp.set('q', params.q)
      if (params?.page) sp.set('page', String(params.page))
      if (params?.limit) sp.set('limit', String(params.limit))

      const res = await fetch(`/api/invoices?${sp.toString()}`)
      if (!res.ok) throw new Error('Error al cargar facturas')
      return res.json()
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

export function useInvoiceDetail(id: number | undefined | null, storeId: number | undefined | null) {
  return useQuery<any>({
    queryKey: ['invoice', id, storeId],
    queryFn: async () => {
      const res = await fetch(`/api/invoices/${id}?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error al cargar detalle de factura')
      return res.json()
    },
    enabled: !!id && !!storeId,
    staleTime: 15_000,
  })
}

export function useResolutionStatus(storeId: number | undefined | null) {
  return useQuery<any>({
    queryKey: ['invoice-resolution-status', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/invoices/resolution-status?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error al cargar estado de resolución')
      return res.json()
    },
    enabled: !!storeId,
    staleTime: 60_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useCreateInvoice() {
  const queryClient = useQueryClient()

  return useMutation<any, Error, { body: Record<string, unknown> }>({
    mutationFn: async ({ body }) => {
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
      queryClient.invalidateQueries({ queryKey: ['invoice-resolution-status'] })
    },
  })
}

export function useSendInvoice() {
  const queryClient = useQueryClient()

  return useMutation<any, Error, { id: number; storeId: number }>({
    mutationFn: async ({ id, storeId }) => {
      return throwIfNotOk(
        await fetch(`/api/invoices/${id}/send?storeId=${storeId}`, { method: 'POST' })
      )
    },
    onSuccess: (_data, { id, storeId }) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice', id, storeId] })
    },
  })
}

export function useEmailInvoice() {
  const queryClient = useQueryClient()

  return useMutation<any, Error, { id: number; storeId: number }>({
    mutationFn: async ({ id, storeId }) => {
      return throwIfNotOk(
        await fetch(`/api/invoices/${id}/email?storeId=${storeId}`, { method: 'POST' })
      )
    },
    onSuccess: (_data, { id, storeId }) => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id, storeId] })
    },
  })
}

export function useInvoicePdf() {
  return useMutation<Blob, Error, { id: number; storeId: number }>({
    mutationFn: async ({ id, storeId }) => {
      const res = await fetch(`/api/invoices/${id}/pdf?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error al generar PDF')
      return res.blob()
    },
  })
}

export function useInvoiceStatus() {
  const queryClient = useQueryClient()

  return useMutation<any, Error, { id: number; storeId: number }>({
    mutationFn: async ({ id, storeId }) => {
      return throwIfNotOk(
        await fetch(`/api/invoices/${id}/status?storeId=${storeId}`)
      )
    },
    onSuccess: (_data, { id, storeId }) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      queryClient.invalidateQueries({ queryKey: ['invoice', id, storeId] })
    },
  })
}
