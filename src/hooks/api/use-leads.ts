'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryFetch, mutationFetch, throwIfNotOk } from './query-helpers'
import type { LeadData, LeadsStats, LeadDocumentData, LeadActivityData, LeadContactData } from '@/components/super-admin/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const CRM_STAGES = ['LEAD', 'CONTACTADO', 'DOC_PENDIENTE', 'VALIDACION_LEGAL', 'CLIENTE_ACTIVO', 'RECHAZADO'] as const
export type CrmStage = typeof CRM_STAGES[number]
// Todos los tipos de documento subibles en el expediente legal.
export const ALL_DOCUMENT_TYPES = ['RUT', 'CAMARA_COMERCIO', 'CEDULA_REPRESENTANTE', 'RESOLUCION_DIAN'] as const
// Los 3 obligatorios para aprobar el negocio — la Resolución DIAN es opcional
// (mantener en sync con REQUIRED_DOCUMENT_TYPES en documents/route.ts).
export const REQUIRED_DOCUMENT_TYPES = ['RUT', 'CAMARA_COMERCIO', 'CEDULA_REPRESENTANTE'] as const
export type DocumentType = typeof ALL_DOCUMENT_TYPES[number]

export interface LeadsListResponse {
  leads: LeadData[]
  stats: LeadsStats
  stageStats: Record<CrmStage, number>
}

export interface LeadsListParams {
  status?: string
  stage?: string
  search?: string
  assignedToId?: number
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
  // Pipeline CRM
  stage?: CrmStage
  assignedToId?: number | null
  // Datos fiscales
  taxRegime?: string | null
  fiscalResponsibilities?: string | null
  // Resolución DIAN (borrador)
  resolutionPrefix?: string | null
  resolutionNumber?: string | null
  resolutionStartDate?: string | null
  resolutionEndDate?: string | null
  resolutionStartNumber?: number | null
  resolutionEndNumber?: number | null
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
  if (params.stage) sp.set('stage', params.stage)
  if (params.search?.trim()) sp.set('search', params.search.trim())
  if (params.assignedToId) sp.set('assignedToId', String(params.assignedToId))

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

// ---------------------------------------------------------------------------
// Expediente Legal — LeadDocument
// ---------------------------------------------------------------------------

export function useLeadDocuments(leadId: number | undefined | null) {
  return useQuery<{ documents: LeadDocumentData[] }>({
    queryKey: ['leads', 'documents', leadId],
    queryFn: () => queryFetch(`/api/super-admin/leads/${leadId}/documents`),
    enabled: !!leadId,
    staleTime: 10_000,
  })
}

export function useUploadLeadDocument() {
  const qc = useQueryClient()
  return useMutation<
    { document: LeadDocumentData; newStage: string | null },
    Error,
    { leadId: number; documentType: DocumentType; fileBase64: string; fileName: string; fileType: string }
  >({
    mutationFn: ({ leadId, ...body }) =>
      mutationFetch(`/api/super-admin/leads/${leadId}/documents`, 'POST', body),
    onSuccess: (_data, { leadId }) => {
      qc.invalidateQueries({ queryKey: ['leads', 'documents', leadId] })
      qc.invalidateQueries({ queryKey: ['leads', 'activities', leadId] })
      qc.invalidateQueries({ queryKey: leadsKeys.all })
      qc.invalidateQueries({ queryKey: leadsKeys.detail(leadId) })
    },
  })
}

export function useReviewLeadDocument() {
  const qc = useQueryClient()
  return useMutation<
    { document: LeadDocumentData; newStage: string | null },
    Error,
    { leadId: number; docId: number; status: 'APPROVED' | 'REJECTED'; rejectionReason?: string }
  >({
    mutationFn: ({ leadId, docId, ...body }) =>
      mutationFetch(`/api/super-admin/leads/${leadId}/documents/${docId}`, 'PATCH', body),
    onSuccess: (_data, { leadId }) => {
      qc.invalidateQueries({ queryKey: ['leads', 'documents', leadId] })
      qc.invalidateQueries({ queryKey: ['leads', 'activities', leadId] })
      qc.invalidateQueries({ queryKey: leadsKeys.all })
      qc.invalidateQueries({ queryKey: leadsKeys.detail(leadId) })
    },
  })
}

// ---------------------------------------------------------------------------
// Actividad / timeline
// ---------------------------------------------------------------------------

export function useLeadActivities(leadId: number | undefined | null) {
  return useQuery<{ activities: LeadActivityData[] }>({
    queryKey: ['leads', 'activities', leadId],
    queryFn: () => queryFetch(`/api/super-admin/leads/${leadId}/activities`),
    enabled: !!leadId,
    staleTime: 10_000,
  })
}

export function useCreateLeadActivity() {
  const qc = useQueryClient()
  return useMutation<
    { activity: LeadActivityData },
    Error,
    { leadId: number; type: 'NOTE' | 'CALL' | 'TASK' | 'WHATSAPP' | 'EMAIL'; title: string; description?: string; dueDate?: string }
  >({
    mutationFn: ({ leadId, ...body }) =>
      mutationFetch(`/api/super-admin/leads/${leadId}/activities`, 'POST', body),
    onSuccess: (_data, { leadId }) => {
      qc.invalidateQueries({ queryKey: ['leads', 'activities', leadId] })
    },
  })
}

export function useCompleteLeadActivity() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { leadId: number; activityId: number; completed?: boolean }>({
    mutationFn: ({ leadId, activityId, completed = true }) =>
      mutationFetch(`/api/super-admin/leads/${leadId}/activities/${activityId}`, 'PATCH', { completed }),
    onSuccess: (_data, { leadId }) => {
      qc.invalidateQueries({ queryKey: ['leads', 'activities', leadId] })
    },
  })
}

