'use client'

import { useQuery } from '@tanstack/react-query'
import { queryFetch } from './query-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LedgerAccount {
  id: number
  name: string
  type: string
  balance: number
  description: string | null
  isActive: boolean
  storeId: number
  createdAt: string
  updatedAt: string
}

export interface JournalEntry {
  id: number
  accountId: number
  accountName: string
  accountType: string
  direction: 'DEBIT' | 'CREDIT'
  amount: number
  description: string | null
  referenceType: string | null
  referenceId: number | null
  createdAt: string
}

export interface LedgerEntriesResponse {
  entries: JournalEntry[]
  totals: { debits: number; credits: number }
}

export interface LedgerAccountsResponse {
  accounts: LedgerAccount[]
}

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

export interface UseMovementsParams {
  accountId?: string
  from?: string
  to?: string
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/**
 * Fetches the chart of accounts (ledger accounts) for a store.
 */
export function useAccounts(storeId: number | undefined | null) {
  return useQuery<LedgerAccount[]>({
    queryKey: ['accounts', storeId],
    queryFn: async () => {
      const data = await queryFetch<LedgerAccountsResponse>(
        `/api/ledger?storeId=${storeId}&type=accounts`
      )
      return data.accounts || []
    },
    enabled: !!storeId,
    staleTime: 60_000,
  })
}

/**
 * Fetches journal entries for the ledger, optionally filtered by account and date range.
 */
export function useMovements(
  storeId: number | undefined | null,
  params?: UseMovementsParams
) {
  return useQuery<LedgerEntriesResponse>({
    queryKey: ['movements', storeId, params ?? {}],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId), type: 'entries' })
      if (params?.accountId && params.accountId !== 'all') {
        sp.set('accountId', params.accountId)
      }
      if (params?.from) sp.set('from', params.from)
      if (params?.to) sp.set('to', params.to)
      return queryFetch<LedgerEntriesResponse>(`/api/ledger?${sp.toString()}`)
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}
