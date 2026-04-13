'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Search,
  ClipboardList,
  CalendarDays,
  Filter,
  Package,
  User,
  CreditCard,
  FileText,
  Receipt,
  RotateCcw,
  Printer,
  X as XIcon,
  ShoppingBag,
  UtensilsCrossed,
  Percent,
} from 'lucide-react'
import { printTicket, type TicketItem } from '@/lib/print-ticket'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { KPIBar } from '@/components/shared/kpi-bar'
import { es } from 'date-fns/locale'

// ── Types ──────────────────────────────────────────────────────────────────

interface OrderSummary {
  id: number
  orderNumber: string
  customerName: string | null
  status: string
  paymentMethod: string
  total: number
  createdAt: string
  tableSessionId: number | null
  tableName: string | null
}

interface OrderDetail {
  id: number
  orderNumber: string
  status: string
  paymentMethod: string
  subtotal: number
  tipAmount: number
  total: number
  taxAmount?: number
  taxBreakdown?: Array<{ name: string; code: string; rate: number; base: number; amount: number }> | null
  discountAmount?: number
  notes: string | null
  createdAt: string
  tableName?: string | null
  customer: {
    id: number
    name: string
    phone: string | null
    email: string | null
  } | null
  orderItems: {
    id: number
    productName: string
    productId: number | null
    quantity: number
    returnedQuantity: number
    unitPrice: number
    totalRow: number
    isService?: boolean
    taxCode?: string
    taxRate?: number
    taxAmount?: number
    taxBase?: number
  }[]
}

// ── Component ──────────────────────────────────────────────────────────────

