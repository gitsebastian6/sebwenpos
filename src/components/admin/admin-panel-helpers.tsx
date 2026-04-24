'use client'

import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { type AdminStore, type AdminStoreDetail, type AdminSummary, type CreateStoreForm } from '@/hooks/api/use-admin-panel'

// ── Type aliases ───────────────────────────────────────────────

export type Store = AdminStore
export type StoreDetail = AdminStoreDetail
export type Summary = AdminSummary

// ── Create Store empty form ────────────────────────────────────

export const emptyForm: CreateStoreForm = {
  storeName: '',
  nit: '',
  legalName: '',
  city: '',
  ownerFullName: '',
  ownerCedula: '',
  ownerDocumentType: 'CC',
  ownerPhone: '',
  ownerEmail: '',
  ownerPassword: '',
  plan: 'TRIAL',
}

// ── Edit Store Form Type ───────────────────────────────────────

export interface EditStoreForm {
  storeName: string
  nit: string
  legalName: string
  city: string
  address: string
  plan: string
  ownerFullName: string
  ownerPhone: string
  ownerEmail: string
}

// ── Plan helpers ───────────────────────────────────────────────

export function planBadgeVariant(plan: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (plan) {
    case 'ENTERPRISE':
      return 'default'
    case 'PRO':
      return 'secondary'
    case 'BASIC':
      return 'outline'
    case 'TRIAL':
      return 'destructive'
    default:
      return 'outline'
  }
}

export function planLabel(plan: string): string {
  switch (plan) {
    case 'TRIAL': return 'Prueba'
    case 'BASIC': return 'Básico'
    case 'PRO': return 'Pro'
    case 'ENTERPRISE': return 'Empresa'
    default: return plan
  }
}

// ── Plan Expiration Badge ──────────────────────────────────────

export function PlanStatusBadge({ store }: { store: { planExpiresAt: string | null } }) {
  if (!store.planExpiresAt) return null

  const expiresAt = new Date(store.planExpiresAt)
  const now = new Date()
  const diffMs = expiresAt.getTime() - now.getTime()
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (daysRemaining < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400">
        EXPIRADO
      </span>
    )
  }

  const colorClass = daysRemaining <= 7
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-emerald-600 dark:text-emerald-400'

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${colorClass}`}>
      {daysRemaining} días restantes
    </span>
  )
}

// ── Stat Card ──────────────────────────────────────────────────

export function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: number | string
  color: string
}) {
  return (
    <Card className="py-4">
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`flex items-center justify-center rounded-lg p-2.5 ${color}`}>
          <Icon className="size-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground truncate">{label}</p>
          <p className="text-2xl font-bold leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
