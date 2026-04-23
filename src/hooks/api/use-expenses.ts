'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryFetch, throwIfNotOk } from './query-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Expense {
  id: number
  storeId: number
  category: string
  description: string
  amount: number
  date: string
  notes: string | null
  createdById: number
  createdBy: { id: number; fullName: string } | null
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseExpensesParams {
  from?: string
  to?: string
  category?: string
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/**
 * Fetches expenses for a store, optionally filtered by date range and category.
 */
export function useExpenses(
  storeId: number | undefined | null,
  params?: UseExpensesParams
) {
  return useQuery<Expense[]>({
    queryKey: ['expenses', storeId, params ?? {}],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      if (params?.from) sp.set('from', params.from)
      if (params?.to) sp.set('to', params.to)
      if (params?.category) sp.set('category', params.category)
      const data = await queryFetch<{ expenses: Expense[] }>(
        `/api/expenses?${sp.toString()}`
      )
      return data.expenses || []
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

/**
 * Creates a new expense.
 */
export function useCreateExpense() {
  const queryClient = useQueryClient()

  return useMutation<Expense, Error, Record<string, unknown>>({
    mutationFn: async (body) => {
      return throwIfNotOk(
        await fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

/**
 * Updates an existing expense by ID.
 */
export function useUpdateExpense() {
  const queryClient = useQueryClient()

  return useMutation<
    Expense,
    Error,
    { id: number; body: Record<string, unknown> }
  >({
    mutationFn: async ({ id, body }) => {
      return throwIfNotOk(
        await fetch(`/api/expenses/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

/**
 * Deletes an expense by ID.
 */
export function useDeleteExpense() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      await throwIfNotOk(
        await fetch(`/api/expenses/${id}`, { method: 'DELETE' })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}
