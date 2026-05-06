'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  FileText,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  CreditCard,
  DollarSign,
  TrendingDown,
} from 'lucide-react'
import { formatCOP } from '@/lib/format'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvoiceItem {
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

interface BillingSummary {
  totalBilled: number
  totalBilledFormatted: string
  totalPaid: number
  totalPaidFormatted: string
  totalCredits: number
  totalCreditsFormatted: string
  recordCount: number
}

interface InvoiceHistoryCardProps {
  items: InvoiceItem[]
  summary: BillingSummary | null
  isLoading?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a date string to short Spanish date: "01 Ene 2025" */
function formatPeriodDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-CO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/** Map payment method code to a human‑readable Colombian label. */
function getPaymentLabel(method: string | null): string | null {
  if (!method) return null
  const labels: Record<string, string> = {
    NEQUI: 'Nequi',
    DAVIPLATA: 'Daviplata',
    BANCOLOMBIA: 'Bancolombia',
    BANCOLIBRO: 'Bancolombia',
    WOMPI_NEQUI: 'Nequi (Wompi)',
    WOMPI_DAVIPLATA: 'Daviplata (Wompi)',
    WOMPI_BANCOLOMBIA: 'Bancolombia (Wompi)',
    WOMPI_PSE: 'PSE (Wompi)',
    WOMPI_CARD: 'Tarjeta (Wompi)',
    CASH: 'Efectivo',
    CARD: 'Tarjeta',
    TRANSFER: 'Transferencia',
    WOMPI: 'Wompi',
    PSE: 'PSE',
    OTHER: 'Otro',
  }
  return labels[method] ?? method
}

/** Return status‑specific icon component, colours, and badge classes. */
function getStatusConfig(status: string) {
  switch (status) {
    case 'PAID':
      return {
        Icon: CheckCircle2,
        iconClass: 'text-emerald-500 dark:text-emerald-400',
        bgClass: 'bg-emerald-100 dark:bg-emerald-500/15',
        borderClass:
          'border-emerald-200/60 dark:border-emerald-800/40',
        bgHover:
          'hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10',
        badgeClass:
          'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20 border-transparent',
      }
    case 'PENDING':
      return {
        Icon: Clock,
        iconClass: 'text-amber-500 dark:text-amber-400',
        bgClass: 'bg-amber-100 dark:bg-amber-500/15',
        borderClass:
          'border-amber-200/60 dark:border-amber-800/40',
        bgHover:
          'hover:bg-amber-50/50 dark:hover:bg-amber-950/10',
        badgeClass:
          'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20 border-transparent',
      }
    case 'FAILED':
    case 'VOIDED':
    default:
      return {
        Icon: XCircle,
        iconClass: 'text-red-500 dark:text-red-400',
        bgClass: 'bg-red-100 dark:bg-red-500/15',
        borderClass:
          'border-red-200/60 dark:border-red-800/40',
        bgHover:
          'hover:bg-red-50/50 dark:hover:bg-red-950/10',
        badgeClass:
          'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20 border-transparent',
      }
  }
}

// ---------------------------------------------------------------------------
// Sub‑components
// ---------------------------------------------------------------------------

/** Single invoice row */
function InvoiceRow({ item }: { item: InvoiceItem }) {
  const cfg = getStatusConfig(item.status)
  const { Icon } = cfg

  const paymentLabel = getPaymentLabel(item.paymentMethod)

  return (
    <div
      className={`
        flex items-start gap-3 rounded-xl border p-3.5 transition-colors duration-150
        ${cfg.borderClass} ${cfg.bgHover}
      `}
    >
      {/* Status icon */}
      <div
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.bgClass}`}
      >
        <Icon className={`h-4 w-4 ${cfg.iconClass}`} />
      </div>

      {/* Center — details */}
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm font-bold leading-tight tracking-tight">
          {item.invoiceNumber}
        </p>

        <p className="mt-0.5 text-xs text-muted-foreground truncate">
          {item.planName}
          {item.billingPeriod ? ` · ${item.billingPeriod}` : ''}
        </p>

        <p className="mt-0.5 text-[11px] text-muted-foreground/80">
          {formatPeriodDate(item.periodStart)} → {formatPeriodDate(item.periodEnd)}
        </p>

        {/* Proration credit note */}
        {item.prorationCredit > 0 && item.prorationCreditFormatted && (
          <p className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            Crédito prorrateado: −{item.prorationCreditFormatted}
          </p>
        )}
      </div>

      {/* Right — amount + status */}
      <div className="shrink-0 text-right">
        <p className="font-mono text-sm font-bold">{item.netAmountFormatted}</p>

        <Badge className={`mt-1 text-[11px] font-semibold ${cfg.badgeClass}`}>
          {item.statusLabel}
        </Badge>

        {paymentLabel && (
          <p className="mt-1 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
            <CreditCard className="h-3 w-3" />
            {paymentLabel}
          </p>
        )}
      </div>
    </div>
  )
}

/** Three‑column summary stats row */
function SummaryStats({ summary }: { summary: BillingSummary }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Total Facturado */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 dark:bg-primary/5 p-3">
        <div className="flex items-center gap-1.5 text-[11px] text-primary font-medium mb-1">
          <DollarSign className="h-3 w-3" />
          Total Facturado
        </div>
        <p className="font-mono text-sm font-bold text-primary truncate">
          {summary.totalBilledFormatted}
        </p>
      </div>

      {/* Total Pagado */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 dark:bg-emerald-500/5 p-3">
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mb-1">
          <CheckCircle2 className="h-3 w-3" />
          Total Pagado
        </div>
        <p className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400 truncate">
          {summary.totalPaidFormatted}
        </p>
      </div>

      {/* Créditos */}
      <div className="rounded-xl border border-border/50 bg-muted/30 dark:bg-muted/20 p-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium mb-1">
          <TrendingDown className="h-3 w-3" />
          Créditos
        </div>
        <p className="font-mono text-sm font-bold text-muted-foreground truncate">
          {summary.totalCreditsFormatted}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function InvoiceHistoryCard({
  items,
  summary,
  isLoading = false,
}: InvoiceHistoryCardProps) {
  // --- Loading state ---
  if (isLoading) {
    return (
      <Card className="border-border/50 rounded-xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            Facturas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              Cargando facturas…
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
      {/* ---- Header ---- */}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            Facturas
          </CardTitle>

          {items.length > 0 && (
            <Badge variant="secondary" className="text-xs font-semibold">
              {items.length} {items.length === 1 ? 'registro' : 'registros'}
            </Badge>
          )}
        </div>
      </CardHeader>

      {/* ---- Body ---- */}
      <CardContent>
        {/* Empty state */}
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-14 w-14 rounded-2xl bg-muted/60 dark:bg-muted/30 flex items-center justify-center mb-3">
              <FileText className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              No hay facturas registradas
            </p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground/70 leading-relaxed">
              Las facturas aparecerán aquí cuando se generen registros de
              facturación para tu suscripción.
            </p>
          </div>
        )}

        {/* Invoice list */}
        {items.length > 0 && (
          <>
            {/* Summary row */}
            {summary && (
              <div className="mb-4">
                <SummaryStats summary={summary} />
              </div>
            )}

            {/* Scrollable list */}
            <div className="max-h-96 space-y-3 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent">
              {items.map((item) => (
                <InvoiceRow key={item.id} item={item} />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
