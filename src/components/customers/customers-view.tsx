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
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// ── Types ──────────────────────────────────────────────────────────────────

interface Customer {
  id: number
  name: string
  phone: string | null
  email: string | null
  totalDebt: number
  createdAt: string
  _count?: { orders: number }
}

// ── Component ──────────────────────────────────────────────────────────────

export function CustomersView() {
  const { store } = useAuthStore()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null)
  const [historyOrders, setHistoryOrders] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')

  const fetchCustomers = useCallback(async () => {
    if (!store?.id) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ storeId: store.id.toString() })
      if (search.trim()) params.set('q', search.trim())
      const res = await fetch(`/api/customers?${params}`)
      if (!res.ok) throw new Error('Error al cargar clientes')
      const data = await res.json()
      setCustomers(data)
    } catch {
      toast.error('Error al cargar clientes')
    } finally {
      setLoading(false)
    }
  }, [store?.id, search])

  useEffect(() => {
    const timer = setTimeout(() => fetchCustomers(), 300)
    return () => clearTimeout(timer)
  }, [fetchCustomers])

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
        // Update
        delete body.storeId
        const res = await fetch(`/api/customers/${editingCustomer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error('Error al actualizar')
        toast.success('Cliente actualizado')
      } else {
        // Create
        const res = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error('Error al crear')
        toast.success('Cliente creado')
      }
      setDialogOpen(false)
      fetchCustomers()
    } catch {
      toast.error(editingCustomer ? 'Error al actualizar cliente' : 'Error al crear cliente')
    } finally {
      setSubmitting(false)
    }
  }

  async function viewOrderHistory(customer: Customer) {
    if (!store?.id) {
      toast.error('Tienda no disponible')
      return
    }
    setHistoryCustomer(customer)
    setHistoryOrders([])
    setHistoryLoading(true)
    try {
      const params = new URLSearchParams({
        storeId: store.id.toString(),
        customerId: customer.id.toString(),
      })
      const res = await fetch(`/api/orders?${params}`)
      if (!res.ok) throw new Error('Error')
      const data = await res.json()
      setHistoryOrders(data)
    } catch {
      toast.error('Error al cargar historial')
    } finally {
      setHistoryLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Header + Search ─────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
        <Button onClick={openCreateDialog} size="sm">
          <Plus className="h-4 w-4" />
          Nuevo Cliente
        </Button>
      </div>

      {/* ── Search Bar ──────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o teléfono..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Table ───────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Users className="mb-3 h-12 w-12 text-muted-foreground/40" />
              <p className="text-muted-foreground font-medium">No se encontraron clientes</p>
              <p className="text-sm text-muted-foreground/70">
                {search ? 'Intenta con otra búsqueda' : 'Crea tu primer cliente'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="hidden md:table-cell">Teléfono</TableHead>
                    <TableHead className="hidden lg:table-cell">Email</TableHead>
                    <TableHead className="text-right">Deuda Total</TableHead>
                    <TableHead className="hidden sm:table-cell">Registro</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{customer.name}</span>
                          {/* Mobile: show phone inline */}
                          {customer.phone && (
                            <span className="md:hidden text-xs text-muted-foreground">
                              {customer.phone}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {customer.phone ? (
                          <span className="inline-flex items-center gap-1 text-sm">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            {customer.phone}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {customer.email ? (
                          <span className="inline-flex items-center gap-1 text-sm">
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                            {customer.email}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
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
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {format(new Date(customer.createdAt), 'dd MMM yyyy', { locale: es })}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Ver historial"
                            onClick={() => viewOrderHistory(customer)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Editar"
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
        <DialogContent className="sm:max-w-md">
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

      {/* ── Order History Dialog ────────────────────────────────── */}
      <Dialog
        open={!!historyCustomer}
        onOpenChange={(open) => !open && setHistoryCustomer(null)}
      >
        <DialogContent className="sm:max-w-2xl">
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
                <Eye className="mb-2 h-10 w-10 text-muted-foreground/40" />
                <p className="text-muted-foreground text-sm">
                  No hay órdenes registradas
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Orden</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="hidden sm:table-cell">Método</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="hidden sm:table-cell text-right">Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyOrders.map((order: any) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-sm font-medium">
                        {order.orderNumber}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm">
                        {paymentMethodLabel(order.paymentMethod)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(order.total, store?.currencyCode)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-right text-sm text-muted-foreground">
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
