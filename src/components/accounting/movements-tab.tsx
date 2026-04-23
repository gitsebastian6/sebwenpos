'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useMovements } from '@/hooks/api/use-ledger'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowRightLeft } from 'lucide-react'
import type { LedgerAccount, JournalEntry } from './accounting-types'
import {
  ACCOUNT_TYPE_LABELS,
  REFERENCE_TYPE_LABELS,
  getAccountTypeColor,
  getDirectionBadgeClass,
  formatCurrency,
  formatTime,
  formatDateShort,
} from './accounting-types'

interface MovementsTabProps {
  accounts: LedgerAccount[]
  currencyCode: string
  initialAccountId: number | null
}

export function MovementsTab({ accounts, currencyCode, initialAccountId }: MovementsTabProps) {
  const store = useAuthStore((s) => s.store)
  const [filterAccountId, setFilterAccountId] = useState<string>('all')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  // When initialAccountId is set from parent (via accounts tab navigation), update filter
  useEffect(() => {
    if (initialAccountId !== null) {
      setFilterAccountId(String(initialAccountId))
      setFilterFrom('')
      setFilterTo('')
    }
  }, [initialAccountId])

  // ─── TanStack Query hook ────────────────────────────────────────────────
  const { data: response, isLoading: isLoadingEntries, refetch: fetchEntries } = useMovements(store?.id, {
    accountId: filterAccountId,
    from: filterFrom || undefined,
    to: filterTo || undefined,
  })
  const entries = response?.entries || []
  const totals = response?.totals || { debits: 0, credits: 0 }

  function handleClearFilters() {
    setFilterAccountId('all')
    setFilterFrom('')
    setFilterTo('')
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 w-full sm:w-auto">
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                Cuenta
              </Label>
              <Select value={filterAccountId} onValueChange={setFilterAccountId}>
                <SelectTrigger className="w-full focus-visible:ring-primary/20 focus-visible:border-primary/40">
                  <SelectValue placeholder="Todas las cuentas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las cuentas</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name} ({ACCOUNT_TYPE_LABELS[a.type]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-auto">
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                Desde
              </Label>
              <Input
                type="date"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="w-full sm:w-auto">
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                Hasta
              </Label>
              <Input
                type="date"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="outline"
                size="sm"
                onClick={handleClearFilters}
                className="h-9 active:scale-[0.98] transition-all"
              >
                Limpiar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoadingEntries ? (
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
          <CardContent className="p-4">
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : entries.length === 0 ? (
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <ArrowRightLeft className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No se encontraron movimientos
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Intenta ajustar los filtros o la fecha
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
          <CardContent className="p-0">
            <div className="max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-muted/30 transition-colors">
                    <TableHead className="w-[120px]">Fecha</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead className="w-[100px]">Tipo</TableHead>
                    <TableHead className="text-right w-[130px]">Monto</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Descripción</TableHead>
                    <TableHead className="whitespace-nowrap text-xs w-[80px]">Referencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow className="hover:bg-muted/30 transition-colors" key={entry.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-xs font-medium">
                            {formatDateShort(entry.createdAt)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatTime(entry.createdAt)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate max-w-[150px]">
                            {entry.accountName}
                          </span>
                          <Badge
                            variant="outline"
                            className={`shrink-0 text-[9px] px-1.5 py-0 ${getAccountTypeColor(entry.accountType)}`}
                          >
                            {ACCOUNT_TYPE_LABELS[entry.accountType]?.slice(0, 4) || entry.accountType.slice(0, 4)}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-semibold ${getDirectionBadgeClass(entry.direction)}`}
                        >
                          {entry.direction === 'DEBIT' ? 'Débito' : 'Crédito'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`text-sm font-semibold tabular-nums ${
                            entry.direction === 'DEBIT'
                              ? 'text-teal-700 dark:text-teal-400'
                              : 'text-orange-700 dark:text-orange-400'
                          }`}
                        >
                          {entry.direction === 'DEBIT' ? '+' : '-'}
                          {formatCurrency(entry.amount, currencyCode)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground truncate max-w-[120px] block" title={entry.description || ''}>
                          {entry.description || '—'}
                        </span>
                      </TableCell>
                      <TableCell>
                        {entry.referenceType ? (
                          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            {REFERENCE_TYPE_LABELS[entry.referenceType] || entry.referenceType}
                            {entry.referenceId ? ` #${entry.referenceId}` : ''}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Summary row */}
            <Separator />
            <div className="flex items-center justify-between p-4 bg-muted/30">
              <span className="text-sm font-medium text-muted-foreground">
                Resumen: {entries.length} movimiento{entries.length !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-teal-500" />
                  <span className="text-xs text-muted-foreground">Débitos:</span>
                  <span className="text-sm font-bold text-teal-700 dark:text-teal-400 tabular-nums">
                    {formatCurrency(totals.debits, currencyCode)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-orange-500" />
                  <span className="text-xs text-muted-foreground">Créditos:</span>
                  <span className="text-sm font-bold text-orange-700 dark:text-orange-400 tabular-nums">
                    {formatCurrency(totals.credits, currencyCode)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
