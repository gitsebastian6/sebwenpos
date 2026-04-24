'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryFetch, mutationFetch, unwrapArray, throwIfNotOk } from './query-helpers'
import type { StoreListItem, PlanData, StoreDetail, StatsData } from '@/components/super-admin/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaymentReceiptData {
  id: number
  storeId: number
  subscriptionId?: number
  amount: number
  paymentMethod: string
  reference: string | null
  notes: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string
  reviewNotes: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  fileName: string
  fileSize: number
  fileType: string | null
  fileData?: string
  createdAt: string
  updatedAt: string
  store?: { id: number; name: string; nit: string | null; phone: string | null; user: { fullName: string | null; phone: string | null } }
  subscription?: { id: number; status: string; plan: { name: string; price: number }; endDate: string | null }
}

export interface SystemConfig {
  messagebird: {
    apiKey: string
    phoneNumber: string
    enabled: boolean
    testMode: boolean
    template: string
  }
}

export interface BranchData {
  id: number
  name: string
  legalName: string | null
  nit: string | null
  address: string | null
  phone: string | null
  createdAt: string
  user: { cedula: string; fullName: string | null }
  _count: { employees: number; products: number; orders: number }
}

export interface ParentSubInfo {
  planName: string | null
  status: string | null
  maxStores: number
  multiStoreEnabled: boolean
}

export interface BranchesResponse {
  branches: BranchData[]
  parentSubscription: ParentSubInfo | null
}

