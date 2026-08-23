'use client'

import { useMemo, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useExpirations } from '@/hooks/api/use-expirations'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Search, CalendarClock, AlertTriangle, CheckCircle2, PackageX, Info } from 'lucide-react'
import { format, differenceInCalendarDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatQty } from '@/lib/format'

// ── Constants ─────────────────────────────────────────────────────────────

const PROXIMO_DAYS = 30

type LotStatus = 'vencido' | 'proximo' | 'vigente'
type StatusFilter = 'all' | LotStatus

export function getStatus(expiryDate: string): { status: LotStatus; days: number } {
  const days = differenceInCalendarDays(parseISO(expiryDate), new Date())
  if (days < 0) return { status: 'vencido', days }
  if (days <= PROXIMO_DAYS) return { status: 'proximo', days }
  return { status: 'vigente', days }
}

function StatusBadge({ status, days }: { status: LotStatus; days: number }) {
  if (status === 'vencido') {
    return (
      <Badge variant="destructive" className="gap-1 whitespace-nowrap">
        <AlertTriangle className="h-3 w-3" />Vencido hace {Math.abs(days)}d
      </Badge>
    )
  }
  if (status === 'proximo') {
    return (
      <Badge className="gap-1 whitespace-nowrap bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 hover:bg-amber-100">
        <CalendarClock className="h-3 w-3" />Vence en {days}d
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="gap-1 whitespace-nowrap text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700">
      <CheckCircle2 className="h-3 w-3" />Vigente
    </Badge>
  )
}

// ── Component ────────────────────────────────────────────────────────────

export function ExpirationsView() {
  const { store } = useAuthStore()
  const { data: lots = [], isLoading } = useExpirations(store?.id)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [onlyInStock, setOnlyInStock] = useState(false)

  const enriched = useMemo(
    () => lots.map((lot) => ({ ...lot, ...getStatus(lot.expiryDate) })),
    [lots],
  )

  const counts = useMemo(() => ({
    vencido: enriched.filter((l) => l.status === 'vencido').length,
    proximo: enriched.filter((l) => l.status === 'proximo').length,
    vigente: enriched.filter((l) => l.status === 'vigente').length,
  }), [enriched])

  const filtered = useMemo(() => {
    let list = enriched
    if (statusFilter !== 'all') list = list.filter((l) => l.status === statusFilter)
    if (onlyInStock) list = list.filter((l) => l.productCurrentStock > 0)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((l) =>
        l.productName.toLowerCase().includes(q) || (l.lotNumber || '').toLowerCase().includes(q))
    }
    return list
  }, [enriched, statusFilter, onlyInStock, search])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <CalendarClock className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Vencimientos</h2>
          <p className="text-sm text-muted-foreground">Lotes registrados en Compras, ordenados por fecha de vencimiento</p>
        </div>
      </div>

      {/* Caveat */}
      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          El stock se controla en un solo total por producto, no por lote — la &quot;cantidad&quot; aquí es lo que entró en esa
          compra menos lo devuelto, no necesariamente lo que queda exacto de ese lote si el producto tiene varias entradas
          distintas. Sirve como aviso; no reemplaza revisar físicamente el estante.
        </p>
      </div>

      {/* KPIs — also act as filter shortcuts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button type="button" onClick={() => setStatusFilter(statusFilter === 'vencido' ? 'all' : 'vencido')} className="text-left">
          <Card className={`p-3 transition-all hover:shadow-md ${statusFilter === 'vencido' ? 'ring-2 ring-red-500' : ''}`}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><AlertTriangle className="h-3.5 w-3.5 text-red-500" />Vencidos</div>
            <p className="text-lg font-semibold text-red-600 dark:text-red-400">{counts.vencido}</p>
          </Card>
        </button>
        <button type="button" onClick={() => setStatusFilter(statusFilter === 'proximo' ? 'all' : 'proximo')} className="text-left">
          <Card className={`p-3 transition-all hover:shadow-md ${statusFilter === 'proximo' ? 'ring-2 ring-amber-500' : ''}`}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><CalendarClock className="h-3.5 w-3.5 text-amber-500" />Próximos a vencer ({PROXIMO_DAYS} días)</div>
            <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">{counts.proximo}</p>
          </Card>
        </button>
        <button type="button" onClick={() => setStatusFilter(statusFilter === 'vigente' ? 'all' : 'vigente')} className="text-left">
          <Card className={`p-3 transition-all hover:shadow-md ${statusFilter === 'vigente' ? 'ring-2 ring-emerald-500' : ''}`}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />Vigentes</div>
            <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{counts.vigente}</p>
          </Card>
        </button>
      </div>

      {/* Search + filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por producto o lote..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                { key: 'all', label: 'TODOS' },
                { key: 'vencido', label: 'VENCIDOS' },
                { key: 'proximo', label: 'PRÓXIMOS' },
                { key: 'vigente', label: 'VIGENTES' },
              ] as const).map((f) => (
                <Button key={f.key} variant={statusFilter === f.key ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(f.key)} className="text-xs h-8">
                  {f.label}
                </Button>
              ))}
            </div>
            <Button variant={onlyInStock ? 'default' : 'outline'} size="sm" className="text-xs h-8" onClick={() => setOnlyInStock((v) => !v)}>
              Solo con stock
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <PackageX className="mb-3 h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground font-medium">No hay lotes que coincidan</p>
              <p className="text-sm text-muted-foreground/70">
                {lots.length === 0 ? 'Registra fecha de vencimiento al crear una compra para verlos aquí' : 'Intenta con otra búsqueda o filtro'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead className="text-center">Cant. Recibida</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Compra</TableHead>
                  <TableHead>Proveedor</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filtered.map((lot) => (
                    <TableRow key={lot.id} className={!lot.productIsActive ? 'opacity-60' : ''}>
                      <TableCell>
                        <p className="font-medium text-sm">{lot.productName}{lot.presentationName ? ` — ${lot.presentationName}` : ''}</p>
                        <p className="text-xs text-muted-foreground">Stock actual: {lot.productCurrentStock}</p>
                      </TableCell>
                      <TableCell className="text-sm font-mono">{lot.lotNumber || '—'}</TableCell>
                      <TableCell className="text-center text-sm">
                        {formatQty(lot.remainingInLot)}
                        {lot.returnedQuantity > 0 && <span className="text-xs text-muted-foreground block">de {formatQty(lot.quantityReceived)}</span>}
                      </TableCell>
                      <TableCell className="text-sm">{format(parseISO(lot.expiryDate), 'd MMM yyyy', { locale: es })}</TableCell>
                      <TableCell><StatusBadge status={lot.status} days={lot.days} /></TableCell>
                      <TableCell className="text-sm">{lot.purchaseConsecutive || `#${lot.purchaseId}`}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{lot.providerName || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
