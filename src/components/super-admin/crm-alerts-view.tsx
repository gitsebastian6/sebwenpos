'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Loader2, Building2, ArrowRight } from 'lucide-react'
import { useCrmAlerts } from '@/hooks/api/use-leads'

interface Props { onOpenLead: (leadId: number) => void }

export function CrmAlertsView({ onOpenLead }: Props) {
  const { data, isLoading } = useCrmAlerts()

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  }

  const leads = data?.leads ?? []
  const stores = data?.stores ?? []
  const totalAlerts = leads.length + stores.length

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Resoluciones DIAN vencidas o por vencer ({totalAlerts})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {totalAlerts === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Ningún cliente ni lead tiene la resolución vencida o por vencer en los próximos {data?.warningWindowDays ?? 30} días. 🎉</p>
          ) : (
            <div className="space-y-2">
              {leads.map((l) => (
                <div key={`lead-${l.id}`} className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => onOpenLead(l.id)}>
                  <div className="flex items-center gap-3 min-w-0">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{l.storeName} <Badge variant="outline" className="text-[9px] ml-1">Lead — {l.stage}</Badge></p>
                      <p className="text-xs text-muted-foreground font-mono">NIT {l.nit} · {l.assignedTo?.fullName || 'Sin asesor'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={l.alertStatus === 'EXPIRED' ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'}>
                      {l.alertStatus === 'EXPIRED' ? `Vencida hace ${Math.abs(l.daysRemaining ?? 0)}d` : `Vence en ${l.daysRemaining}d`}
                    </Badge>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
              ))}
              {stores.map((s) => (
                <div key={`store-${s.id}`} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.name} <Badge variant="outline" className="text-[9px] ml-1">Cliente activo</Badge></p>
                      <p className="text-xs text-muted-foreground font-mono">NIT {s.nit}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={s.alertStatus === 'EXPIRED' ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'}>
                    {s.alertStatus === 'EXPIRED' ? `Vencida hace ${Math.abs(s.daysRemaining ?? 0)}d` : `Vence en ${s.daysRemaining}d`}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
