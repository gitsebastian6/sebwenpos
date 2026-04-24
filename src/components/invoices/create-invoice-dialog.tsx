'use client'

import { useState, useMemo } from 'react'
import { useInvoices, useCreateInvoice } from '@/hooks/api/use-invoices'
import { useOrders } from '@/hooks/api/use-orders'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NITInput } from '@/components/ui/nit-input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { Skeleton } from '@/components/ui/skeleton'
import { DIAN_CONSUMIDOR_FINAL_NIT } from '@/lib/constants'
import {
  Search,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Info,
  Loader2,
  Plus,
  Receipt,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { formatCOP } from '@/lib/format'
import type { InvoiceSummary, OrderForInvoice } from './invoices-types'

interface CreateInvoiceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeId: number
}

export function CreateInvoiceDialog({ open, onOpenChange, storeId }: CreateInvoiceDialogProps) {
  // ── Internal state ──
  const [createStep, setCreateStep] = useState<1 | 2>(1)
  const [ordersSearch, setOrdersSearch] = useState('')
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<OrderForInvoice | null>(null)
  const [formNit, setFormNit] = useState(DIAN_CONSUMIDOR_FINAL_NIT)
  const [formName, setFormName] = useState('Consumidor Final')
  const [formAddress, setFormAddress] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formContingencyType, setFormContingencyType] = useState('01')
  const [isConsumidorFinal, setIsConsumidorFinal] = useState(true)

  // ── Query hooks ──
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  }, [])

  const ordersQuery = useOrders(storeId, {
    status: 'COMPLETED',
    from: thirtyDaysAgo,
  })

  const allInvoicesQuery = useInvoices(storeId, {})
  const createInvoiceMutation = useCreateInvoice()

  // ── Derived data ──
  const availableOrders = useMemo<OrderForInvoice[]>(() => {
    if (!ordersQuery.data) return []
    const orders: OrderForInvoice[] = Array.isArray(ordersQuery.data) ? ordersQuery.data : (ordersQuery.data.data || [])
    const allInv = allInvoicesQuery.data
    if (allInv) {
      const existingInvoices: InvoiceSummary[] = Array.isArray(allInv) ? allInv : (allInv.data || [])
      const invoicedOrderIds = new Set(existingInvoices.map(inv => inv.orderNumber).filter(Boolean))
      return orders.filter(o => !invoicedOrderIds.has(o.orderNumber))
    }
    return orders
  }, [ordersQuery.data, allInvoicesQuery.data])

  const ordersLoading = ordersQuery.isPending || allInvoicesQuery.isPending

  const filteredOrders = useMemo(() => {
    if (!ordersSearch.trim()) return availableOrders
    const q = ordersSearch.toLowerCase()
    return availableOrders.filter(
      o => o.orderNumber.toLowerCase().includes(q) || (o.customerName || '').toLowerCase().includes(q)
    )
  }, [availableOrders, ordersSearch])

  // ── Handlers ──
  function resetState() {
    setCreateStep(1)
    setSelectedOrderId(null)
    setSelectedOrder(null)
    setOrdersSearch('')
    setFormNit(DIAN_CONSUMIDOR_FINAL_NIT)
    setFormName('Consumidor Final')
    setFormAddress('')
    setFormEmail('')
    setFormNotes('')
    setFormContingencyType('01')
    setIsConsumidorFinal(true)
  }

  function handleOpenChange(open: boolean) {
    if (!open) resetState()
    onOpenChange(open)
  }

  function selectOrder(order: OrderForInvoice) {
    setSelectedOrderId(order.id)
    setSelectedOrder(order)
    setFormName(order.customerName || 'Consumidor Final')
    setCreateStep(2)
  }

  async function handleCreateInvoice() {
    if (!selectedOrderId) return
    try {
      const data = await createInvoiceMutation.mutateAsync({
        body: {
          orderId: selectedOrderId,
          customerNit: formNit,
          customerName: formName,
          customerAddress: formAddress || undefined,
          customerEmail: formEmail || undefined,
          notes: formNotes || undefined,
          testMode: true,
          invoiceType: formContingencyType,
        },
      })
      toast.success(`Factura ${data.invoiceNumber} creada exitosamente`)
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al crear factura')
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Crear Factura Electrónica
          </DialogTitle>
          <DialogDescription>
            {createStep === 1
              ? 'Paso 1: Selecciona la orden de venta para facturar'
              : 'Paso 2: Completa la información del cliente'}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-4">
          <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold ${
            createStep >= 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}>1</div>
          <div className={`h-0.5 flex-1 ${createStep >= 2 ? 'bg-primary' : 'bg-muted'}`} />
          <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold ${
            createStep >= 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}>2</div>
        </div>

        {createStep === 1 ? (
          /* ── Step 1: Select order ── */
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por número de orden o cliente..."
                className="pl-9"
                value={ordersSearch}
                onChange={(e) => setOrdersSearch(e.target.value)}
              />
            </div>
            {ordersLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-sm text-muted-foreground">No hay órdenes completadas disponibles para facturar.</p>
                <p className="text-xs text-muted-foreground mt-1">Solo se muestran órdenes de los últimos 30 días sin factura asociada.</p>
              </div>
            ) : (
              <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
                {filteredOrders.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => selectOrder(order)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                      <Receipt className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{order.orderNumber}</p>
                      <p className="text-xs text-muted-foreground truncate">{order.customerName || 'Sin cliente'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">{formatCOP(order.total)}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(order.createdAt), 'dd MMM', { locale: es })}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ── Step 2: Customer info ── */
          <div className="space-y-4">
            {/* Selected order info */}
            {selectedOrder && (
              <div className="rounded-lg bg-muted/50 p-3 flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{selectedOrder.orderNumber}</p>
                  <p className="text-xs text-muted-foreground">{selectedOrder.customerName || 'Consumidor Final'} · {formatCOP(selectedOrder.total)}</p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCreateStep(1)}>
                  Cambiar
                </Button>
              </div>
            )}

            {/* DIAN Abecé info */}
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 space-y-1">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="text-xs text-amber-800 dark:text-amber-200">
                  <p className="font-medium">Resolución 000165/2023 — Artículo 11</p>
                  <p className="text-muted-foreground mt-0.5">Solo se requiere Nombre, NIT y correo electrónico.</p>
                </div>
              </div>
            </div>

            {/* Consumidor Final toggle */}
            <Button
              type="button"
              variant={isConsumidorFinal ? 'default' : 'outline'}
              size="sm"
              className={`w-full gap-2 ${isConsumidorFinal ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
              onClick={() => {
                if (isConsumidorFinal) {
                  setIsConsumidorFinal(false)
                  setFormNit('')
                  setFormName('')
                } else {
                  setIsConsumidorFinal(true)
                  setFormNit(DIAN_CONSUMIDOR_FINAL_NIT)
                  setFormName('Consumidor Final')
                }
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              {isConsumidorFinal ? 'Consumidor Final activado' : 'Marcar como Consumidor Final'}
            </Button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="inv-nit" className="text-xs font-medium">NIT *</Label>
                <NITInput
                  id="inv-nit"
                  value={formNit}
                  onChange={(val) => { setFormNit(val); if (val !== DIAN_CONSUMIDOR_FINAL_NIT) setIsConsumidorFinal(false) }}
                  placeholder={DIAN_CONSUMIDOR_FINAL_NIT}
                  disabled={isConsumidorFinal}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-name" className="text-xs font-medium">Nombre / Razón Social *</Label>
                <Input
                  id="inv-name"
                  value={formName}
                  onChange={(e) => { setFormName(e.target.value); if (e.target.value !== 'Consumidor Final') setIsConsumidorFinal(false) }}
                  placeholder="Consumidor Final"
                  disabled={isConsumidorFinal}
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="inv-email" className="text-xs font-medium">Email</Label>
                <Input id="inv-email" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="cliente@email.com" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="inv-address" className="text-xs font-medium flex items-center gap-1.5">
                  Dirección
                  <span className="text-[10px] text-muted-foreground font-normal">Solo requerido si la entrega es fuera de la sede del negocio</span>
                </Label>
                <Input id="inv-address" value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="Dirección del cliente (opcional)" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-contingency" className="text-xs font-medium">Tipo de Factura</Label>
                <Select value={formContingencyType} onValueChange={setFormContingencyType}>
                  <SelectTrigger id="inv-contingency" className="w-full focus-visible:ring-primary/20 focus-visible:border-primary/40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="01">01 — Normal</SelectItem>
                    <SelectItem value="03">03 — Contingencia Facturador</SelectItem>
                    <SelectItem value="04">04 — Contingencia DIAN Offline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="inv-notes" className="text-xs font-medium">Notas (opcional)</Label>
                <Textarea id="inv-notes" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Observaciones adicionales..." rows={2} className="text-xs" />
              </div>
            </div>
            {formContingencyType === '03' && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-red-800 dark:text-red-200">
                    <p className="font-medium">Contingencia Tipo 03</p>
                    <p className="text-muted-foreground mt-0.5">Falla tecnológica del facturador. Debe tener factura pre-autorizada en papel y transmitir dentro de las 48 horas.</p>
                  </div>
                </div>
              </div>
            )}
            {formContingencyType === '04' && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                  <div className="text-xs text-red-800 dark:text-red-200">
                    <p className="font-medium">Contingencia Tipo 04</p>
                    <p className="text-muted-foreground mt-0.5">Sistema DIAN fuera de línea. Emitir sin validación previa, reintentar cada 30 min, máximo 48h para transmitir.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => { if (createStep === 1) { onOpenChange(false) } else { setCreateStep(1) } }}>
            {createStep === 1 ? 'Cancelar' : 'Atrás'}
          </Button>
          {createStep === 2 && (
            <Button onClick={handleCreateInvoice} disabled={createInvoiceMutation.isPending || !formNit.trim() || !formName.trim()}>
              {createInvoiceMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creando...</> : <><Plus className="h-4 w-4 mr-2" />Crear Factura</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
