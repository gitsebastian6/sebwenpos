'use client'

import { Badge } from '@/components/ui/badge'
import { formatDateShort as formatDate } from '@/lib/format'

// Re-export formatDate as the canonical name used throughout super-admin components
export { formatDate }
export { formatCOP, formatDateTime } from '@/lib/format'

export function formatLimit(val: number): string {
  return val === -1 ? '∞' : val.toLocaleString('es-CO')
}

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  TRIAL: 'En Prueba',
  ACTIVE: 'Activa',
  PAST_DUE: 'Vencida',
  EXPIRED: 'Expirada',
  CANCELLED: 'Cancelada',
}

export function getSubscriptionStatusBadge(status: string) {
  const label = SUBSCRIPTION_STATUS_LABELS[status] ?? status
  switch (status) {
    case 'TRIAL': return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20">{label}</Badge>
    case 'ACTIVE': return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20">{label}</Badge>
    case 'PAST_DUE': return <Badge className="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20">{label}</Badge>
    case 'CANCELLED': return <Badge variant="secondary">{label}</Badge>
    case 'EXPIRED': return <Badge className="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20">{label}</Badge>
    default: return <Badge variant="outline">{label}</Badge>
  }
}

export const BILLING_PERIOD_LABELS: Record<string, string> = {
  TRIAL: '7 días',
  MONTHLY: 'Mensual',
  QUARTERLY: 'Trimestral',
  SEMI_ANNUAL: 'Semestral',
  ANNUAL: 'Anual',
}

export const BILLING_PERIODS = [
  { value: 'TRIAL', label: '7 días (Trial)', discount: 0, months: 0 },
  { value: 'MONTHLY', label: '1 mes', discount: 0, months: 1 },
  { value: 'QUARTERLY', label: '3 meses', discount: 5, months: 3 },
  { value: 'SEMI_ANNUAL', label: '6 meses', discount: 10, months: 6 },
  { value: 'ANNUAL', label: '1 año', discount: 15, months: 12 },
]

export function UsageBar({ label, current, max, icon }: { label: string; current: number; max: number; icon: React.ReactNode }) {
  const isUnlimited = max === -1
  const percentage = isUnlimited ? 0 : Math.min(100, Math.round((current / max) * 100))
  const isNearLimit = !isUnlimited && percentage >= 80
  const isAtLimit = !isUnlimited && current >= max

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1 text-muted-foreground">
          {icon}{label}
        </div>
        <span className={`font-mono font-medium ${isAtLimit ? 'text-red-600' : isNearLimit ? 'text-amber-600' : ''}`}>
          {current}/{isUnlimited ? '∞' : max}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${isAtLimit ? 'bg-red-500' : isNearLimit ? 'bg-amber-500' : 'bg-emerald-500'}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
    </div>
  )
}
