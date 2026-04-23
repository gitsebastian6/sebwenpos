'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { throwIfNotOk } from './query-helpers'

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/**
 * Fetch all bar tables for a store (includes active session summary).
 */
export function useTables(storeId: number | undefined | null) {
  return useQuery<any[]>({
    queryKey: ['tables', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/tables?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error cargando mesas')
      return res.json()
    },
    enabled: !!storeId,
    staleTime: 15_000,
  })
}

/**
 * Fetch a single table session by ID (with comanda items + orders).
 */
export function useTableSession(sessionId: number | undefined | null) {
  return useQuery<any>({
    queryKey: ['table-session', sessionId],
    queryFn: async () => {
      const res = await fetch(`/api/tables/sessions/${sessionId}`)
      if (!res.ok) throw new Error('Error cargando sesión')
      return res.json()
    },
    enabled: !!sessionId,
    staleTime: 10_000,
  })
}

/**
 * Fetch current open cash register shifts for a store.
 */
export function useCashRegisters(storeId: number | undefined | null) {
  return useQuery<any>({
    queryKey: ['cash-registers', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/cash-register/current?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error cargando cajas')
      return res.json()
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks — Tables CRUD
// ---------------------------------------------------------------------------

export function useCreateTable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      return throwIfNotOk(
        await fetch('/api/tables', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
    },
  })
}

export function useUpdateTable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number } & Record<string, unknown>) => {
      return throwIfNotOk(
        await fetch(`/api/tables/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
    },
  })
}

export function useDeleteTable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await throwIfNotOk(await fetch(`/api/tables/${id}`, { method: 'DELETE' }))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks — Sessions
// ---------------------------------------------------------------------------

export function useCreateSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      return throwIfNotOk(
        await fetch('/api/tables/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
    },
  })
}

export function useUpdateSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number } & Record<string, unknown>) => {
      return throwIfNotOk(
        await fetch(`/api/tables/sessions/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['table-session', variables.id] })
    },
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks — Session Payment
// ---------------------------------------------------------------------------

export function usePaySession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ sessionId, ...body }: { sessionId: number } & Record<string, unknown>) => {
      return throwIfNotOk(
        await fetch(`/api/tables/sessions/${sessionId}/pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['table-session', variables.sessionId] })
      queryClient.invalidateQueries({ queryKey: ['cash-registers'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks — Comanda items
// ---------------------------------------------------------------------------

export function useComandaAddItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ sessionId, ...body }: { sessionId: number } & Record<string, unknown>) => {
      return throwIfNotOk(
        await fetch(`/api/tables/sessions/${sessionId}/comanda`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['table-session', variables.sessionId] })
    },
  })
}

export function useComandaUpdateItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ sessionId, ...body }: { sessionId: number } & Record<string, unknown>) => {
      return throwIfNotOk(
        await fetch(`/api/tables/sessions/${sessionId}/comanda`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tables'] })
      queryClient.invalidateQueries({ queryKey: ['table-session', variables.sessionId] })
    },
  })
}
