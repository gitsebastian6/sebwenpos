'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { throwIfNotOk } from './query-helpers'

// ---------------------------------------------------------------------------
// Query hooks — POS data
// ---------------------------------------------------------------------------

/**
 * Fetch active products for POS display.
 */
export function usePosProducts(storeId: number | undefined | null) {
  return useQuery<any[]>({
    queryKey: ['pos-products', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/products?storeId=${storeId}&active=true&limit=500`)
      if (!res.ok) throw new Error('Error al cargar productos')
      const json = await res.json()
      return Array.isArray(json) ? json : (json.data ?? [])
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

/**
 * Fetch active services for POS display.
 */
export function usePosServices(storeId: number | undefined | null) {
  return useQuery<any[]>({
    queryKey: ['pos-services', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/services?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error al cargar servicios')
      const data = await res.json()
      return Array.isArray(data) ? data.filter((s: any) => s.isActive) : data
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

/**
 * Fetch current open cash register shifts for POS.
 */
export function usePosCashRegister(storeId: number | undefined | null) {
  return useQuery<any>({
    queryKey: ['pos-cash-register', storeId],
    queryFn: async () => {
      const res = await fetch(`/api/cash-register/current?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error cargando cajas')
      return res.json()
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

/**
 * Fetch recent completed orders for POS display.
 */
export function usePosRecentSales(storeId: number | undefined | null) {
  return useQuery<any[]>({
    queryKey: ['pos-recent-sales', storeId],
    queryFn: async () => {
      // Inicio del día LOCAL (medianoche en la zona horaria del navegador).
      // Se envía como timestamp ISO completo (con offset de zona) para que el
      // backend lo reconstruya como instante absoluto. Usar solo `YYYY-MM-DD`
      // en UTC provoca un desfase de zona horaria: `new Date("2026-08-23")` se
      // interpreta como medianoche UTC, que en Colombia (UTC-5) son las 19:00
      // del día anterior, haciendo que ventas de hoy queden fuera del filtro.
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const sp = new URLSearchParams({
        storeId: String(storeId),
        status: 'COMPLETED',
        from: startOfDay.toISOString(),
        expand: 'items',
      })
      const res = await fetch(`/api/orders?${sp.toString()}`)
      if (!res.ok) throw new Error('Error al cargar ventas recientes')
      const json = await res.json()
      const data = Array.isArray(json) ? json : (json.data ?? [])
      return data.slice(0, 50)
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

/**
 * Fetch a single order detail for POS returns.
 */
export function useOrderDetail(orderId: number | undefined | null, storeId: number | undefined | null) {
  return useQuery<any>({
    queryKey: ['order-detail', orderId, storeId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error al cargar detalle de la venta')
      return res.json()
    },
    enabled: !!orderId && !!storeId,
    staleTime: 15_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks — Orders & Invoices
// ---------------------------------------------------------------------------

/**
 * Create a new order (POS sale).
 */
export function useCreateOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      return throwIfNotOk(
        await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pos-recent-sales'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['pos-cash-register'] })
    },
  })
}

/**
 * Create an electronic invoice from an order.
 */
export function useCreateInvoice() {
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      return throwIfNotOk(
        await fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
  })
}

/**
 * Process a return for a POS order.
 */
export function useReturnOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, ...body }: { orderId: number } & Record<string, unknown>) => {
      return throwIfNotOk(
        await fetch(`/api/orders/${orderId}/return`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['order-detail', variables.orderId] })
      queryClient.invalidateQueries({ queryKey: ['pos-recent-sales'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}
