'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { unwrapArray, throwIfNotOk } from './query-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProviderOption {
  id: number
  name: string
  nit?: string | null
  dv?: string | null
  regime: string
  autoretainer: boolean
  paymentTerms: string
  isActive: boolean
  totalDebt?: number
}

export interface ProductOption {
  id: number
  name: string
  sku?: string | null
  costPrice: number
  currentStock: number
  invima?: string | null
  isActive: boolean
  category?: { id: number; name: string } | null
}

export interface PurchaseItemData {
  id: number
  purchaseId: number
  productId: number
  product: {
    id: number
    name: string
    sku?: string | null
    costPrice?: number
    currentStock?: number
    category?: { id: number; name: string } | null
  } | null
  quantity: number
  returnedQuantity: number
  unitCost: number
  ivaRate: number
  ivaAmount: number
  discountAmount: number
  lotNumber?: string | null
  expiryDate?: string | null
  manufacturingDate?: string | null
  total: number
}

export interface PurchasePayment {
  id: number
  amount: number
  paymentMethod: string
  reference?: string | null
  notes?: string | null
  createdBy?: { id: number; fullName: string; cedula?: string | null } | null
  createdAt: string
}

export interface Purchase {
  id: number
  storeId: number
  providerId: number | null
  provider: {
    id: number
    name: string
    nit?: string | null
    regime?: string
    paymentTerms?: string
    autoretainer?: boolean
  } | null
  invoiceNumber: string | null
  documentType: string
  consecutiveNumber: string | null
  date: string
  dueDate: string | null
  paymentTerms: string
  paymentStatus: string
  amountPaid: number
  subtotal: number
  totalIva: number
  totalReteFuente: number
  totalReteIca: number
  totalReteIva: number
  totalDiscount: number
  notes: string | null
  total: number
  status: string
  createdById?: number | null
  itemCount: number
  purchaseItems: PurchaseItemData[]
  purchasePayments?: PurchasePayment[]
  _payments?: { count: number; total: number }
  createdAt: string
  updatedAt: string
}

export type StatusFilter = 'ALL' | 'COMPLETED' | 'PENDING' | 'CANCELLED'

// ---------------------------------------------------------------------------
// Params interfaces
// ---------------------------------------------------------------------------

export interface UsePurchasesParams {
  q?: string
  status?: StatusFilter
  limit?: number
}



// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/**
 * Fetches the list of purchases for a store.
 *
 * Supports optional search (`q`), status filtering, and a limit (defaults to
 * 200 so that the client-side can show all relevant records without extra
 * pagination).
 */
export function usePurchases(
  storeId: number | undefined | null,
  params?: UsePurchasesParams
) {
  return useQuery<Purchase[]>({
    queryKey: ['purchases', storeId, params ?? {}],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      sp.set('limit', String(params?.limit ?? 200))
      if (params?.q) sp.set('q', params.q)
      if (params?.status && params.status !== 'ALL')
        sp.set('status', params.status)

      return unwrapArray<Purchase>(
        await fetch(`/api/purchases?${sp.toString()}`)
      )
    },
    enabled: !!storeId,
    staleTime: 30_000,
  })
}

/**
 * Fetches a single purchase by its ID, including line items and payments.
 */
