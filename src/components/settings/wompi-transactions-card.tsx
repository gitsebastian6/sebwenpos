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
} from 'lucide-react'
import { formatCOP, formatDateTime, paymentMethodLabel } from '@/lib/format'
import { useWompiTransactions } from '@/hooks/api/use-wompi'
import type { WompiTransactionData } from '@/hooks/api/use-wompi'

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
    <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-emerald-600" />
          Transacciones Wompi
        </CardTitle>
        <CardDescription>Historial de pagos realizados a través de Wompi</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status filter buttons */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              variant={statusFilter === filter.value ? 'default' : 'outline'}
              size="sm"
              className={`h-7 text-xs px-2.5 ${
                statusFilter === filter.value
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 dark:hover:bg-emerald-950/30 dark:hover:text-emerald-300'
              }`}
              onClick={() => {
                setStatusFilter(filter.value)
                setPage(1)
              }}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && transactions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-3 text-muted-foreground">
            <Inbox className="h-10 w-10 opacity-20" />
            <p className="text-sm font-medium">No hay transacciones Wompi aún</p>
            <p className="text-xs opacity-60">Las transacciones aparecerán aquí cuando se realicen pagos</p>
          </div>
        )}

        {/* Transactions list */}
        {!isLoading && transactions.length > 0 && (
          <>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {transactions.map((tx: WompiTransactionData) => (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors"
                >
                  {/* Status icon */}
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                    tx.status === 'APPROVED'
                      ? 'bg-emerald-100 dark:bg-emerald-500/15'
                      : tx.status === 'PENDING'
                        ? 'bg-amber-100 dark:bg-amber-500/15'
                        : 'bg-red-100 dark:bg-red-500/15'
                  }`}>
                    <Shield className={`h-4 w-4 ${
                      tx.status === 'APPROVED'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : tx.status === 'PENDING'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'
                    }`} />
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold truncate">
                        {tx.reference}
                      </p>
                      {statusBadge(tx.status)}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs font-mono font-bold text-foreground">
                        {formatCOP(tx.amount)}
                      </span>
                      {tx.paymentMethod && (
                        <span className="text-[11px] text-muted-foreground">
                          {paymentMethodLabel(tx.paymentMethod)}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {formatDateTime(tx.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    disabled={pagination.page <= 1}
                    onClick={() => setPage(pagination.page - 1)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs font-medium px-2">
                    {pagination.page} / {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
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
    </Card>
  )
}
