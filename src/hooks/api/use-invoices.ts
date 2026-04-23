'use client'

import { useQuery } from '@tanstack/react-query'

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