export function usePurchaseDetail(purchaseId: number | undefined | null) {
  return useQuery<Purchase>({
    queryKey: ['purchase', purchaseId],
    queryFn: async () => {
      const res = await fetch(`/api/purchases/${purchaseId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const message =
          body?.error ?? body?.message ?? `Error ${res.status}: ${res.statusText}`
        throw new Error(message)
      }
      return res.json()
    },
    enabled: !!purchaseId,
    staleTime: 15_000,
  })
}

/**
 * Fetches providers available for purchase selection.
 * When `activeOnly` is true (default), only active providers are returned.
 */
export function usePurchaseProviders(
  storeId: number | undefined | null,
  activeOnly: boolean = true
) {
  return useQuery<ProviderOption[]>({
    queryKey: ['providers', storeId, activeOnly],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      if (activeOnly) sp.set('active', 'true')

      return unwrapArray<ProviderOption>(
        await fetch(`/api/providers?${sp.toString()}`)
      )
    },
    enabled: !!storeId,
    staleTime: 60_000,
  })
}

/**
 * Fetches products that can be added as purchase line-items.
 * Uses a generous limit (500) so the product picker doesn't need to paginate.
 */
export function usePurchaseProducts(
  storeId: number | undefined | null
) {
  return useQuery<ProductOption[]>({
    queryKey: ['purchase-products', storeId],
    queryFn: async () => {
      const sp = new URLSearchParams({ storeId: String(storeId) })
      sp.set('limit', '500')

      return unwrapArray<ProductOption>(
        await fetch(`/api/products?${sp.toString()}`)
      )
    },
    enabled: !!storeId,
    staleTime: 60_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

/**
 * Creates a new purchase.
 *
 * @example
 * ```ts
 * const create = useCreatePurchase()
 * create.mutate({ body: { storeId, providerId, items: [...] } })
 * ```
 */
export function useCreatePurchase() {
  const queryClient = useQueryClient()

  return useMutation<Purchase, Error, { body: Record<string, unknown> }>({
    mutationFn: async ({ body }) => {
      return throwIfNotOk(
        await fetch('/api/purchases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
    },
  })
}

/**
 * Updates an existing purchase by ID.
 *
 * @example
 * ```ts
 * const update = useUpdatePurchase()
 * update.mutate({ id: 42, body: { notes: 'updated' } })
 * ```
 */
export function useUpdatePurchase() {
  const queryClient = useQueryClient()

  return useMutation<Purchase, Error, { id: number; body: Record<string, unknown> }>({
    mutationFn: async ({ id, body }) => {
      return throwIfNotOk(
        await fetch(`/api/purchases/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['purchase', id] })
    },
  })
}

/**
 * Deletes (cancels) a purchase by ID.
 *
 * @example
 * ```ts
 * const remove = useDeletePurchase()
 * remove.mutate({ id: 42 })
 * ```
 */
export function useDeletePurchase() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { id: number }>({
    mutationFn: async ({ id }) => {
      await throwIfNotOk(await fetch(`/api/purchases/${id}`, { method: 'DELETE' }))
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['purchase', id] })
    },
  })
}

/**
 * Registers a payment against a purchase.
 *
 * @example
 * ```ts
 * const pay = usePurchasePayment()
 * pay.mutate({
 *   id: 42,
 *   body: { amount: 500000, paymentMethod: 'CASH', reference: 'REC-001' }
 * })
 * ```
 */
export function usePurchasePayment() {
  const queryClient = useQueryClient()

  return useMutation<
    PurchasePayment,
    Error,
    {
      id: number
      body: {
        amount: number
        paymentMethod: string
        reference?: string
        notes?: string
      }
    }
  >({
    mutationFn: async ({ id, body }) => {
      return throwIfNotOk(
        await fetch(`/api/purchases/${id}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['purchase', id] })
    },
  })
}

/**
 * Records a return (devolución) for a purchase.
 *
 * @example
 * ```ts
 * const ret = usePurchaseReturn()
 * ret.mutate({
 *   id: 42,
 *   body: {
 *     items: [{ itemId: 1, quantity: 2 }],
 *     reason: 'Producto defectuoso'
 *   }
 * })
 * ```
 */
export function usePurchaseReturn() {
  const queryClient = useQueryClient()

  return useMutation<
    unknown,
    Error,
    {
      id: number
      body: {
        items: Array<{ itemId: number; quantity: number }>
        reason?: string
      }
    }
  >({
    mutationFn: async ({ id, body }) => {
      return throwIfNotOk(
        await fetch(`/api/purchases/${id}/return`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
      queryClient.invalidateQueries({ queryKey: ['purchase', id] })
    },
  })
}

/**
 * Imports a purchase from an XML document (e.g. DIAN electronic invoice).
 *
 * @example
 * ```ts
 * const xmlImport = useXmlImportPurchase()
 * xmlImport.mutate({ body: { xmlContent: '...' } })
 * ```
 */
export function useXmlImportPurchase() {
  const queryClient = useQueryClient()

  return useMutation<Purchase, Error, { body: Record<string, unknown> }>({
    mutationFn: async ({ body }) => {
      return throwIfNotOk(
        await fetch('/api/purchases/xml-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] })
    },
  })
}
