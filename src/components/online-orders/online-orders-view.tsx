'use client'

import { useMemo, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import { paymentMethodLabel } from '@/lib/format'
import { buildWaMeUrl } from '@/lib/phone'
import {
  useOnlineOrders,
  useAcceptOnlineOrder,
  useRejectOnlineOrder,
  type OnlineOrder,
} from '@/hooks/api/use-online-orders'
import { useOnlineOrdersSync } from '@/hooks/use-online-orders-sync'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  ShoppingBag, Bike, Search, Filter, X as XIcon, CalendarDays, User, Phone,
  MapPin, MessageCircle, Check, Loader2, Package, Store,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const PAYMENT_METHODS = ['CASH', 'NEQUI', 'DAVIPLATA', 'CARD', 'TRANSFER'] as const

export function OnlineOrdersView() {
  const { store } = useAuthStore()
  const currency = store?.currencyCode

  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')

  const [selected, setSelected] = useState<OnlineOrder | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH')
  const [createCustomer, setCreateCustomer] = useState(false)
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const query = useOnlineOrders(store?.id, {
    status: statusFilter,
    from: dateFrom || undefined,
    to: dateTo || undefined,
    q: search.trim() || undefined,
  })
  useOnlineOrdersSync(store?.id, {
    onNew: () => toast.info('Nuevo pedido en línea', { description: 'Revísalo en la bandeja' }),
  })

  const accept = useAcceptOnlineOrder()
  const reject = useRejectOnlineOrder()

  const rows = query.data?.data ?? []
  const pendingCount = query.data?.pendingCount ?? 0

  const kpis = useMemo(() => {
    const today = new Date().toDateString()
    const acceptedToday = rows.filter((o) => o.status === 'ACCEPTED' && new Date(o.createdAt).toDateString() === today)
    const totalToday = acceptedToday.reduce((s, o) => s + o.total, 0)
    return {
      pending: pendingCount,
      acceptedToday: acceptedToday.length,
      totalToday,
      avg: acceptedToday.length ? Math.round(totalToday / acceptedToday.length) : 0,
    }
  }, [rows, pendingCount])

  function openDetail(o: OnlineOrder) {
    setSelected(o)
    setRejectMode(false)
    setRejectReason('')
    setCreateCustomer(false)
    setPaymentMethod('CASH')
  }

  async function handleAccept() {
    if (!selected) return
    try {
      const res = await accept.mutateAsync({ id: selected.id, paymentMethod, createCustomer })
      toast.success(`Pedido ${selected.orderNumber} aceptado`, {
        description: res.orderNumber ? `Venta ${res.orderNumber} creada` : undefined,
      })
      setSelected(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo aceptar el pedido')
    }
  }

  async function handleReject() {
    if (!selected) return
    try {
      await reject.mutateAsync({ id: selected.id, reason: rejectReason.trim() || undefined })
      toast.success(`Pedido ${selected.orderNumber} rechazado`)
      setSelected(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo rechazar el pedido')
    }
  }

  function contactCustomer(o: OnlineOrder) {
    const msg = `Hola ${o.customerName}, te escribo por tu pedido ${o.orderNumber} en ${store?.name ?? 'la tienda'}.`
    window.open(buildWaMeUrl(o.customerPhoneNormalized, msg), '_blank')
  }

  function clearFilters() {
    setStatusFilter('PENDING'); setDateFrom(''); setDateTo(''); setSearch('')
  }
  const hasFilters = statusFilter !== 'PENDING' || dateFrom || dateTo || search.trim()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Bike className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Pedidos en línea</h2>
          <p className="text-sm text-muted-foreground">
            {query.isLoading ? '...' : `${kpis.pending} pendiente${kpis.pending !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Pendientes ahora" value={String(kpis.pending)} highlight={kpis.pending > 0} />
        <KpiCard label="Aceptados hoy" value={String(kpis.acceptedToday)} />
        <KpiCard label="Total del día" value={formatCurrency(kpis.totalToday, currency)} />
        <KpiCard label="Ticket promedio" value={formatCurrency(kpis.avg, currency)} />
      </div>

      {/* Filters */}
      <Card className="rounded-xl border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros</span>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={clearFilters}>
                <XIcon className="h-3 w-3" /> Limpiar
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Cliente, teléfono o N°..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pendientes</SelectItem>
                <SelectItem value="ACCEPTED">Aceptados</SelectItem>
                <SelectItem value="REJECTED">Rechazados</SelectItem>
                <SelectItem value="CANCELLED">Cancelados</SelectItem>
                <SelectItem value="ALL">Todos</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} max={dateTo || undefined} />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} min={dateFrom || undefined} />
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="rounded-xl border-border/50">
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="p-4 space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <ShoppingBag className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm text-muted-foreground">Sin pedidos en esta vista</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs whitespace-nowrap">N°</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Fecha</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Cliente</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Teléfono</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Tipo</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Dirección</TableHead>
                    <TableHead className="text-xs whitespace-nowrap text-center">Ítems</TableHead>
                    <TableHead className="text-xs whitespace-nowrap text-right">Domicilio</TableHead>
                    <TableHead className="text-xs whitespace-nowrap text-right">Total</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((o) => (
                    <TableRow key={o.id} className="cursor-pointer hover:bg-muted/30" onClick={() => openDetail(o)}>
                      <TableCell className="font-mono text-xs font-medium">{o.orderNumber}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(o.createdAt), 'dd MMM HH:mm', { locale: es })}
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[120px]" title={o.customerName}>{o.customerName}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{o.customerPhone}</TableCell>
                      <TableCell className="text-xs">
                        {o.fulfillmentType === 'DELIVERY'
                          ? <span className="inline-flex items-center gap-1 text-emerald-600"><Bike className="h-3.5 w-3.5" />Domicilio</span>
                          : <span className="inline-flex items-center gap-1 text-muted-foreground"><ShoppingBag className="h-3.5 w-3.5" />Recoge</span>}
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[160px]" title={o.deliveryAddress || undefined}>
                        {o.deliveryAddress || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-center">{o.items.length}</TableCell>
                      <TableCell className="text-xs text-right">{o.deliveryFee > 0 ? formatCurrency(o.deliveryFee, currency) : '—'}</TableCell>
                      <TableCell className="text-xs text-right font-medium">{formatCurrency(o.total, currency)}</TableCell>
                      <TableCell><StatusBadge status={o.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Bike className="h-5 w-5" />
                  Pedido {selected.orderNumber}
                </DialogTitle>
                <DialogDescription>
                  {format(new Date(selected.createdAt), "dd MMM yyyy 'a las' HH:mm", { locale: es })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Customer + delivery */}
                <Card className="bg-muted/30 rounded-xl border-border/50">
                  <CardContent className="p-3 space-y-1.5 text-sm">
                    <p className="flex items-center gap-1.5 font-medium"><User className="h-4 w-4" />{selected.customerName}</p>
                    <p className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3.5 w-3.5" />{selected.customerPhone}</p>
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      {selected.fulfillmentType === 'DELIVERY'
                        ? <><MapPin className="h-3.5 w-3.5" />{selected.deliveryAddress}</>
                        : <><Store className="h-3.5 w-3.5" />Recoge en tienda</>}
                    </p>
                    {selected.deliveryNotes && <p className="text-xs text-muted-foreground pl-5">{selected.deliveryNotes}</p>}
                    <Button variant="outline" size="sm" className="mt-1 gap-1.5 h-8 text-xs" onClick={() => contactCustomer(selected)}>
                      <MessageCircle className="h-3.5 w-3.5" /> Escribir al cliente por WhatsApp
                    </Button>
                  </CardContent>
                </Card>

                {/* Items */}
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <Package className="h-4 w-4" />Productos ({selected.items.length})
                  </h4>
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableBody>
                        {selected.items.map((it) => (
                          <TableRow key={it.id}>
                            <TableCell className="text-sm">
                              {it.productName}
                              {it.presentationName && <span className="text-muted-foreground"> · {it.presentationName}</span>}
                            </TableCell>
                            <TableCell className="text-center text-sm">{it.quantity}</TableCell>
                            <TableCell className="text-right text-sm">{formatCurrency(it.totalRow, currency)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Totals */}
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{formatCurrency(selected.subtotal, currency)}</span></div>
                  {selected.deliveryFee > 0 && (
                    <div className="flex justify-between text-muted-foreground"><span>Domicilio</span><span>{formatCurrency(selected.deliveryFee, currency)}</span></div>
                  )}
                  <Separator />
                  <div className="flex justify-between font-semibold text-base"><span>Total</span><span>{formatCurrency(selected.total, currency)}</span></div>
                </div>

                {selected.status === 'PENDING' ? (
                  rejectMode ? (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Motivo del rechazo (opcional)</Label>
                        <Textarea rows={2} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Ej: sin stock, fuera de zona de cobertura..." className="text-sm min-h-[60px]" />
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" onClick={() => setRejectMode(false)} disabled={reject.isPending}>Volver</Button>
                        <Button variant="destructive" className="flex-1" onClick={handleReject} disabled={reject.isPending}>
                          {reject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar rechazo'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 items-end">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Método de pago</Label>
                          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{paymentMethodLabel(m)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-muted-foreground pb-2">
                          <input type="checkbox" checked={createCustomer} onChange={(e) => setCreateCustomer(e.target.checked)} className="h-4 w-4" />
                          Guardar cliente
                        </label>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Al aceptar se crea la venta (descuenta stock y necesita caja abierta).
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" className="flex-1" onClick={() => setRejectMode(true)} disabled={accept.isPending}>Rechazar</Button>
                        <Button className="flex-1 gap-1.5" onClick={handleAccept} disabled={accept.isPending}>
                          {accept.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          Aceptar
                        </Button>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                    <StatusBadge status={selected.status} />
                    {selected.rejectionReason && <p className="mt-1 text-xs">{selected.rejectionReason}</p>}
                    {selected.convertedToOrderId && <p className="mt-1 text-xs">Venta #{selected.convertedToOrderId}</p>}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function KpiCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={`rounded-xl border-border/50 ${highlight ? 'border-primary/40 bg-primary/5' : ''}`}>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold mt-0.5">{value}</p>
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    PENDING: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
    ACCEPTED: { label: 'Aceptado', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
    REJECTED: { label: 'Rechazado', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800' },
    CANCELLED: { label: 'Cancelado', className: 'bg-muted text-muted-foreground border-border' },
  }
  const s = map[status] || { label: status, className: 'bg-muted text-muted-foreground border-border' }
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>
}