// ---------------------------------------------------------------------------
// Contactos adicionales
// ---------------------------------------------------------------------------

export function useLeadContacts(leadId: number | undefined | null) {
  return useQuery<{ contacts: LeadContactData[] }>({
    queryKey: ['leads', 'contacts', leadId],
    queryFn: () => queryFetch(`/api/super-admin/leads/${leadId}/contacts`),
    enabled: !!leadId,
    staleTime: 15_000,
  })
}

export function useCreateLeadContact() {
  const qc = useQueryClient()
  return useMutation<
    { contact: LeadContactData },
    Error,
    { leadId: number; fullName: string; cedula?: string; role: string; email?: string; phone?: string; isPrimary?: boolean }
  >({
    mutationFn: ({ leadId, ...body }) =>
      mutationFetch(`/api/super-admin/leads/${leadId}/contacts`, 'POST', body),
    onSuccess: (_data, { leadId }) => {
      qc.invalidateQueries({ queryKey: ['leads', 'contacts', leadId] })
    },
  })
}

export function useDeleteLeadContact() {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { leadId: number; contactId: number }>({
    mutationFn: ({ leadId, contactId }) =>
      fetch(`/api/super-admin/leads/${leadId}/contacts/${contactId}`, { method: 'DELETE' }).then(throwIfNotOk),
    onSuccess: (_data, { leadId }) => {
      qc.invalidateQueries({ queryKey: ['leads', 'contacts', leadId] })
    },
  })
}

// ---------------------------------------------------------------------------
// Alertas de vencimiento — Resolución DIAN
// ---------------------------------------------------------------------------

export interface CrmAlertRow {
  id: number
  nit: string
  resolutionEndDate: string | null
  alertStatus: 'EXPIRED' | 'EXPIRING_SOON'
  daysRemaining: number | null
}
export interface CrmAlertLeadRow extends CrmAlertRow {
  storeName: string
  stage: string
  assignedTo: { id: number; fullName: string | null } | null
}
export interface CrmAlertStoreRow extends CrmAlertRow {
  name: string
}

export function useCrmAlerts() {
  return useQuery<{ leads: CrmAlertLeadRow[]; stores: CrmAlertStoreRow[]; warningWindowDays: number }>({
    queryKey: ['crm', 'alerts'],
    queryFn: () => queryFetch('/api/super-admin/crm/alerts'),
    staleTime: 60_000,
  })
}
