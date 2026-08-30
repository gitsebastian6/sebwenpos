'use client'

import { useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useCustomers, useCreateCustomer, useUpdateCustomer, usePayCustomerDebt } from '@/hooks/api/use-customers'
import { useOrders } from '@/hooks/api/use-orders'
import { formatCurrency } from '@/lib/auth'
import type { Customer, OrderHistoryEntry } from '@/types'
import { paymentMethodLabel } from '@/lib/format'
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
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Search,
  Plus,
  Pencil,
  Eye,
  Users,
  Phone,
  Mail,
  CalendarDays,
  AlertTriangle,
  Wallet,
  Banknote,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { KPIBar } from '@/components/shared/kpi-bar'
import { es } from 'date-fns/locale'

// ── Component ──────────────────────────────────────────────────────────────

export function CustomersView() {
  const { store } = useAuthStore()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null)
  const [historyCustomerId, setHistoryCustomerId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')

  // Debt payment state
  const [payingCustomer, setPayingCustomer] = useState<Customer | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [payMethod, setPayMethod] = useState('CASH')
  const [paying, setPaying] = useState(false)

  // ─── TanStack Query hooks ──────────────────────────────────────────────
  const customersQuery = useCustomers(store?.id, {
    search: search || undefined,
  })
  const customers = customersQuery.data?.data ?? []
  const loading = customersQuery.isLoading

  const historyOrdersQuery = useOrders(store?.id, {
    customerId: historyCustomerId ?? undefined,
  })

  // ─── Mutation hooks ──────────────────────────────────────────────────
  const createCustomerMut = useCreateCustomer()
  const updateCustomerMut = useUpdateCustomer()
  const payDebtMut = usePayCustomerDebt()

  function openCreateDialog() {
    setEditingCustomer(null)
    setFormName('')
    setFormPhone('')
    setFormEmail('')
    setDialogOpen(true)
  }

  function openEditDialog(customer: Customer) {
    setEditingCustomer(customer)
    setFormName(customer.name)
    setFormPhone(customer.phone || '')
    setFormEmail(customer.email || '')
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    if (!store?.id) {
      toast.error('Tienda no disponible')
      return
    }
    setSubmitting(true)
    try {
      const body: any = {
        storeId: store.id,
        name: formName.trim(),
      }
      if (formPhone.trim()) body.phone = formPhone.trim()
      if (formEmail.trim()) body.email = formEmail.trim()

      if (editingCustomer) {
        delete body.storeId
        await updateCustomerMut.mutateAsync({ id: editingCustomer.id, body })
        toast.success('Cliente actualizado')
      } else {
        await createCustomerMut.mutateAsync({ body })
        toast.success('Cliente creado')
      }
      setDialogOpen(false)
    } catch {
      toast.error(editingCustomer ? 'Error al actualizar cliente' : 'Error al crear cliente')
    } finally {
      setSubmitting(false)
    }
  }

  function viewOrderHistory(customer: Customer) {
    if (!store?.id) {
      toast.error('Tienda no disponible')
      return
    }
    setHistoryCustomer(customer)
    setHistoryCustomerId(customer.id)
  }

  async function handlePayDebt(e: React.FormEvent) {
    e.preventDefault()
    if (!payingCustomer || !store?.id) return
    const amount = Number(payAmount)
    if (!amount || amount <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }
    setPaying(true)
    try {
      const data = await payDebtMut.mutateAsync({
        id: payingCustomer.id,
        body: {
          storeId: store.id,
          amount,
          note: payNote.trim() || undefined,
          paymentMethod: payMethod,
        },
      })
      toast.success(data.message)
      setPayingCustomer(null)
      setPayAmount('')
      setPayNote('')
      setPayMethod('CASH')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al registrar abono')
    } finally {
      setPaying(false)
    }
  }

  function openPayDialog(customer: Customer) {
    setPayingCustomer(customer)
    setPayAmount('')
    setPayNote('')
  }

  const historyOrders = historyOrdersQuery.data?.data ?? []
  const historyLoading = historyOrdersQuery.isLoading

  return (
    <div className="space-y-6">
      <KPIBar context="customers" />

      {/* ── Header + Search ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Clientes</h2>
            <p className="text-sm text-muted-foreground">
              {loading ? '...' : `${customers.length} cliente${customers.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <Button onClick={openCreateDialog} size="sm" className="active:scale-[0.98] transition-all">
          <Plus className="h-4 w-4" />
          Nuevo Cliente
        </Button>
      </div>

      {/* ── Search Bar ──────────────────────────────────────────── */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o teléfono..."
              className="pl-9 focus-visible:ring-primary/20 focus-visible:border-primary/40 transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Table ───────────────────────────────────────────────── */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Users className="mb-3 h-16 w-16 text-muted-foreground/30 animate-pulse" />
              <p className="text-muted-foreground font-medium">No se encontraron clientes</p>
              <p className="text-sm text-muted-foreground/60">
                {search ? 'Intenta con otra búsqueda' : 'Crea tu primer cliente'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Nombre</TableHead>
                    <TableHead className="whitespace-nowrap">Teléfono</TableHead>
                    <TableHead className="whitespace-nowrap">Email</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Deuda Total</TableHead>
                    <TableHead className="whitespace-nowrap">Registro</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">
                        <span className="truncate max-w-[120px] block" title={customer.name}>{customer.name}</span>
                      </TableCell>
                      <TableCell>
                        {customer.phone ? (
                          <span className="inline-flex items-center gap-1 text-xs truncate max-w-[110px]" title={customer.phone}>
                            <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {customer.phone}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {customer.email ? (
                          <span className="inline-flex items-center gap-1 text-xs truncate max-w-[130px]" title={customer.email}>
                            <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {customer.email}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {customer.totalDebt > 0 ? (
                          <span className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {formatCurrency(customer.totalDebt, store?.currencyCode)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">$0.00</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {format(new Date(customer.createdAt), 'dd MMM yyyy', { locale: es })}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {customer.totalDebt > 0 && (
                            <Button
                              variant="default"
                              size="sm"
                              className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                              title="Abonar a deuda"
                              onClick={() => openPayDialog(customer)}
                            >
                              <Banknote className="h-3.5 w-3.5" />
                              <span>Abonar</span>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Ver historial"
                            aria-label="Ver historial de pedidos"
                            onClick={() => viewOrderHistory(customer)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Editar"
                            aria-label="Editar cliente"
                            onClick={() => openEditDialog(customer)}
                          >
                            <Pencil className="h-4 w-4" />
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

      {/* ── Create / Edit Dialog ────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent mobileFullscreen className="sm:max-w-md rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>
              {editingCustomer ? 'Editar Cliente' : 'Nuevo Cliente'}
            </DialogTitle>
            <DialogDescription>
              {editingCustomer
                ? 'Modifica los datos del cliente.'
                : 'Completa los datos para registrar un nuevo cliente.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="customer-name">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input
                id="customer-name"
                placeholder="Nombre del cliente"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-phone">Teléfono</Label>
              <Input
                id="customer-phone"
                placeholder="(555) 123-4567"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-email">Email</Label>
              <Input
                id="customer-email"
                type="email"
                placeholder="cliente@ejemplo.com"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || !formName.trim()}>
                {submitting
                  ? 'Guardando...'
                  : editingCustomer
                    ? 'Actualizar'
                    : 'Crear Cliente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Pay Debt Dialog ──────────────────────────────────── */}
      <Dialog open={!!payingCustomer} onOpenChange={(open) => !open && setPayingCustomer(null)}>
        <DialogContent mobileFullscreen className="sm:max-w-md rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-emerald-600" />
              Abonar a Deuda
            </DialogTitle>
            <DialogDescription>
              {payingCustomer && (
                <>
                  Registrar abono de{' '}
                  <span className="font-medium text-foreground">{payingCustomer.name}</span>
                  {payingCustomer.totalDebt > 0 && (
                    <span className="block mt-1 text-sm">
                      Deuda actual:{' '}
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        {formatCurrency(payingCustomer.totalDebt, store?.currencyCode)}
                      </span>
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePayDebt} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pay-amount">
                Monto del Abono <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
                <Input
                  id="pay-amount"
                  type="number"
                  min="1"
                  max={payingCustomer?.totalDebt || 99999999}
                  placeholder="0"
                  className="pl-7 text-lg font-semibold"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  autoFocus
                />
              </div>
              {payingCustomer && Number(payAmount) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Saldo restante:{' '}
                  {formatCurrency(
                  Math.max(0, payingCustomer.totalDebt - Number(payAmount)),
                  store?.currencyCode
                  )}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-method">Método de pago</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger id="pay-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Efectivo</SelectItem>
                  <SelectItem value="NEQUI">Nequi</SelectItem>
                  <SelectItem value="DAVIPLATA">Daviplata</SelectItem>
                  <SelectItem value="CARD">Tarjeta</SelectItem>
                  <SelectItem value="TRANSFER">Transferencia</SelectItem>
                </SelectContent>
              </Select>
              {payMethod === 'CASH' && (
                <p className="text-[11px] text-muted-foreground">Se sumará al efectivo esperado del turno de caja abierto.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pay-note">Nota (opcional)</Label>
              <Input
                id="pay-note"
                placeholder="Ej: Abono parcial del 15 de junio"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                size="sm"
                disabled={paying}
                onClick={() => {
                  if (payingCustomer && payingCustomer.totalDebt > 0) {
                    setPayAmount(String(payingCustomer.totalDebt))
                  }
                }}
              >
                Saldo Completo
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                size="sm"
                disabled={paying || !payAmount || Number(payAmount) <= 0}
              >
                {paying ? 'Procesando...' : `Pagar $${Number(payAmount || 0).toLocaleString('es-CO')}`}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Order History Dialog ────────────────────────────────── */}
      <Dialog
        open={!!historyCustomer}
        onOpenChange={(open) => { if (!open) { setHistoryCustomer(null); setHistoryCustomerId(null) } }}
      >
        <DialogContent className="sm:max-w-2xl rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Historial de Órdenes</DialogTitle>
            <DialogDescription>
              {historyCustomer && (
                <>
                  Órdenes de{' '}
                  <span className="font-medium text-foreground">
                    {historyCustomer.name}
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {historyLoading ? (
              <div className="space-y-3 p-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-md" />
                ))}
              </div>
            ) : historyOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Eye className="mb-2 h-14 w-14 text-muted-foreground/30 animate-pulse" />
                <p className="text-muted-foreground/70 text-sm">
                  No hay órdenes registradas
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">N° Orden</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="whitespace-nowrap">Método</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Total</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyOrders.map((order: OrderHistoryEntry) => (
                    <TableRow key={order.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-mono text-xs font-medium whitespace-nowrap">
                        {order.orderNumber}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
                      </TableCell>
                      <TableCell className="text-xs">
                        {paymentMethodLabel(order.paymentMethod)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(order.total, store?.currencyCode)}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(order.createdAt), 'dd MMM yyyy HH:mm', {
                          locale: es,
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
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
        'bg-emerald-500/15 text-emerald-400 dark:bg-emerald-500/15 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/20',
    },
    PENDING: {
      label: 'Pendiente',
      className:
        'bg-amber-500/15 text-amber-400 dark:bg-amber-500/15 dark:text-amber-400 border-amber-500/20 dark:border-amber-500/20',
    },
    CANCELLED: {
      label: 'Cancelada',
      className:
        'bg-red-500/15 text-red-400 dark:bg-red-500/15 dark:text-red-400 border-red-500/20 dark:border-red-500/20',
    },
    CREDIT: {
      label: 'Fiado',
      className:
        'bg-teal-500/15 text-teal-400 dark:bg-teal-500/15 dark:text-teal-400 border-teal-500/20 dark:border-teal-500/20',
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
