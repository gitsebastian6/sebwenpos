'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { mutationFetch, queryFetch } from './query-helpers'
import { toast } from 'sonner'
import type {
  SubscriptionCurrent,
  PlanOption,
  SubscriptionHistoryItem,
  BillingHistory,
  ReceiptItem,
  ProrationInfo,
} from './use-subscription'

// ─── Store mutations (shared by business, invoice, divipola, dian tabs) ───

export function useUpdateStore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ storeId, data }: { storeId: number; data: Record<string, unknown> }) =>
      mutationFetch(`/api/stores?storeId=${storeId}`, 'PUT', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['store'] }),
  })
}

// ─── User mutation ───

export function useUpdateUser() {
  return useMutation({
    mutationFn: ({ userId, data }: { userId: number; data: Record<string, unknown> }) =>
      mutationFetch(`/api/users?userId=${userId}`, 'PUT', data),
  })
}

// ─── Security Question ───

export function useSecurityQuestion(userId: string | undefined) {
  return useQuery({
    queryKey: ['security-question', userId],
    queryFn: () => queryFetch<{ hasQuestion: boolean; question: string | null }>(
      `/api/auth/security-question?userId=${userId}`
    ),
    enabled: !!userId,
    staleTime: 5 * 60_000,
  })
}

export function useUpdateSecurityQuestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, question, answer }: { userId: string; question: string; answer: string }) =>
      mutationFetch('/api/auth/security-question', 'PUT', { userId, question, answer }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['security-question', variables.userId] })
      qc.setQueryData(['security-question', variables.userId], {
        hasQuestion: true,
        question: _data?.question ?? null,
      })
    },
  })
}

// ─── Subscription ───

export function useSubscriptionCurrent(storeId: number | undefined) {
  return useQuery<SubscriptionCurrent>({
    queryKey: ['subscription-current', storeId],
    queryFn: () => queryFetch<SubscriptionCurrent>(`/api/subscription/current?storeId=${storeId}`),
    enabled: !!storeId,
    staleTime: 10_000, // auto-refresh every 10s for real-time subscription status
    refetchOnWindowFocus: true,
  })
}

export function usePaymentReceipts(storeId: number | undefined) {
  return useQuery<ReceiptItem[]>({
    queryKey: ['payment-receipts', storeId],
    queryFn: () => queryFetch<ReceiptItem[]>(`/api/payment-receipts?storeId=${storeId}`),
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

export function useSubscriptionPlans() {
  return useQuery<PlanOption[]>({
    queryKey: ['subscription-plans'],
    queryFn: () => queryFetch<PlanOption[]>('/api/subscription/plans'),
    staleTime: 10 * 60_000,
  })
}

export function useSubscriptionHistory(storeId: number | undefined) {
  return useQuery<SubscriptionHistoryItem[]>({
    queryKey: ['subscription-history', storeId],
    queryFn: () => queryFetch<SubscriptionHistoryItem[]>(`/api/subscription/history?storeId=${storeId}`),
    enabled: !!storeId,
    staleTime: 60_000,
  })
}

export function useBillingHistory(storeId: number | undefined) {
  return useQuery<BillingHistory>({
    queryKey: ['billing-history', storeId],
    queryFn: () => queryFetch<BillingHistory>(`/api/subscription/billing-history?storeId=${storeId}`),
    enabled: !!storeId,
    staleTime: 60_000,
  })
}

export function useUploadPaymentReceipt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ storeId, data }: { storeId: number; data: Record<string, unknown> }) =>
      mutationFetch(`/api/payment-receipts?storeId=${storeId}`, 'POST', data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['payment-receipts', variables.storeId] })
      qc.invalidateQueries({ queryKey: ['subscription-current', variables.storeId] })
    },
  })
}

export function useCancelSubscription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ storeId, cancelReason }: { storeId: number; cancelReason: string }) =>
      mutationFetch(`/api/subscription/cancel?storeId=${storeId}`, 'POST', { cancelReason }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['subscription-current', variables.storeId] })
      qc.invalidateQueries({ queryKey: ['subscription-history', variables.storeId] })
      qc.invalidateQueries({ queryKey: ['billing-history', variables.storeId] })
    },
  })
}

export function useSubscriptionProration(storeId: number | undefined, targetPlanId: number | null) {
  return useQuery<ProrationInfo>({
    queryKey: ['subscription-proration', storeId, targetPlanId],
    queryFn: () => queryFetch<ProrationInfo>(
      `/api/subscription/proration?storeId=${storeId}&targetPlanId=${targetPlanId}`
    ),
    enabled: !!storeId && !!targetPlanId,
    staleTime: 60_000,
  })
}

// ─── Electronic Invoicing ───

export interface EInvoicingConfigResponse {
  error?: string
  invoiceEnabled?: boolean
  invoiceProvider?: string
  softwareId?: string | null
  softwarePin?: string | null
  providerConfig?: Record<string, unknown>
  [key: string]: unknown
}

export interface EInvoicingCertStatus {
  uploaded: boolean
  fileName: string | null
  fileSize: number
  lastModified: string | null
}

export function useEInvoicingConfig(storeId: number | undefined) {
  return useQuery<EInvoicingConfigResponse>({
    queryKey: ['e-invoicing-config', storeId],
    queryFn: () => queryFetch<EInvoicingConfigResponse>(`/api/electronic-invoicing/config?storeId=${storeId}`),
    enabled: !!storeId,
    staleTime: 60_000,
  })
}

export function useEInvoicingCertStatus(storeId: number | undefined) {
  return useQuery<EInvoicingCertStatus>({
    queryKey: ['e-invoicing-cert-status', storeId],
    queryFn: () => queryFetch<EInvoicingCertStatus>(`/api/electronic-invoicing/upload-certificate?storeId=${storeId}`),
    enabled: !!storeId,
    staleTime: 60_000,
  })
}

export function useSaveEInvoicingConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      mutationFetch('/api/electronic-invoicing/config', 'POST', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['e-invoicing-config'] })
      qc.invalidateQueries({ queryKey: ['store'] })
    },
  })
}

export function useUploadCertificate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ storeId, file }: { storeId: number; file: File }) => {
      const formData = new FormData()
      formData.append('storeId', storeId.toString())
      formData.append('certificate', file)
      const res = await fetch('/api/electronic-invoicing/upload-certificate', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.error || 'Error al subir certificado')
      }
      return res.json()
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['e-invoicing-cert-status', variables.storeId] })
      qc.invalidateQueries({ queryKey: ['store'] })
    },
  })
}

export function useDeleteCertificate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ storeId }: { storeId: number }) =>
      mutationFetch(`/api/electronic-invoicing/upload-certificate?storeId=${storeId}`, 'DELETE'),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['e-invoicing-cert-status', variables.storeId] })
      qc.invalidateQueries({ queryKey: ['store'] })
    },
  })
}
