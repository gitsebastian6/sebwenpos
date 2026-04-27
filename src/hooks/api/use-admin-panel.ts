'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryFetch, mutationFetch } from './query-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminStoreOwner {
  fullName: string
  cedula: string
  phone: string
  email: string
  isActive: boolean
}

export interface AdminStoreStats {
  totalOrders: number
  totalStaff: number
  totalProducts: number
  totalCustomers: number
  totalRoles: number
}

export interface AdminStore {
  id: number
  name: string
  legalName: string | null
  nit: string | null
  city: string | null
  address: string | null
  plan: string
  planStartDate: string | null
  planExpiresAt: string | null
  isActive: boolean
  createdAt: string
  owner: AdminStoreOwner
  stats: AdminStoreStats
}

export interface AdminStoreDetail extends AdminStore {
  staff: Array<{
    id: number
    fullName: string | null
    cedula: string | null
    phone: string
    email: string | null
    roleName: string | null
    isActive: boolean
    createdAt: string
  }>
}

export interface AdminSummary {
  totalStores: number
  activeStores: number
  inactiveStores: number
  totalOrders: number
  totalUsers: number
}

interface AdminStoresResponse {
  stores: AdminStore[]
  summary: AdminSummary
}

export interface CreateStoreForm {
  storeName: string
  nit: string
  legalName: string
  city: string
  ownerFullName: string
  ownerCedula: string
  ownerDocumentType: string
  ownerPhone: string
  ownerEmail: string
  ownerPassword: string
  plan: string
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

const adminKeys = {
  all: ['admin'] as const,
  stores: () => [...adminKeys.all, 'stores'] as const,
  storeDetail: (id: number) => [...adminKeys.all, 'store-detail', id] as const,
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/**
 * Fetches all stores with summary stats for the admin panel.
 */
export function useAdminStores() {
  return useQuery<AdminStoresResponse>({
    queryKey: adminKeys.stores(),
    queryFn: () => queryFetch<AdminStoresResponse>('/api/admin/stores'),
    staleTime: 30_000,
  })
}

/**
 * Fetches detailed store info by ID (for the detail dialog).
 */
export function useAdminStoreDetail(id: number | null | undefined) {
  return useQuery<AdminStoreDetail>({
    queryKey: adminKeys.storeDetail(id!),
    queryFn: async () => {
      const result = await queryFetch<{ store: AdminStoreDetail }>(`/api/admin/stores/${id}`)
      return result.store ?? result as unknown as AdminStoreDetail
    },
    enabled: !!id,
    staleTime: 15_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

/**
 * Create a new store via POST /api/admin/stores.
 */
export function useCreateAdminStore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (form: CreateStoreForm) =>
      mutationFetch('/api/admin/stores', 'POST', form as unknown as Record<string, unknown>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminKeys.stores() })
    },
  })
}

/**
 * Update a store via PUT /api/admin/stores/:id.
 * Used for edit, toggle active, and reset password.
 */
export function useUpdateAdminStore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ storeId, body }: { storeId: number; body: Record<string, unknown> }) =>
      mutationFetch(`/api/admin/stores/${storeId}`, 'PUT', body),
    onSuccess: (_d, { storeId }) => {
      qc.invalidateQueries({ queryKey: adminKeys.stores() })
      qc.invalidateQueries({ queryKey: adminKeys.storeDetail(storeId) })
    },
  })
}
