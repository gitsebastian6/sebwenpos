'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Customer } from '@/types'
import { throwIfNotOk } from './query-helpers'

interface UseCustomersParams {
  search?: string
  limit?: number
}

interface CustomersResponse {
  data: Customer[]
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

export function useCustomers(
  storeId: number | undefined | null,
  params?: UseCustomersParams
) {
  return useQuery<CustomersResponse>({
    queryKey: ['customers', storeId, params ?? {}],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      if (params?.search) sp.set('q', params.search)
      if (params?.limit) sp.set('limit', String(params.limit))

      const res = await fetch(`/api/customers?${sp.toString()}`)
      if (!res.ok) throw new Error('Error al cargar clientes')
      return res.json()
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useCreateCustomer() {
  const queryClient = useQueryClient()

  return useMutation<Customer, Error, { body: Record<string, unknown> }>({
    mutationFn: async ({ body }) => {
      return throwIfNotOk(
        await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient()

  return useMutation<Customer, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: async ({ id, body }) => {
      return throwIfNotOk(
        await fetch(`/api/customers/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function usePayCustomerDebt() {
  const queryClient = useQueryClient()

  return useMutation<any, Error, { id: number; body: { storeId: number; amount: number; note?: string } }>({
    mutationFn: async ({ id, body }) => {
      return throwIfNotOk(
        await fetch(`/api/customers/${id}/pay-debt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useResetCustomerDebts() {
  const queryClient = useQueryClient()

  return useMutation<any, Error, { body: Record<string, unknown> }>({
    mutationFn: async ({ body }) => {
      return throwIfNotOk(
        await fetch('/api/customers/reset-debts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}
