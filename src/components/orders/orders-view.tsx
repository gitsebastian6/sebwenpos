'use client'

import { useEffect, useState, useCallback } from 'react'
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
  X as XIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
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
}

interface OrderDetail {
  id: number
  orderNumber: string
  status: string
  paymentMethod: string
  subtotal: number
  total: number
  notes: string | null
  createdAt: string
  customer: {
    id: number
    name: string
    phone: string | null
    email: string | null
  } | null
  orderItems: {
    id: number
    productName: string
    quantity: number
    unitPrice: number
    totalRow: number
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

  // Detail dialog
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null)
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

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

  async function openOrderDetail(orderId: number) {
    if (!store?.id) {
      toast.error('Tienda no disponible')
      return
    }
    setSelectedOrderId(orderId)
    setOrderDetail(null)
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/orders/${orderId}?storeId=${store.id}`)
      if (!res.ok) throw new Error('Error')
      const data = await res.json()
      setOrderDetail(data)
    } catch {
      toast.error('Error al cargar detalle de orden')
    } finally {
      setDetailLoading(false)
    }
  }

  function clearFilters() {
    setSearch('')
    setStatusFilter('ALL')
    setDateFrom('')
    setDateTo('')
  }

  const hasFilters = statusFilter !== 'ALL' || dateFrom || dateTo || search.trim()

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Órdenes</h2>
            <p className="text-sm text-muted-foreground">
              {loading ? '...' : `${orders.length} orden${orders.length !== 1 ? 'es' : ''}`}
            </p>
          </div>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros</span>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 text-xs"
                onClick={clearFilters}
              >
                <XIcon className="h-3 w-3" />
                Limpiar
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar orden..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="COMPLETED">Completadas</SelectItem>
                <SelectItem value="PENDING">Pendientes</SelectItem>
                <SelectItem value="CANCELLED">Canceladas</SelectItem>
                <SelectItem value="CREDIT">Fiado</SelectItem>
              </SelectContent>
            </Select>

            {/* Date From */}
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              max={dateTo || undefined}
            />

            {/* Date To */}
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom || undefined}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Table ───────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ClipboardList className="mb-3 h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground font-medium">
                No se encontraron órdenes
              </p>
              <p className="text-sm text-muted-foreground/70">
                {hasFilters
                  ? 'Intenta cambiar los filtros'
                  : 'Las órdenes aparecerán aquí cuando se realicen ventas'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Orden</TableHead>
                    <TableHead className="hidden md:table-cell">Cliente</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="hidden lg:table-cell">Método</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="hidden sm:table-cell">Fecha</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow
                      key={order.id}
                      className="cursor-pointer"
                      onClick={() => openOrderDetail(order.id)}
                    >
                      <TableCell className="font-mono text-sm font-medium">
                        {order.orderNumber}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-1.5">
                          {order.customerName ? (
                            <>
                              <User className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm">{order.customerName}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground text-sm">
                              Sin cliente
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">
                        {paymentMethodLabel(order.paymentMethod)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(order.total, store?.currencyCode)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {format(new Date(order.createdAt), 'dd MMM yyyy HH:mm', {
                            locale: es,
                          })}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Ver detalle"
                          onClick={(e) => {
                            e.stopPropagation()
                            openOrderDetail(order.id)
                          }}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Order Detail Dialog ─────────────────────────────────── */}
      <Dialog
        open={!!selectedOrderId}
        onOpenChange={(open) => !open && setSelectedOrderId(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Detalle de Orden
            </DialogTitle>
            <DialogDescription>
              {orderDetail
                ? `Orden ${orderDetail.orderNumber}`
                : 'Cargando...'}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="space-y-4 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : orderDetail ? (
            <div className="space-y-5">
              {/* ── Order Info ───────────────────────────────── */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">N° de Orden</Label>
                  <p className="font-mono font-semibold">{orderDetail.orderNumber}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Estado</Label>
                  <div className="mt-0.5">
                    <StatusBadge status={orderDetail.status} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Método de Pago</Label>
                  <p className="flex items-center gap-1.5 text-sm mt-0.5">
                    <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                    {paymentMethodLabel(orderDetail.paymentMethod)}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Fecha</Label>
                  <p className="flex items-center gap-1.5 text-sm mt-0.5">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    {format(
                      new Date(orderDetail.createdAt),
                      "dd MMMM yyyy 'a las' HH:mm",
                      { locale: es }
                    )}
                  </p>
                </div>
              </div>

              <Separator />

              {/* ── Customer Info ────────────────────────────── */}
              {orderDetail.customer && (
                <>
                  <div>
                    <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <User className="h-4 w-4" />
                      Cliente
                    </h4>
                    <Card className="bg-muted/30">
                      <CardContent className="p-3">
                        <p className="font-medium">{orderDetail.customer.name}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                          {orderDetail.customer.phone && (
                            <span>{orderDetail.customer.phone}</span>
                          )}
                          {orderDetail.customer.email && (
                            <span>{orderDetail.customer.email}</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                  <Separator />
                </>
              )}

              {/* ── Items Table ──────────────────────────────── */}
              <div>
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Package className="h-4 w-4" />
                  Productos ({orderDetail.orderItems.length})
                </h4>
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-center">Cant.</TableHead>
                        <TableHead className="hidden sm:table-cell text-right">P. Unit.</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderDetail.orderItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium text-sm">
                            {item.productName}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {item.quantity}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-right text-sm text-muted-foreground">
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

              {/* ── Totals ──────────────────────────────────── */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(orderDetail.subtotal, store?.currencyCode)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold text-base">
                  <span>Total</span>
                  <span>{formatCurrency(orderDetail.total, store?.currencyCode)}</span>
                </div>
              </div>

              {/* ── Notes ────────────────────────────────────── */}
              {orderDetail.notes && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-semibold mb-1.5 flex items-center gap-1.5">
                      <FileText className="h-4 w-4" />
                      Notas
                    </h4>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap rounded-lg bg-muted/30 p-3">
                      {orderDetail.notes}
                    </p>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <p>No se pudo cargar el detalle.</p>
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
    COMPLETED: {
      label: 'Completada',
      className:
        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    },
    PENDING: {
      label: 'Pendiente',
      className:
        'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    },
    CANCELLED: {
      label: 'Cancelada',
      className:
        'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800',
    },
    CREDIT: {
      label: 'Fiado',
      className:
        'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 border-teal-200 dark:border-teal-800',
    },
  }
  const s = map[status] || {
    label: status,
    className: 'bg-muted text-muted-foreground border-border',
  }
  return (
    <Badge variant="outline" className={s.className}>
      {s.label}
    </Badge>
  )
}

function paymentMethodLabel(method: string) {
  const labels: Record<string, string> = {
    CASH: 'Efectivo',
    CARD: 'Tarjeta',
    TRANSFER: 'Transferencia',
    MIXED: 'Mixto',
  }
  return labels[method] || method
}
