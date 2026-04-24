'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryFetch, mutationFetch } from './query-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoreData {
  id: number
  name: string
  legalName: string | null
  nit: string | null
  address: string | null
  phone: string | null
  currencyCode: string
  divipolaCode: string | null
  cityName: string | null
  invoicePrefix: string | null
  resolutionNumber: string | null
  resolutionStartDate: string | null
  resolutionEndDate: string | null
  resolutionStartNumber: number | null
  resolutionEndNumber: number | null
  invoiceTestMode: boolean | null
  invoiceEnabled: boolean | null
  createdAt: string
}

export interface AvailableStore {
  id: number
  name: string
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/**
 * Fetches the current store's data.
 * Uses ?storeId query param.
 */
export function useStores(storeId: number | undefined | null) {
  return useQuery<StoreData>({
    queryKey: ['stores', storeId],
    queryFn: () => queryFetch<StoreData>(`/api/stores?storeId=${storeId}`),
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

/**
 * Fetches the list of available stores for the current user.
 */
export function useAvailableStores() {
  return useQuery<AvailableStore[]>({
    queryKey: ['available-stores'],
    queryFn: () => queryFetch<{ stores: AvailableStore[] }>('/api/stores/available').then(d => d.stores ?? []),
    staleTime: 60_000,
  })
}

/**
 * Fetches detailed store info by ID.
 */
export function useStoreDetail(id: number | undefined | null) {
  return useQuery<StoreData>({
    queryKey: ['store-detail', id],
    queryFn: () => queryFetch<StoreData>(`/api/stores/${id}`),
    enabled: !!id,
    staleTime: 15_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

/**
 * Updates the current store's data via PUT /api/stores?storeId.
 */
export function useUpdateStore() {
  const qc = useQueryClient()
  return useMutation<StoreData, Error, { storeId: number; body: Record<string, unknown> }>({
    mutationFn: ({ storeId, body }) =>
      mutationFetch<StoreData>('/api/stores', 'PUT', body, storeId),
    onSuccess: (_d, { storeId }) => {
      qc.invalidateQueries({ queryKey: ['stores', storeId] })
      qc.invalidateQueries({ queryKey: ['available-stores'] })
    },
  })
}