export function OrdersView() {
  const { store } = useAuthStore()
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sectionFilter, setSectionFilter] = useState<'ALL' | 'POS' | 'MESA'>('ALL')

  // Detail dialog
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null)
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Return dialog
  const [showReturnDialog, setShowReturnDialog] = useState(false)
  const [returnReason, setReturnReason] = useState('')
  const [returning, setReturning] = useState(false)
  const [returnItems, setReturnItems] = useState<Map<number, number>>(new Map())

  const fetchOrders = useCallback(async () => {
    if (!store?.id) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ storeId: store.id.toString() })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)
      if (search.trim()) params.set('q', search.trim())

      const res = await fetch(`/api/orders?${params}`)
      if (!res.ok) throw new Error('Error al cargar órdenes')
      const data = await res.json()
      setOrders(data)
    } catch {
      toast.error('Error al cargar órdenes')
    } finally {
      setLoading(false)
    }
  }, [store?.id, statusFilter, dateFrom, dateTo, search])

  useEffect(() => {
    const timer = setTimeout(() => fetchOrders(), 300)
    return () => clearTimeout(timer)
  }, [fetchOrders])

  const posOrders = useMemo(() => orders.filter(o => !o.tableSessionId), [orders])
  const mesaOrders = useMemo(() => orders.filter(o => !!o.tableSessionId), [orders])

  const displayOrders = useMemo(() => {
    if (sectionFilter === 'POS') return posOrders
    if (sectionFilter === 'MESA') return mesaOrders
    return orders
  }, [sectionFilter, posOrders, mesaOrders, orders])

  async function openOrderDetail(orderId: number) {
    if (!store?.id) { toast.error('Tienda no disponible'); return }
    setSelectedOrderId(orderId)
    setOrderDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/orders/${orderId}?storeId=${store.id}`)
      if (!res.ok) throw new Error()
      setOrderDetail(await res.json())
    } catch {
      toast.error('Error al cargar detalle')
    } finally {
      setDetailLoading(false)
    }
  }

  function handlePrintTicket(detail: OrderDetail) {
    if (!store) return
    const items: TicketItem[] = detail.orderItems.map(item => ({
      name: item.productName, quantity: item.quantity,
      unitPrice: item.unitPrice, total: item.totalRow, isService: item.isService,
    }))
    printTicket({
      storeName: store.name, storeNIT: store.nit || undefined,
      storeAddress: store.address || undefined, storePhone: store.phone || undefined,
      orderNumber: detail.orderNumber, date: detail.createdAt,
      customer: detail.customer?.name, tableName: detail.tableName ?? undefined,
      items, subtotal: detail.subtotal, tipAmount: detail.tipAmount,
      total: detail.total, paymentMethod: detail.paymentMethod,
      currencyCode: store.currencyCode, notes: detail.notes ?? undefined,
      taxAmount: detail.taxAmount || 0,
      taxBreakdown: detail.taxBreakdown || undefined,
      discountAmount: detail.discountAmount || 0,
    })
  }

  // ─── Return helpers ────────────────────────────────────
  function openReturnDialog() {
    if (!orderDetail) return
    const items = new Map<number, number>()
    for (const item of orderDetail.orderItems) {
      if (item.productId && item.quantity > item.returnedQuantity) {
        items.set(item.id, item.quantity - item.returnedQuantity)
      }
    }
    setReturnItems(items)
    setReturnReason('')
    setShowReturnDialog(true)
  }

  function toggleReturnItem(itemId: number, maxQty: number) {
    setReturnItems(prev => {
      const next = new Map(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.set(itemId, maxQty)
      return next
    })
  }

  function setReturnItemQty(itemId: number, qty: number, maxQty: number) {
    setReturnItems(prev => {
      const next = new Map(prev)
      next.set(itemId, Math.max(1, Math.min(qty, maxQty)))
      return next
    })
  }

  function selectAllReturnItems() {
    if (!orderDetail) return
    const items = new Map<number, number>()
    for (const item of orderDetail.orderItems) {
      if (item.productId && item.quantity > item.returnedQuantity)
        items.set(item.id, item.quantity - item.returnedQuantity)
    }
    setReturnItems(items)
  }

  function deselectAllReturnItems() { setReturnItems(new Map()) }

  async function handleReturnOrder() {
    if (!selectedOrderId || !store?.id || returnItems.size === 0) {
      toast.error('Selecciona al menos un producto')
      return
    }
    setReturning(true)
    try {
      const items = Array.from(returnItems.entries()).map(([orderItemId, quantity]) => ({ orderItemId, quantity }))
      const res = await fetch(`/api/orders/${selectedOrderId}/return`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, reason: returnReason.trim() || undefined }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al procesar devolución')
      }
      const data = await res.json()
      toast.success(data.message)
      setShowReturnDialog(false)
      setReturnItems(new Map())
      setSelectedOrderId(null)
      fetchOrders()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al procesar devolución')
    } finally {
      setReturning(false)
    }
  }

  function clearFilters() {
    setSearch(''); setStatusFilter('ALL'); setDateFrom(''); setDateTo(''); setSectionFilter('ALL')
  }

  const hasFilters = statusFilter !== 'ALL' || dateFrom || dateTo || search.trim() || sectionFilter !== 'ALL'

  // ─── Render helper for an order section ────────────────
  function renderOrderTable(orderList: OrderSummary[], icon: React.ReactNode, title: string, emptyMsg: string) {
    return (
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            {icon}
            <h3 className="font-semibold text-sm">{title}</h3>
            <Badge variant="secondary" className="ml-auto text-xs">{orderList.length}</Badge>
          </div>
          {orderList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-sm text-muted-foreground">{emptyMsg}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap text-xs">N° Orden</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Cliente</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Mesa</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Estado</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Método</TableHead>
                    <TableHead className="whitespace-nowrap text-xs text-right">Total</TableHead>
                    <TableHead className="whitespace-nowrap text-xs">Fecha</TableHead>
                    <TableHead className="whitespace-nowrap text-xs text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderList.map((order) => (
                    <TableRow key={order.id} className="cursor-pointer" onClick={() => openOrderDetail(order.id)}>
                      <TableCell className="font-mono text-xs font-medium truncate max-w-[70px]" title={order.orderNumber}>{order.orderNumber}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1.5 truncate max-w-[80px]" title={order.customerName || undefined}>
                          {order.customerName ? (
                            <><User className="h-3 w-3 text-muted-foreground shrink-0" /><span className="truncate">{order.customerName}</span></>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs truncate max-w-[60px]" title={order.tableName || undefined}>
                        {order.tableName || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell><StatusBadge status={order.status} /></TableCell>
                      <TableCell className="text-xs truncate max-w-[80px]" title={paymentMethodLabel(order.paymentMethod)}>{paymentMethodLabel(order.paymentMethod)}</TableCell>
                      <TableCell className="text-right font-medium text-xs truncate max-w-[70px]" title={formatCurrency(order.total, store?.currencyCode)}>{formatCurrency(order.total, store?.currencyCode)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[90px]" title={format(new Date(order.createdAt), 'dd MMM HH:mm', { locale: es })}>
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3 w-3 shrink-0" />
                          {format(new Date(order.createdAt), 'dd MMM HH:mm', { locale: es })}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Ver detalle"
                            onClick={(e) => { e.stopPropagation(); openOrderDetail(order.id) }}>
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Imprimir"
                            onClick={(e) => { e.stopPropagation(); openOrderDetail(order.id) }}>
                            <Printer className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <KPIBar context="orders" />

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Órdenes y Ventas</h2>
            <p className="text-sm text-muted-foreground">
              {loading ? '...' : `${orders.length} orden${orders.length !== 1 ? 'es' : ''}`}
            </p>
          </div>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────── */}
      <Card>
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar orden..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Estado" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="COMPLETED">Completadas</SelectItem>
                <SelectItem value="PENDING">Pendientes</SelectItem>
                <SelectItem value="CANCELLED">Canceladas</SelectItem>
                <SelectItem value="CREDIT">Fiado</SelectItem>
              </SelectContent>
            </Select>
            {/* Section Filter */}
            <Select value={sectionFilter} onValueChange={(v) => setSectionFilter(v as 'ALL' | 'POS' | 'MESA')}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Origen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los orígenes</SelectItem>
                <SelectItem value="POS">🏪 Punto de Venta</SelectItem>
                <SelectItem value="MESA">🍽️ Órdenes de Mesa</SelectItem>
              </SelectContent>
            </Select>
            {/* Date From */}
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} max={dateTo || undefined} />
            {/* Date To */}
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} min={dateFrom || undefined} />
          </div>
        </CardContent>
      </Card>

      {/* ── Order Sections ─────────────────────────────────── */}
      {loading ? (
        <div className="space-y-4">
          <Card><CardContent className="p-4"><div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}</div></CardContent></Card>
        </div>
      ) : sectionFilter === 'ALL' ? (
        /* Show both sections separately */
        <>
          {renderOrderTable(
            posOrders,
            <ShoppingBag className="h-4 w-4 text-emerald-600" />,
            'Tickets de Venta (Punto de Venta)',
            'Sin tickets de venta'
          )}
          <div className="py-2" />
          {renderOrderTable(
            mesaOrders,
            <UtensilsCrossed className="h-4 w-4 text-amber-600" />,
            'Órdenes de Mesa',
            'Sin órdenes de mesa'
          )}
        </>
      ) : sectionFilter === 'POS' ? (
        renderOrderTable(posOrders, <ShoppingBag className="h-4 w-4 text-emerald-600" />, 'Tickets de Venta (Punto de Venta)', 'Sin tickets de venta')
      ) : (
        renderOrderTable(mesaOrders, <UtensilsCrossed className="h-4 w-4 text-amber-600" />, 'Órdenes de Mesa', 'Sin órdenes de mesa')
      )}

      {/* ── Order Detail Dialog ────────────────────────────── */}
      <Dialog open={!!selectedOrderId} onOpenChange={(open) => !open && setSelectedOrderId(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              {orderDetail?.tableName ? `Orden de ${orderDetail.tableName}` : 'Ticket de Venta'}
            </DialogTitle>
            <DialogDescription>{orderDetail ? `Orden ${orderDetail.orderNumber}` : 'Cargando...'}</DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="space-y-4 p-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}</div>
          ) : orderDetail ? (
            <div className="space-y-5">
              {/* Order Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">N° de Orden</Label>
                  <p className="font-mono font-semibold">{orderDetail.orderNumber}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Origen</Label>
                  <p className="text-sm mt-0.5">
                    {orderDetail.tableName
                      ? <span className="inline-flex items-center gap-1"><UtensilsCrossed className="h-3.5 w-3.5 text-amber-600" />{orderDetail.tableName}</span>
                      : <span className="inline-flex items-center gap-1"><ShoppingBag className="h-3.5 w-3.5 text-emerald-600" />Punto de Venta</span>}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Estado</Label>
                  <div className="mt-0.5"><StatusBadge status={orderDetail.status} /></div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Método de Pago</Label>
                  <p className="flex items-center gap-1.5 text-sm mt-0.5">
                    <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                    {paymentMethodLabel(orderDetail.paymentMethod)}
                  </p>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">Fecha</Label>
                  <p className="flex items-center gap-1.5 text-sm mt-0.5">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    {format(new Date(orderDetail.createdAt), "dd MMMM yyyy 'a las' HH:mm", { locale: es })}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Customer */}
              {orderDetail.customer && (
                <>
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><User className="h-4 w-4" />Cliente</h4>
                    <Card className="bg-muted/30"><CardContent className="p-3">
                      <p className="font-medium">{orderDetail.customer.name}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                        {orderDetail.customer.phone && <span>{orderDetail.customer.phone}</span>}
                        {orderDetail.customer.email && <span>{orderDetail.customer.email}</span>}
                      </div>
                    </CardContent></Card>
                  </div>
                  <Separator />
                </>
              )}

              {/* Items */}
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Package className="h-4 w-4" />Productos ({orderDetail.orderItems.length})
                </h4>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-center">Cant.</TableHead>
                        <TableHead className="whitespace-nowrap text-xs text-right">P. Unit.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderDetail.orderItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium text-sm">
                            {item.productName}
                            {item.returnedQuantity > 0 && (
                              <Badge variant="outline" className="ml-2 text-xs text-amber-600 border-amber-300">
                                Dev: {item.returnedQuantity}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center text-sm">{item.quantity}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {formatCurrency(item.unitPrice, store?.currencyCode)}
                          </TableCell>
                          <TableCell className="text-right font-medium text-sm">
                            {formatCurrency(item.totalRow, store?.currencyCode)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <Separator />

              {/* Totals */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span><span>{formatCurrency(orderDetail.subtotal, store?.currencyCode)}</span>
                </div>
                {orderDetail.taxAmount && orderDetail.taxAmount > 0 && (
                  <div className="flex items-center justify-between text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    <span className="flex items-center gap-1.5">
                      <Percent className="h-3.5 w-3.5" />
                      IVA Incluido
                    </span>
                    <span>{formatCurrency(orderDetail.taxAmount, store?.currencyCode || 'COP')}</span>
                  </div>
                )}
                {orderDetail.taxBreakdown && orderDetail.taxBreakdown.length > 0 && (
                  <div className="space-y-0.5 pl-6">
                    {orderDetail.taxBreakdown.map((tax, i) => (
                      <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{tax.name} ({tax.rate}%) — Base: {formatCurrency(tax.base, store?.currencyCode || 'COP')}</span>
                        <span>{formatCurrency(tax.amount, store?.currencyCode || 'COP')}</span>
                      </div>
                    ))}
                  </div>
                )}
                {orderDetail.tipAmount > 0 && (
                  <div className="flex justify-between text-sm text-pink-600 dark:text-pink-400">
                    <span>Propina</span><span>{formatCurrency(orderDetail.tipAmount, store?.currencyCode)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold text-base">
                  <span>Total</span><span>{formatCurrency(orderDetail.total, store?.currencyCode)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button onClick={() => handlePrintTicket(orderDetail)} className="flex-1" variant="outline">
                  <Printer className="h-4 w-4 mr-2" />Imprimir
                </Button>
                {orderDetail.status === 'COMPLETED' && orderDetail.orderItems.some(i => i.productId && i.quantity > i.returnedQuantity) && (
                  <Button variant="destructive" onClick={openReturnDialog} className="flex-1">
                    <RotateCcw className="h-4 w-4 mr-2" />Devolver
                  </Button>
                )}
              </div>

              {/* Notes */}
              {orderDetail.notes && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-semibold mb-1.5 flex items-center gap-1.5"><FileText className="h-4 w-4" />Notas</h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap rounded-lg bg-muted/30 p-3">{orderDetail.notes}</p>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground"><p>No se pudo cargar el detalle.</p></div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Return Dialog (Partial Selection) ────────────────── */}
      <Dialog open={showReturnDialog} onOpenChange={(open) => { if (!open) { setShowReturnDialog(false); setReturnItems(new Map()) } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-destructive" />
              Devolver Venta {orderDetail?.orderNumber}
            </DialogTitle>
            <DialogDescription>
              Selecciona los productos y cantidades que deseas devolver al inventario.
            </DialogDescription>
          </DialogHeader>

          {orderDetail && (
            <div className="space-y-4">
              {/* Select All / Deselect All */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {returnItems.size} de {orderDetail.orderItems.filter(i => i.productId && i.quantity > i.returnedQuantity).length} producto(s) seleccionado(s)
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAllReturnItems}>Seleccionar todos</Button>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={deselectAllReturnItems}>Quitar todos</Button>
                </div>
              </div>

              {/* Items list */}
              <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
                {orderDetail.orderItems.filter(i => i.productId && i.quantity > i.returnedQuantity).length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">No hay productos devolvibles en esta venta.</div>
                ) : (
                  orderDetail.orderItems.map((item) => {
                    if (!item.productId) return null
                    const available = item.quantity - item.returnedQuantity
                    if (available <= 0) return null
                    const isSelected = returnItems.has(item.id)
                    const returnQty = returnItems.get(item.id) || 0

                    return (
                      <div key={item.id} className={`flex items-center gap-3 p-3 ${isSelected ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleReturnItem(item.id, available)}
                          className="h-4 w-4 rounded border-gray-300 text-destructive focus:ring-destructive"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            Vendido: {item.quantity}{item.returnedQuantity > 0 ? ` · Devuelto: ${item.returnedQuantity}` : ''} · Disponible: {available}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => setReturnItemQty(item.id, returnQty - 1, available)}
                              disabled={returnQty <= 1}
                              className="h-7 w-7 rounded-md border bg-background flex items-center justify-center text-sm hover:bg-muted disabled:opacity-50">−</button>
                            <Input type="number" min={1} max={available} value={returnQty}
                              onChange={(e) => setReturnItemQty(item.id, Number(e.target.value) || 1, available)}
                              className="h-7 w-14 text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                            <button type="button" onClick={() => setReturnItemQty(item.id, returnQty + 1, available)}
                              disabled={returnQty >= available}
                              className="h-7 w-7 rounded-md border bg-background flex items-center justify-center text-sm hover:bg-muted disabled:opacity-50">+</button>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              {/* Services note */}
              {orderDetail.orderItems.some(i => !i.productId) && (
                <p className="text-xs text-muted-foreground italic">Los servicios no se pueden devolver al inventario.</p>
              )}

              {/* Reason */}
              <div className="space-y-1.5">
                <Label htmlFor="return-reason" className="text-xs font-medium">Motivo de la devolución (opcional)</Label>
                <Textarea id="return-reason" value={returnReason} onChange={(e) => setReturnReason(e.target.value)}
                  placeholder="Ej: Error en el pedido, producto defectuoso..." rows={2} className="text-xs min-h-[60px]" />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setShowReturnDialog(false); setReturnItems(new Map()) }} disabled={returning}>Cancelar</Button>
                <Button variant="destructive" onClick={handleReturnOrder} disabled={returning || returnItems.size === 0}>
                  {returning ? 'Procesando...' : `Devolver ${returnItems.size > 0 ? `(${returnItems.size} producto${returnItems.size > 1 ? 's' : ''})` : ''}`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    COMPLETED: { label: 'Completada', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
    PENDING: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
    CANCELLED: { label: 'Cancelada', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800' },
    CREDIT: { label: 'Fiado', className: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 border-teal-200 dark:border-teal-800' },
  }
  const s = map[status] || { label: status, className: 'bg-muted text-muted-foreground border-border' }
  return <Badge variant="outline" className={s.className}>{s.label}</Badge>
}

function paymentMethodLabel(method: string) {
  const labels: Record<string, string> = {
    CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia', MIXED: 'Mixto',
    FIADO: 'Fiado', NEQUI: 'Nequi', DAVIPLATA: 'Daviplata',
  }
  return labels[method] || method
}
