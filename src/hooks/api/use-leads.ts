'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryFetch, mutationFetch, throwIfNotOk } from './query-helpers'
import type { LeadData, LeadsStats } from '@/components/super-admin/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeadsListResponse {
  leads: LeadData[]
  stats: LeadsStats
}

export interface LeadsListParams {
  status?: string
  search?: string
}

export interface UpdateLeadPayload {
  // Contact fields
  ownerFullName?: string
  ownerEmail?: string | null
  ownerPhone?: string | null
  // Company fields
  storeName?: string
  nit?: string
  legalName?: string
  businessType?: string
  storePhone?: string | null
  department?: string | null
  cityName?: string | null
  address?: string | null
  // Document metadata
  hasCamaraComercio?: boolean
  registrationNumber?: string | null
  // Status/notes
  status?: string
  notes?: string | null
  reviewedBy?: string
  // File uploads - RUT
  rutFileBase64?: string
  rutFileName?: string
  rutFileType?: string
  // File uploads - Cámara de Comercio
  camaraFileBase64?: string
  camaraFileName?: string
  camaraFileType?: string
}

export interface ApproveLeadResponse {
  storeId: number
  storeName: string
  message: string
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const leadsKeys = {
  all: ['leads'] as const,
  list: (params: LeadsListParams) => ['leads', 'list', params] as const,
  detail: (id: number) => ['leads', 'detail', id] as const,
}

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

/** List leads with optional filters and stats */
export function useLeads(params: LeadsListParams = {}) {
  const sp = new URLSearchParams()
  if (params.status) sp.set('status', params.status)
  if (params.search?.trim()) sp.set('search', params.search.trim())

  return useQuery<LeadsListResponse>({
    queryKey: leadsKeys.list(params),
    queryFn: () => queryFetch<LeadsListResponse>(`/api/super-admin/leads?${sp.toString()}`),
    staleTime: 15_000,
  })
}

/** Single lead detail */
export function useLeadDetail(id: number | undefined | null) {
  return useQuery<LeadData>({
    queryKey: leadsKeys.detail(id!),
    queryFn: () => queryFetch<LeadData>(`/api/super-admin/leads/${id}`),
    enabled: !!id,
    staleTime: 15_000,
  })
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

/** Update a lead (status change, edit fields, save notes, file uploads) */
export function useUpdateLead() {
  const qc = useQueryClient()
  return useMutation<LeadData, Error, { id: number; body: UpdateLeadPayload }>({
    mutationFn: ({ id, body }) =>
      mutationFetch<LeadData>(`/api/super-admin/leads/${id}`, 'PATCH', body as Record<string, unknown>),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: leadsKeys.all })
      qc.invalidateQueries({ queryKey: leadsKeys.detail(id) })
    },
  })
}

/** Approve/Convert a lead into a full Store account */
export function useApproveLead() {
  const qc = useQueryClient()
  return useMutation<ApproveLeadResponse, Error, { id: number }>({
    mutationFn: ({ id }) =>
      fetch(`/api/super-admin/leads/${id}/approve`, { method: 'POST' }).then(throwIfNotOk),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: leadsKeys.all })
      qc.invalidateQueries({ queryKey: leadsKeys.detail(id) })
    },
  })
}

/** Delete a lead */
export function useDeleteLead() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { id: number }>({
    mutationFn: ({ id }) =>
      fetch(`/api/super-admin/leads/${id}`, { method: 'DELETE' }).then(throwIfNotOk),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: leadsKeys.all })
    },
  })
}

/** Download a lead's file (RUT or Cámara) — returns a blob, not JSON */
export async function downloadLeadFile(leadId: number, type: 'rut' | 'camara'): Promise<Blob> {
  const res = await fetch(`/api/super-admin/leads/${leadId}/files?type=${type}`)
  if (!res.ok) {
    throw new Error('Error al descargar el documento')
  }
  return res.blob()
}