export interface SuperAdminReceiptParams {
  storeId?: number
  status?: string
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/** All stores list for super admin */
export function useSuperAdminStores() {
  return useQuery<StoreListItem[]>({
    queryKey: ['super-admin-stores'],
    queryFn: () => queryFetch<StoreListItem[]>('/api/super-admin/stores'),
    staleTime: 30_000,
  })
}

/** Platform statistics for super admin */
export function useSuperAdminStatistics(enabled: boolean = false) {
  return useQuery<StatsData>({
    queryKey: ['super-admin-statistics'],
    queryFn: () => queryFetch<StatsData>('/api/super-admin/statistics'),
    enabled,
    staleTime: 60_000,
  })
}

/** All subscription plans (super admin view) */
export function useSuperAdminPlans() {
  return useQuery<PlanData[]>({
    queryKey: ['super-admin-plans'],
    queryFn: async () => unwrapArray<PlanData>(await fetch('/api/super-admin/plans')),
    staleTime: 5 * 60_000,
  })
}

/** Store detail for super admin */
export function useSuperAdminStoreDetail(id: number | undefined | null) {
  return useQuery<StoreDetail>({
    queryKey: ['super-admin-store-detail', id],
    queryFn: () => queryFetch<StoreDetail>(`/api/super-admin/stores/${id}/detail`),
    enabled: !!id,
    staleTime: 15_000,
  })
}

/** System configuration */
export function useSystemConfig() {
  return useQuery<SystemConfig>({
    queryKey: ['system-config'],
    queryFn: () => queryFetch<SystemConfig>('/api/super-admin/system-config'),
    staleTime: 60_000,
  })
}

/** Super admin payment receipts with optional filters */
export function useSuperAdminPaymentReceipts(params?: SuperAdminReceiptParams, enabled: boolean = true) {
  const sp = new URLSearchParams()
  if (params?.storeId) sp.set('storeId', String(params.storeId))
  if (params?.status) sp.set('status', params.status)

  return useQuery<PaymentReceiptData[]>({
    queryKey: ['super-admin-payment-receipts', params],
    queryFn: () => queryFetch<PaymentReceiptData[]>(`/api/super-admin/payment-receipts?${sp.toString()}`),
    enabled,
    staleTime: 30_000,
  })
}

/** Single receipt detail for super admin */
export function useSuperAdminReceiptDetail(id: number | undefined | null) {
  return useQuery<PaymentReceiptData>({
    queryKey: ['super-admin-receipt-detail', id],
    queryFn: () => queryFetch<PaymentReceiptData>(`/api/super-admin/payment-receipts/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  })
}

/** Branches for a store */
export function useStoreBranches(storeId: number | undefined | null) {
  return useQuery<BranchesResponse>({
    queryKey: ['store-branches', storeId],
    queryFn: () => queryFetch<BranchesResponse>(`/api/super-admin/stores/${storeId}/branches`),
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

/** Seed default plans */
export function useSeedPlans() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, void>({
    mutationFn: () => fetch('/api/super-admin/plans/seed', { method: 'POST' }).then(throwIfNotOk),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['super-admin-plans'] }),
  })
}

/** Update a plan */
export function useUpdatePlan() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: ({ id, body }) =>
      mutationFetch(`/api/super-admin/plans/${id}`, 'PUT', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['super-admin-plans'] }),
  })
}

/** Update store info (super admin) */
export function useUpdateStoreAdmin() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: ({ id, body }) =>
      mutationFetch(`/api/super-admin/stores/${id}`, 'PUT', body),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['super-admin-stores'] })
      qc.invalidateQueries({ queryKey: ['super-admin-store-detail', id] })
    },
  })
}

/** Create a new store (super admin) */
export function useCreateStoreAdmin() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, Record<string, unknown>>({
    mutationFn: (body) =>
      fetch('/api/super-admin/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(throwIfNotOk),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin-stores'] })
      qc.invalidateQueries({ queryKey: ['super-admin-plans'] })
    },
  })
}

/** Delete a store */
export function useDeleteStoreAdmin() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { id: number }>({
    mutationFn: ({ id }) =>
      fetch(`/api/super-admin/stores/${id}`, { method: 'DELETE' }).then(throwIfNotOk),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['super-admin-stores'] }),
  })
}

/** Reset all products for a store */
export function useResetStoreProducts() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { id: number }>({
    mutationFn: ({ id }) =>
      fetch(`/api/super-admin/stores/${id}/reset-products`, { method: 'POST' }).then(throwIfNotOk),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['super-admin-store-detail', id] })
    },
  })
}

/** Update store subscription (plan change) */
export function useUpdateStoreSubscription() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: ({ id, body }) =>
      mutationFetch(`/api/super-admin/stores/${id}/subscription`, 'PUT', body),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['super-admin-store-detail', id] })
      qc.invalidateQueries({ queryKey: ['super-admin-stores'] })
    },
  })
}

/** Create a branch for a store */
export function useCreateBranch() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { storeId: number; body: Record<string, unknown> }>({
    mutationFn: ({ storeId, body }) =>
      mutationFetch(`/api/super-admin/stores/${storeId}/branches`, 'POST', body),
    onSuccess: (_d, { storeId }) => {
      qc.invalidateQueries({ queryKey: ['store-branches', storeId] })
      qc.invalidateQueries({ queryKey: ['super-admin-store-detail', storeId] })
    },
  })
}

/** Update a payment receipt */
export function useUpdateReceipt() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: ({ id, body }) =>
      mutationFetch(`/api/super-admin/payment-receipts/${id}`, 'PUT', body),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ['super-admin-payment-receipts'] })
      qc.invalidateQueries({ queryKey: ['super-admin-receipt-detail', id] })
    },
  })
}

/** Delete a payment receipt */
export function useDeleteReceipt() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { id: number }>({
    mutationFn: ({ id }) =>
      fetch(`/api/super-admin/payment-receipts/${id}`, { method: 'DELETE' }).then(throwIfNotOk),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['super-admin-payment-receipts'] }),
  })
}

/** Create a payment receipt (super admin) */
export function useCreateSuperAdminReceipt() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, Record<string, unknown>>({
    mutationFn: (body) =>
      fetch('/api/super-admin/payment-receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(throwIfNotOk),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['super-admin-payment-receipts'] })
      qc.invalidateQueries({ queryKey: ['super-admin-stores'] })
    },
  })
}

/** Update system config */
export function useUpdateSystemConfig() {
  return useMutation<unknown, Error, Record<string, unknown>>({
    mutationFn: (body) =>
      fetch('/api/super-admin/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(throwIfNotOk),
  })
}

/** Reset a user's password (super admin) */
export function useSuperAdminResetPassword() {
  return useMutation<unknown, Error, { userId: number; newPassword: string }>({
    mutationFn: ({ userId, newPassword }) =>
      fetch('/api/super-admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, newPassword }),
      }).then(throwIfNotOk),
  })
}

/** Check expired subscriptions */
export function useCheckExpired() {
  return useMutation<unknown, Error, void>({
    mutationFn: () =>
      fetch('/api/super-admin/subscriptions/check-expired', { method: 'POST' }).then(throwIfNotOk),
  })
}

/** Seed missing subscriptions */
export function useSeedMissingSubscriptions() {
  return useMutation<unknown, Error, void>({
    mutationFn: () =>
      fetch('/api/super-admin/subscriptions/seed-missing', { method: 'POST' }).then(throwIfNotOk),
  })
}
