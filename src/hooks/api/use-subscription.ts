'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryFetch, mutationFetch, unwrapArray } from './query-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlanLimits {
  maxStores: number
  maxEmployees: number
  maxProducts: number
  features: Record<string, boolean>
}

export interface SubscriptionCurrent {
  hasSubscription: boolean
  subscriptionId?: number
  subscriptionStatus?: string
  planId?: number
  planName?: string
  planPrice?: number
  startDate?: string
  endDate?: string | null
  trialEndDate?: string | null
  graceEndDate?: string | null
  graceDaysRemaining?: number | null
  billingPeriod?: string
  daysRemaining?: number | null
  planLimits?: PlanLimits | null
}

export interface PlanOption {
  id: number
  name: string
  description: string | null
  price: number
  maxStores: number
  maxEmployees: number
  maxProducts: number
  features: Record<string, boolean>
  isActive: boolean
}

export interface SubscriptionHistoryItem {
  id: number
  eventType: string
  eventLabel: string
  previousStatus: string | null
  newStatus: string | null
  previousPlanName: string | null
  newPlanName: string | null
  description: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export interface BillingRecord {
  id: number
  invoiceNumber: string
  planName: string
  billingPeriod: string
  amount: number
  amountFormatted: string
  prorationCredit: number
  prorationCreditFormatted: string | null
  netAmount: number
  netAmountFormatted: string
  status: string
  statusLabel: string
  paymentMethod: string | null
  periodStart: string
  periodEnd: string
  notes: string | null
  createdAt: string
}

export interface BillingHistory {
  items: BillingRecord[]
  summary: {
    totalBilled: number
    totalBilledFormatted: string
    totalPaid: number
    totalPaidFormatted: string
    totalCredits: number
    totalCreditsFormatted: string
    recordCount: number
  }
}

export interface ProrationInfo {
  hasCredit: boolean
  currentPlan: {
    name: string
    billingPrice: number
    billingPeriod: string
    daysRemaining: number
  }
  proration: {
    unusedDays: number
    creditAmount: number
    dailyRate: number
  } | null
  pricing: Array<{
    period: string
    label: string
    months: number
    discount: number
    fullPrice: number
    discountedPrice: number
    prorationCredit: number
    adjustedPrice: number
  }>
}

export interface ReceiptItem {
  id: number
  fileName: string
  amount: number
  paymentMethod: string
  reference: string | null
  notes: string | null
  status: string
  reviewNotes: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
}

export interface FeatureCheck {
  enabled: boolean
  planName: string
}

export interface SubscriptionAlert {
  type: string
  message: string
  severity: 'info' | 'warning' | 'error'
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/** Current subscription info for a store */
export function useCurrentSubscription(storeId: number | undefined | null, options?: { refetchInterval?: number }) {
  return useQuery<SubscriptionCurrent>({
    queryKey: ['subscription-current', storeId],
    queryFn: () => queryFetch<SubscriptionCurrent>(`/api/subscription/current?storeId=${storeId}`),
    enabled: !!storeId,
    staleTime: 60_000,
    refetchInterval: options?.refetchInterval,
  })
}

/** All active subscription plans */
export function useSubscriptionPlans() {
  return useQuery<PlanOption[]>({
    queryKey: ['subscription-plans'],
    queryFn: async () => unwrapArray<PlanOption>(await fetch('/api/subscription/plans')),
    staleTime: 5 * 60_000,
  })
}

/** Subscription event history */
export function useSubscriptionHistory(storeId: number | undefined | null) {
  return useQuery<SubscriptionHistoryItem[]>({
    queryKey: ['subscription-history', storeId],
    queryFn: () => queryFetch<SubscriptionHistoryItem[]>(`/api/subscription/history?storeId=${storeId}`),
    enabled: !!storeId,
    staleTime: 60_000,
  })
}

/** Billing history with summary */
export function useBillingHistory(storeId: number | undefined | null) {
  return useQuery<BillingHistory>({
    queryKey: ['billing-history', storeId],
    queryFn: () => queryFetch<BillingHistory>(`/api/subscription/billing-history?storeId=${storeId}`),
    enabled: !!storeId,
    staleTime: 60_000,
  })
}

/** Subscription alerts for a store */
export function useSubscriptionAlerts(storeId: number | undefined | null) {
  return useQuery<SubscriptionAlert[]>({
    queryKey: ['subscription-alerts', storeId],
    queryFn: () => queryFetch<SubscriptionAlert[]>(`/api/subscription/alerts?storeId=${storeId}`),
    enabled: !!storeId,
    staleTime: 60_000,
  })
}

/** Proration preview when changing plans */
export function useProration(storeId: number | undefined | null, planId: number | undefined | null) {
  return useQuery<ProrationInfo>({
    queryKey: ['subscription-proration', storeId, planId],
    queryFn: () => queryFetch<ProrationInfo>(`/api/subscription/proration?storeId=${storeId}&targetPlanId=${planId}`),
    enabled: !!storeId && !!planId,
    staleTime: 30_000,
  })
}

/** Payment receipts for a store */
export function usePaymentReceipts(storeId: number | undefined | null) {
  return useQuery<ReceiptItem[]>({
    queryKey: ['payment-receipts', storeId],
    queryFn: async () => unwrapArray<ReceiptItem>(await fetch(`/api/payment-receipts?storeId=${storeId}`)),
    enabled: !!storeId,
    staleTime: 60_000,
  })
}

/** Check if a feature is available for a store */
export function useCheckFeature(feature: string | undefined | null, storeId: number | undefined | null) {
  return useQuery<FeatureCheck>({
    queryKey: ['feature-check', feature, storeId],
    queryFn: () => queryFetch<FeatureCheck>(`/api/subscription/check-feature?feature=${feature}&storeId=${storeId}`),
    enabled: !!feature && !!storeId,
    staleTime: 60_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

/** Cancel subscription */
export function useCancelSubscription() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { storeId: number; cancelReason: string }>({
    mutationFn: ({ storeId, cancelReason }) =>
      mutationFetch('/api/subscription/cancel', 'POST', { cancelReason }, storeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscription'] })
      qc.invalidateQueries({ queryKey: ['payment-receipts'] })
    },
  })
}

/** Reactivate subscription */
export function useReactivateSubscription() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { storeId: number; body: Record<string, unknown> }>({
    mutationFn: ({ storeId, body }) =>
      mutationFetch('/api/subscription/reactivate', 'POST', body, storeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscription'] })
    },
  })
}

/** Upload a payment receipt */
export function useCreatePaymentReceipt() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { storeId: number; body: Record<string, unknown> }>({
    mutationFn: ({ storeId, body }) =>
      mutationFetch('/api/payment-receipts', 'POST', body, storeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-receipts'] })
      qc.invalidateQueries({ queryKey: ['subscription-current'] })
    },
  })
}

/** Attach a file to an existing pending receipt */
export function useAttachReceiptFile() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { receiptId: number; body: Record<string, unknown> }>({
    mutationFn: ({ receiptId, body }) =>
      mutationFetch(`/api/payment-receipts/${receiptId}`, 'PATCH', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-receipts'] })
      qc.invalidateQueries({ queryKey: ['subscription-current'] })
    },
  })
}
