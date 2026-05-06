'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Shield,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Inbox,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react'
import { formatCOP, formatDateTime, paymentMethodLabel } from '@/lib/format'
import { useWompiTransactions } from '@/hooks/api/use-wompi'
import type { WompiTransactionData } from '@/hooks/api/use-wompi'
import { WompiPoweredBy } from '@/components/payments/wompi-payment-methods'

// ── Status badge colors ──

function statusBadge(status: string) {
  const config: Record<string, { label: string; className: string }> = {
    PENDING: {
      label: 'Pendiente',
      className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 border-0',
    },
    APPROVED: {
      label: 'Aprobado',
      className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border-0',
    },
    DECLINED: {
      label: 'Rechazado',
      className: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 border-0',
    },
    VOIDED: {
      label: 'Anulado',
      className: 'bg-gray-100 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400 border-0',
    },
    ERROR: {
      label: 'Error',
      className: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 border-0',
    },
  }
  const c = config[status] || { label: status, className: 'bg-gray-100 text-gray-600 border-0' }
  return <Badge className={c.className}>{c.label}</Badge>
}

// ── Status icon for transaction row ──

function statusIcon(status: string) {
  if (status === 'APPROVED') {
    return (
      <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
        <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
      </div>
    )
  }
  if (status === 'PENDING') {
    return (
      <div className="h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center shrink-0">
        <Clock className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
      </div>
    )
  }
  return (
    <div className="h-9 w-9 rounded-full bg-red-100 dark:bg-red-500/15 flex items-center justify-center shrink-0">
      <XCircle className="h-4.5 w-4.5 text-red-600 dark:text-red-400" />
    </div>
  )
}

// ── Status left-border hover accent class ──

function hoverBorderClass(status: string) {
  if (status === 'APPROVED') return 'hover:border-l-emerald-500'
  if (status === 'PENDING') return 'hover:border-l-amber-500'
  return 'hover:border-l-red-500'
}

// ── Filter buttons ──

const STATUS_FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'APPROVED', label: 'Aprobadas' },
  { value: 'DECLINED', label: 'Rechazadas' },
  { value: 'VOIDED', label: 'Anuladas' },
] as const

// ── Component Props ──

interface WompiTransactionsCardProps {
  storeId: number
}

// ── Component ──

export function WompiTransactionsCard({ storeId }: WompiTransactionsCardProps) {
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const limit = 10

  const { data, isLoading } = useWompiTransactions(storeId, {
    status: statusFilter || undefined,
    page,
    limit,
  })

  const transactions = data?.transactions ?? []
  const pagination = data?.pagination

  return (
    <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl overflow-hidden">
      {/* Gradient accent bar */}
      <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />

      <CardHeader className="pb-3 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center">
              <Shield className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold leading-tight">
                Transacciones Wompi
              </CardTitle>
              <CardDescription className="mt-0.5">
                Historial de pagos realizados a través de Wompi
              </CardDescription>
            </div>
          </div>
          {pagination && pagination.total > 0 && (
            <Badge
              variant="secondary"
              className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 border-0 text-xs font-semibold tabular-nums"
            >
              {pagination.total} transacción{pagination.total !== 1 ? 'es' : ''}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status filter pills */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((filter) => {
            const isActive = statusFilter === filter.value
            return (
              <Button
                key={filter.value}
                variant="ghost"
                size="sm"
                className={`h-8 text-xs px-4 rounded-full transition-all duration-200 ${
                  isActive
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
                onClick={() => {
                  setStatusFilter(filter.value)
                  setPage(1)
                }}
              >
                {filter.label}
              </Button>
            )
          })}
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
            <p className="text-xs text-muted-foreground">Cargando transacciones…</p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && transactions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 gap-4">
            <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center">
              <Inbox className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-foreground/80">
                Sin transacciones
              </p>
              <p className="text-xs text-muted-foreground max-w-[260px]">
                Las transacciones aparecerán aquí automáticamente cuando los clientes realicen pagos a través de Wompi.
              </p>
            </div>
          </div>
        )}

        {/* Transactions list */}
        {!isLoading && transactions.length > 0 && (
          <>
            <div className="space-y-0.5 max-h-96 overflow-y-auto">
              {transactions.map((tx: WompiTransactionData, index: number) => (
                <div
                  key={tx.id}
                  className={`group flex items-center gap-4 px-4 py-3 rounded-lg border-l-[3px] border-l-transparent transition-all duration-150 cursor-default ${
                    index % 2 === 1 ? 'bg-muted/20' : ''
                  } ${hoverBorderClass(tx.status)} hover:bg-muted/40`}
                >
                  {/* Status icon */}
                  {statusIcon(tx.status)}

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate text-foreground/90">
                      {tx.reference}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {tx.paymentMethod && (
                        <span className="text-xs text-muted-foreground">
                          {paymentMethodLabel(tx.paymentMethod)}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(tx.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Amount + Status */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold font-mono tabular-nums text-foreground">
                      {formatCOP(tx.amount)}
                    </p>
                    <div className="mt-0.5">
                      {statusBadge(tx.status)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground">
                  Mostrando{' '}
                  <span className="font-medium tabular-nums text-foreground/70">
                    {((pagination.page - 1) * pagination.limit) + 1}
                    –
                    {Math.min(pagination.page * pagination.limit, pagination.total)}
                  </span>
                  {' '}de{' '}
                  <span className="font-medium tabular-nums text-foreground/70">
                    {pagination.total}
                  </span>
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    disabled={pagination.page <= 1}
                    onClick={() => setPage(pagination.page - 1)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs font-medium px-2 tabular-nums text-foreground/70">
                    {pagination.page} / {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-full"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPage(pagination.page + 1)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border/30 bg-muted/10">
        <WompiPoweredBy />
      </div>
    </Card>
  )
}
