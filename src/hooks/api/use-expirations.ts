'use client'

import { useQuery } from '@tanstack/react-query'
import { unwrapArray } from './query-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExpirationLot {
  id: number
  productId: number
  productName: string
  productSku: string | null
  productBarcode: string | null
  productCurrentStock: number
  productIsActive: boolean
  presentationName: string | null
  lotNumber: string | null
  expiryDate: string
  manufacturingDate: string | null
  quantityReceived: number
  returnedQuantity: number
  remainingInLot: number
  purchaseId: number
  purchaseConsecutive: string | null
  purchaseDate: string
  providerName: string | null
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/** Fetches every recorded lot with an expiry date for the store, soonest first. */
export function useExpirations(storeId: number | undefined | null) {
  return useQuery<ExpirationLot[]>({
    queryKey: ['expirations', storeId],
    queryFn: async () => {
      return unwrapArray<ExpirationLot>(
        await fetch(`/api/expirations?storeId=${storeId}`)
      )
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}
