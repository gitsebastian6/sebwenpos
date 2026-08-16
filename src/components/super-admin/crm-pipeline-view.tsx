'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Search, Building2, User, ArrowRight, Clock, Loader2,
  UserCircle2, ListTodo,
} from 'lucide-react'
import { useLeads, CRM_STAGES, type CrmStage } from '@/hooks/api/use-leads'
import type { LeadData } from './types'

const STAGE_CONFIG: Record<CrmStage, { label: string; bar: string; badge: string }> = {
  LEAD: { label: 'Lead', bar: 'bg-slate-400', badge: 'bg-slate-500/10 border-slate-500/20 text-slate-500' },
  CONTACTADO: { label: 'Contactado', bar: 'bg-sky-500', badge: 'bg-sky-500/10 border-sky-500/20 text-sky-500' },
  DOC_PENDIENTE: { label: 'Doc. Pendiente', bar: 'bg-amber-500', badge: 'bg-amber-500/10 border-amber-500/20 text-amber-500' },
  VALIDACION_LEGAL: { label: 'Validación Legal', bar: 'bg-violet-500', badge: 'bg-violet-500/10 border-violet-500/20 text-violet-500' },
  CLIENTE_ACTIVO: { label: 'Cliente Activo', bar: 'bg-emerald-500', badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' },
  RECHAZADO: { label: 'Rechazado', bar: 'bg-red-500', badge: 'bg-red-500/10 border-red-500/20 text-red-500' },
}

const NEXT_STAGE: Partial<Record<CrmStage, CrmStage>> = {
  LEAD: 'CONTACTADO',
  CONTACTADO: 'DOC_PENDIENTE',
}

function daysSince(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
}

interface CrmPipelineViewProps {
  onOpenLead: (leadId: number) => void
}

export function CrmPipelineView({ onOpenLead }: CrmPipelineViewProps) {
  const [search, setSearch] = useState('')
  const { data, isLoading } = useLeads({ search })
  const leads = data?.leads ?? []
  const stageStats = data?.stageStats

  const columns = CRM_STAGES.filter((s) => s !== 'RECHAZADO').map((stage) => ({
    stage,
    leads: leads.filter((l) => l.stage === stage),
  }))
  const rejected = leads.filter((l) => l.stage === 'RECHAZADO')

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nombre, NIT, cédula..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-start">
          {columns.map(({ stage, leads: stageLeads }) => (
            <div key={stage} className="space-y-2 min-w-0">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${STAGE_CONFIG[stage].bar}`} />
                  <h3 className="text-xs font-semibold">{STAGE_CONFIG[stage].label}</h3>
                </div>
                <Badge variant="outline" className="text-[10px] h-5">{stageStats?.[stage] ?? stageLeads.length}</Badge>
              </div>
              <div className="space-y-2 min-h-[60px]">
                {stageLeads.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center text-[11px] text-muted-foreground">Sin leads</div>
                ) : (
                  stageLeads.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} onOpen={() => onOpenLead(lead.id)} />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {rejected.length > 0 && (
        <div className="pt-2">
          <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-red-500" />Rechazados ({rejected.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {rejected.map((lead) => <LeadCard key={lead.id} lead={lead} onOpen={() => onOpenLead(lead.id)} compact />)}
          </div>
        </div>
      )}
    </div>
  )
}

function LeadCard({ lead, onOpen, compact }: { lead: LeadData; onOpen: () => void; compact?: boolean }) {
  const stage = lead.stage as CrmStage
  const cfg = STAGE_CONFIG[stage] || STAGE_CONFIG.LEAD
  const next = NEXT_STAGE[stage]

  return (
    <Card className="hover:shadow-md hover:border-primary/30 transition-all duration-200 cursor-pointer" onClick={onOpen}>
      <div className={`h-1 rounded-t-xl ${cfg.bar}`} />
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate">{lead.storeName}</p>
            <p className="text-[10px] text-muted-foreground font-mono truncate">NIT {lead.nit}</p>
          </div>
        </div>
        {!compact && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <User className="h-3 w-3" /><span className="truncate">{lead.ownerFullName}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />{daysSince(lead.updatedAt)}d en etapa
          </div>
          {lead.assignedTo ? (
            <Badge variant="outline" className="text-[9px] h-4 gap-1"><UserCircle2 className="h-2.5 w-2.5" />{lead.assignedTo.fullName?.split(' ')[0] || 'Asesor'}</Badge>
          ) : (
            <Badge variant="outline" className="text-[9px] h-4 text-muted-foreground">Sin asignar</Badge>
          )}
        </div>
        {next && !compact && (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-6 text-[10px] gap-1"
            onClick={(e) => { e.stopPropagation(); onOpen() }}
          >
            <ArrowRight className="h-3 w-3" />Avanzar en la ficha
          </Button>
        )}
        {stage === 'VALIDACION_LEGAL' && !compact && (
          <Badge className="w-full justify-center text-[9px] h-5 gap-1 bg-violet-500/10 border-violet-500/20 text-violet-500" variant="outline">
            <ListTodo className="h-3 w-3" />Revisar documentos
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}
