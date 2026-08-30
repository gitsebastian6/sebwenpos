'use client'

import { useState } from 'react'
import { useCreateStoreAdmin, useSuperAdminResetPassword, useUpdateStoreSubscription, useCancelStoreSubscriptionAdmin } from '@/hooks/api/use-super-admin'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Store, Building2, Users, Package, ShoppingCart, Crown, Plus,
  CreditCard, User, Lock, Eye, EyeOff, Phone, Mail, MapPin, Hash,
  KeyRound, FileText, Receipt, AlertTriangle, XCircle, CheckCircle2, Upload,
  ShieldCheck, RefreshCw, Ban, PencilLine, FileWarning,
} from 'lucide-react'
import { formatCOP, formatDate, getSubscriptionStatusBadge, BILLING_PERIODS, BILLING_PERIOD_LABELS } from './helpers'
import type { StoreListItem, StoreOwner, PlanData, SubscriptionData } from './types'

// ---- Stores KPI Cards ----
interface StoresKPICardsProps {
  totalStores: number
  totalEmployees: number
  totalProducts: number
  totalOrders: number
}

export function StoresKPICards({ totalStores, totalEmployees, totalProducts, totalOrders }: StoresKPICardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="p-4 border-l-4 border-l-emerald-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-emerald-100 dark:bg-emerald-500/15 rounded-lg flex items-center justify-center">
            <Store className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div><p className="text-2xl font-bold">{totalStores}</p><p className="text-xs text-muted-foreground">Tiendas</p></div>
        </div>
      </Card>
      <Card className="p-4 border-l-4 border-l-blue-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-blue-100 dark:bg-blue-500/15 rounded-lg flex items-center justify-center">
            <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div><p className="text-2xl font-bold">{totalEmployees}</p><p className="text-xs text-muted-foreground">Empleados</p></div>
        </div>
      </Card>
      <Card className="p-4 border-l-4 border-l-amber-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-amber-100 dark:bg-amber-500/15 rounded-lg flex items-center justify-center">
            <Package className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div><p className="text-2xl font-bold">{totalProducts}</p><p className="text-xs text-muted-foreground">Productos</p></div>
        </div>
      </Card>
      <Card className="p-4 border-l-4 border-l-purple-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-purple-100 dark:bg-purple-500/15 rounded-lg flex items-center justify-center">
            <ShoppingCart className="h-5 w-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div><p className="text-2xl font-bold">{totalOrders}</p><p className="text-xs text-muted-foreground">Órdenes</p></div>
        </div>
      </Card>
    </div>
  )
}

// ---- Stores Table ----
interface StoresTableProps {
  stores: StoreListItem[]
  loading: boolean
  plans: PlanData[]
  onViewDetail: (storeId: number) => void
  onResetPassword: (user: StoreOwner) => void
  onDeleteStore: (storeId: number, storeName: string) => void
  onOpenLead?: (leadId: number) => void
}

export function StoresTable({ stores, loading, plans, onViewDetail, onResetPassword, onDeleteStore, onOpenLead }: StoresTableProps) {
  const [planDialogStore, setPlanDialogStore] = useState<StoreListItem | null>(null)
  const [cancelDialogStore, setCancelDialogStore] = useState<StoreListItem | null>(null)
  const reactivateSubscription = useUpdateStoreSubscription()

  return (
    <Card className="rounded-xl border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Tiendas Registradas</CardTitle>
        <CardDescription>Haga clic en &quot;Detalles&quot; para ver toda la información de cada establecimiento</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-12"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : stores.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Store className="h-16 w-16 text-muted-foreground/30 mb-4 animate-pulse" />
            <p className="text-muted-foreground font-medium">No hay tiendas registradas</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Cree la primera tienda para comenzar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">Tienda</TableHead>
                  <TableHead className="min-w-[140px]">Propietario</TableHead>
                  <TableHead className="min-w-[100px]">NIT</TableHead>
                  <TableHead className="min-w-[100px]">Teléfono</TableHead>
                  <TableHead className="text-center min-w-[60px]">Emp.</TableHead>
                  <TableHead className="text-center min-w-[60px]">Prod.</TableHead>
                  <TableHead className="text-center min-w-[60px]">Ord.</TableHead>
                  <TableHead className="text-center min-w-[60px]">Clien.</TableHead>
                  <TableHead className="min-w-[200px]">Plan / Estado</TableHead>
                  <TableHead className="min-w-[90px]">Creada</TableHead>
                  <TableHead className="text-right min-w-[260px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.map((s) => (
                  <TableRow key={s.id} className="group hover:bg-muted/30">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                          <Building2 className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate flex items-center">{s.name}{s.parentStoreId && (<Badge variant="outline" className="text-[10px] ml-1.5 text-violet-500 border-violet-500/30">Sucursal</Badge>)}</p>
                          {s.address && <p className="text-xs text-muted-foreground truncate">{s.address}</p>}
                          {s.leadId && s.leadValidated ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onOpenLead?.(s.leadId!) }}
                              className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline mt-0.5"
                              title="Expediente legal validado — ver en el CRM"
                            >
                              <ShieldCheck className="h-2.5 w-2.5" />CRM validado
                            </button>
                          ) : s.leadId ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); onOpenLead?.(s.leadId!) }}
                              className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 hover:underline mt-0.5"
                              title="Expediente legal (RUT, Cámara, cédula, Resolución DIAN) todavía sin validar — ver en el CRM"
                            >
                              <FileWarning className="h-2.5 w-2.5" />Expediente pendiente
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                              <PencilLine className="h-2.5 w-2.5" />Alta directa
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{s.user.fullName || s.user.cedula}</p>
                        <p className="text-xs text-muted-foreground font-mono">{s.user.cedula}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {s.nit ? <Badge variant="outline" className="text-xs font-mono">{s.nit}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm">{s.phone || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="text-xs">{s._count.employees}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="text-xs">{s._count.products}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="text-xs">{s._count.orders}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="text-xs">{s._count.customers}</Badge>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const sub = (s as StoreListItem & { subscription?: (SubscriptionData & { inheritedFrom?: string }) | null }).subscription
                        if (!sub) return <Badge variant="secondary" className="text-xs opacity-60">Sin plan</Badge>
                        const priceLabel = sub.plan.price === 0
                          ? 'Gratis'
                          : formatCOP(sub.billingPrice || sub.plan.price) + '/mes'
                        const periodLabel = BILLING_PERIOD_LABELS[sub.billingPeriod] ?? sub.billingPeriod
                        const displayDate = sub.status === 'TRIAL' ? sub.trialEndDate : sub.endDate
                        return (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1 flex-wrap">
                              <Badge variant="outline" className="text-xs">
                                <Crown className="h-3 w-3 mr-1 text-amber-500" />
                                {sub.plan.name}
                              </Badge>
                              {sub.inheritedFrom && (
                                <Badge variant="secondary" className="text-[10px] text-violet-600 bg-violet-50 dark:bg-violet-950/40 dark:text-violet-400 gap-0.5">
                                  Heredado
                                </Badge>
                              )}
                            </div>
                            {getSubscriptionStatusBadge(sub.status)}
                            <div className="text-[11px] text-muted-foreground leading-tight">
                              <span className="font-medium text-foreground/70">{priceLabel}</span>
                              <span className="mx-1">·</span>
                              <span>{periodLabel}</span>
                              {displayDate && (
                                <>
                                  <span className="mx-1">·</span>
                                  <span>Vence: {formatDate(displayDate)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(s.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const sub = (s as StoreListItem & { subscription?: (SubscriptionData & { inheritedFrom?: string }) | null }).subscription
                        const canReactivate = !s.parentStoreId && sub && (sub.status === 'EXPIRED' || sub.status === 'CANCELLED')
                        const canCancel = !s.parentStoreId && sub && (sub.status === 'ACTIVE' || sub.status === 'PAST_DUE')
                        return (
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => onViewDetail(s.id)}>
                              <Eye className="h-3.5 w-3.5" /><span className="hidden lg:inline">Detalles</span>
                            </Button>
                            {!s.parentStoreId && sub && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Cambiar plan" aria-label="Cambiar plan" onClick={() => setPlanDialogStore(s)}>
                                <Crown className="h-3.5 w-3.5 text-amber-500" />
                              </Button>
                            )}
                            {canReactivate && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" title="Reactivar suscripción" aria-label="Reactivar suscripción">
                                    <RefreshCw className="h-3.5 w-3.5 text-emerald-500" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-xl backdrop-blur-sm">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>¿Reactivar suscripción de &quot;{s.name}&quot;?</AlertDialogTitle>
                                    <AlertDialogDescription>Se reactivará con el plan {sub!.plan.name} ({sub!.billingPeriod === 'TRIAL' ? '7 días de prueba' : BILLING_PERIOD_LABELS[sub!.billingPeriod] ?? sub!.billingPeriod}), a partir de hoy.</AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] transition-all"
                                      onClick={() => reactivateSubscription.mutate(
                                        { id: s.id, body: { planId: sub!.planId, billingPeriod: sub!.billingPeriod } },
                                        {
                                          onSuccess: () => toast.success(`Suscripción de "${s.name}" reactivada`),
                                          onError: (err) => toast.error(err.message || 'Error al reactivar suscripción'),
                                        },
                                      )}
                                    >
                                      Reactivar
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                            {canCancel && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Cancelar suscripción" aria-label="Cancelar suscripción" onClick={() => setCancelDialogStore(s)}>
                                <Ban className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-8 w-8" title="Resetear contraseña" aria-label="Restablecer contraseña" onClick={() => onResetPassword(s.user)}>
                              <KeyRound className="h-3.5 w-3.5 text-amber-500" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" title="Eliminar tienda" aria-label="Eliminar tienda">
                                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="rounded-xl backdrop-blur-sm">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>¿Eliminar &quot;{s.name}&quot;?</AlertDialogTitle>
                                  <AlertDialogDescription>Esta acción eliminará permanentemente la tienda, todos sus empleados, productos, órdenes, clientes y datos asociados. No se puede deshacer.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.98] transition-all" onClick={() => onDeleteStore(s.id, s.name)}>Eliminar</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )
                      })()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <QuickChangePlanDialog store={planDialogStore} plans={plans} onOpenChange={(open) => { if (!open) setPlanDialogStore(null) }} />
      <CancelSubscriptionDialog store={cancelDialogStore} onOpenChange={(open) => { if (!open) setCancelDialogStore(null) }} />
    </Card>
  )
}

// ---- Quick Change Plan Dialog (row-level action) ----
function QuickChangePlanDialog({ store, plans, onOpenChange }: { store: StoreListItem | null; plans: PlanData[]; onOpenChange: (open: boolean) => void }) {
  const updateSubscription = useUpdateStoreSubscription()
  const currentSub = store ? (store as StoreListItem & { subscription?: SubscriptionData | null }).subscription : null
  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState('MONTHLY')

  // Reset selection whenever a different store is targeted
  const targetStoreId = store?.id ?? null
  const [lastStoreId, setLastStoreId] = useState<number | null>(null)
  if (targetStoreId !== lastStoreId) {
    setLastStoreId(targetStoreId)
    setSelectedPlanId(currentSub?.planId ? String(currentSub.planId) : '')
    setSelectedPeriod(currentSub?.billingPeriod && currentSub.billingPeriod !== 'TRIAL' ? currentSub.billingPeriod : 'MONTHLY')
  }

  function handleConfirm() {
    if (!store || !selectedPlanId) return
    updateSubscription.mutate(
      { id: store.id, body: { planId: parseInt(selectedPlanId, 10), billingPeriod: selectedPeriod } },
      {
        onSuccess: () => { toast.success(`Plan de "${store.name}" actualizado`); onOpenChange(false) },
        onError: (err) => toast.error(err.message || 'Error al cambiar el plan'),
      },
    )
  }

  return (
    <Dialog open={!!store} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Cambiar plan</DialogTitle>
          <DialogDescription>{store && <>Tienda: <strong>{store.name}</strong></>}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Plan</Label>
            <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
              <SelectTrigger><SelectValue placeholder="Seleccione un plan" /></SelectTrigger>
              <SelectContent>
                {plans.filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>{p.name} — {p.price === 0 ? 'Gratis' : `${formatCOP(p.price)}/mes`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(() => {
            const plan = plans.find((p) => p.id.toString() === selectedPlanId)
            if (!plan || plan.price === 0) return null
            return (
              <div className="space-y-2">
                <Label>Período de facturación</Label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BILLING_PERIODS.filter((bp) => bp.value !== 'TRIAL').map((bp) => (
                      <SelectItem key={bp.value} value={bp.value}>{bp.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          })()}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConfirm} disabled={!selectedPlanId || updateSubscription.isPending} className="gap-2 active:scale-[0.98] transition-all">
            {updateSubscription.isPending ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Crown className="h-4 w-4" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- Cancel Subscription Dialog (row-level action) ----
function CancelSubscriptionDialog({ store, onOpenChange }: { store: StoreListItem | null; onOpenChange: (open: boolean) => void }) {
  const cancelSubscription = useCancelStoreSubscriptionAdmin()
  const [reason, setReason] = useState('')

  function handleConfirm() {
    if (!store || reason.trim().length < 5) return
    cancelSubscription.mutate(
      { id: store.id, cancelReason: reason.trim() },
      {
        onSuccess: () => { toast.success(`Suscripción de "${store.name}" cancelada`); setReason(''); onOpenChange(false) },
        onError: (err) => toast.error(err.message || 'Error al cancelar la suscripción'),
      },
    )
  }

  return (
    <Dialog open={!!store} onOpenChange={(open) => { if (!open) setReason(''); onOpenChange(open) }}>
      <DialogContent className="max-w-sm rounded-xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Cancelar suscripción</DialogTitle>
          <DialogDescription>{store && <>Tienda: <strong>{store.name}</strong> — el acceso se mantiene hasta el fin del período ya pagado.</>}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Motivo de la cancelación *</Label>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: cliente solicitó cancelar por WhatsApp, negocio cerró..." rows={3} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Volver</Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={reason.trim().length < 5 || cancelSubscription.isPending}
            className="gap-2 active:scale-[0.98] transition-all"
          >
            {cancelSubscription.isPending ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Ban className="h-4 w-4" />}
            Cancelar suscripción
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- Create Store Dialog ----
interface CreateStoreDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  plans: PlanData[]
  onSuccess: () => void
}

export function CreateStoreDialog({ open, onOpenChange, plans, onSuccess }: CreateStoreDialogProps) {
  const createMutation = useCreateStoreAdmin()
  const [showOwnerPassword, setShowOwnerPassword] = useState(false)
  const [selectedBillingPeriod, setSelectedBillingPeriod] = useState('MONTHLY')
  const [createReceiptFile, setCreateReceiptFile] = useState<File | null>(null)
  const [createReceiptForm, setCreateReceiptForm] = useState({
    amount: '', paymentMethod: 'NEQUI', reference: '', notes: '',
  })
  const [form, setForm] = useState({
    ownerCedula: '', ownerPassword: '', ownerFullName: '',
    ownerEmail: '', ownerPhone: '', storeName: '',
    nit: '', legalName: '', address: '', phone: '',
    selectedPlanId: '',
  })

  function updateForm(field: string, value: string) { setForm((p) => ({ ...p, [field]: value })) }

  async function buildReceiptPayload() {
    const reader = new FileReader()
    const base64Promise = new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1]
        if (base64) resolve(base64)
        else reject(new Error('No se pudo leer el archivo'))
      }
      reader.onerror = () => reject(new Error('Error leyendo archivo'))
      reader.readAsDataURL(createReceiptFile)
    })
    const fileData = await base64Promise
    return {
      fileData,
      fileName: createReceiptFile.name,
      fileSize: createReceiptFile.size,
      fileType: createReceiptFile.type || 'application/octet-stream',
      amount: parseInt(createReceiptForm.amount),
      paymentMethod: createReceiptForm.paymentMethod,
      reference: createReceiptForm.reference || undefined,
      notes: createReceiptForm.notes || undefined,
    }
  }

  async function handleCreateStore() {
    if (!form.ownerCedula || !form.ownerPassword || !form.ownerFullName || !form.storeName) {
      toast.error('Complete los campos obligatorios (*)')
      return
    }
    const selectedPlan = plans.find(p => p.id.toString() === form.selectedPlanId)
    const isPaidPlan = selectedPlan && selectedPlan.price > 0
    if (isPaidPlan && !createReceiptFile) {
      toast.error('Debe adjuntar el comprobante de pago para planes de pago')
      return
    }
    try {
      const data = await createMutation.mutateAsync({
        ...form,
        planId: form.selectedPlanId ? parseInt(form.selectedPlanId) : undefined,
        billingPeriod: isPaidPlan ? selectedBillingPeriod : undefined,
        receipt: isPaidPlan && createReceiptFile ? await buildReceiptPayload() : undefined,
      })
      toast.success((data as any)?.message || 'Tienda creada exitosamente')
      setForm({ ownerCedula: '', ownerPassword: '', ownerFullName: '', ownerEmail: '', ownerPhone: '', storeName: '', nit: '', legalName: '', address: '', phone: '', selectedPlanId: '' })
      setSelectedBillingPeriod('MONTHLY')
      setCreateReceiptFile(null)
      setCreateReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' })
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) { setForm({ ownerCedula: '', ownerPassword: '', ownerFullName: '', ownerEmail: '', ownerPhone: '', storeName: '', nit: '', legalName: '', address: '', phone: '', selectedPlanId: '' }); setSelectedBillingPeriod('MONTHLY'); setCreateReceiptFile(null); setCreateReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' }) } onOpenChange(open) }}>
      <DialogContent mobileFullscreen className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Crear Nueva Tienda</DialogTitle>
          <DialogDescription>Complete los datos del propietario y de la tienda. Se crearán automáticamente categorías, IVA y roles.</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2"><User className="h-4 w-4 text-primary" /><h3 className="font-semibold text-sm">Datos del Propietario</h3></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="oc">Cédula *</Label>
                <div className="relative"><CreditCard className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="oc" placeholder="1098765432" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={form.ownerCedula} onChange={(e) => updateForm('ownerCedula', e.target.value)} /></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="op">Contraseña *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="op" type={showOwnerPassword ? 'text' : 'password'} placeholder="Mínimo 6 caracteres" className="pl-10 pr-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={form.ownerPassword} onChange={(e) => updateForm('ownerPassword', e.target.value)} />
                  <button type="button" onClick={() => setShowOwnerPassword(!showOwnerPassword)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground" aria-label="Mostrar u ocultar contraseña">{showOwnerPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="on">Nombre Completo *</Label>
                <Input id="on" className="focus-visible:ring-primary/20 focus-visible:border-primary/40" placeholder="Juan Pérez" value={form.ownerFullName} onChange={(e) => updateForm('ownerFullName', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oe">Email</Label>
                <div className="relative"><Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="oe" type="email" placeholder="correo@ejemplo.com" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={form.ownerEmail} onChange={(e) => updateForm('ownerEmail', e.target.value)} /></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="oph">Teléfono</Label>
                <div className="relative"><Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="oph" placeholder="3001234567" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={form.ownerPhone} onChange={(e) => updateForm('ownerPhone', e.target.value)} /></div>
              </div>
            </div>
          </div>
          <Separator />
          <div className="space-y-4">
            <div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /><h3 className="font-semibold text-sm">Datos de la Tienda</h3></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="sn">Nombre de la Tienda *</Label>
                <div className="relative"><Store className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="sn" placeholder="Mi Negocio" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={form.storeName} onChange={(e) => updateForm('storeName', e.target.value)} /></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sl">Razón Social</Label>
                <Input id="sl" className="focus-visible:ring-primary/20 focus-visible:border-primary/40" placeholder="Mi Negocio S.A.S" value={form.legalName} onChange={(e) => updateForm('legalName', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="snit">NIT</Label>
                <div className="relative"><Hash className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="snit" placeholder="901234567-8" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={form.nit} onChange={(e) => updateForm('nit', e.target.value)} /></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stp">Teléfono Tienda</Label>
                <div className="relative"><Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="stp" placeholder="6011234567" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={form.phone} onChange={(e) => updateForm('phone', e.target.value)} /></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sa">Dirección</Label>
                <div className="relative"><MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input id="sa" placeholder="Calle 10 #5-30" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={form.address} onChange={(e) => updateForm('address', e.target.value)} /></div>
              </div>
            </div>
          </div>
          <Separator />
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-500" />
              <h3 className="font-semibold text-sm">Plan de Suscripción</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {plans.filter(p => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map((plan) => {
                const isSelected = form.selectedPlanId === plan.id.toString()
                return (
                  <div
                    key={plan.id}
                    onClick={() => {
                      updateForm('selectedPlanId', plan.id.toString())
                      setSelectedBillingPeriod(plan.price === 0 ? 'TRIAL' : 'MONTHLY')
                      if (plan.price === 0) {
                        setCreateReceiptFile(null)
                        setCreateReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' })
                      }
                    }}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-md ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-md'
                        : 'border-border hover:border-primary/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm">{plan.name}</span>
                      {isSelected && <CheckCircle2 className="h-5 w-5 text-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {plan.price === 0 ? 'Gratis' : formatCOP(plan.price) + '/mes'}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Object.entries(plan.features).slice(0, 3).map(([key, val]) => (
                        <Badge key={key} variant={val === true ? 'default' : 'outline'} className="text-[9px]">
                          {key}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            {form.selectedPlanId && (() => {
              const selectedPlan = plans.find(p => p.id.toString() === form.selectedPlanId)
              if (!selectedPlan || selectedPlan.price === 0) return null
              return (
                <div className="space-y-2">
                  <Label className="text-sm">Período de facturación</Label>
                  <Select value={selectedBillingPeriod} onValueChange={setSelectedBillingPeriod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BILLING_PERIODS.filter(bp => bp.value !== 'TRIAL').map((bp) => {
                        const price = Math.round(selectedPlan.price * bp.months * (1 - bp.discount / 100))
                        return (
                          <SelectItem key={bp.value} value={bp.value}>
                            {bp.label} — {formatCOP(price)} {bp.discount > 0 ? `(ahorras ${bp.discount}%)` : ''}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )
            })()}
          </div>
          {form.selectedPlanId && (() => { const plan = plans.find(p => p.id.toString() === form.selectedPlanId); return plan && plan.price > 0 })() && (
          <>
          <Separator />
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Comprobante de Pago (Requerido)</h3>
            </div>
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Debe adjuntar el comprobante del pago para activar el plan seleccionado
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2 sm:col-span-2">
                <Label>Archivo del comprobante</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-3 text-center hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => document.getElementById('create-receipt-file')?.click()}
                >
                  {createReceiptFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium truncate">{createReceiptFile.name}</span>
                      <span className="text-xs text-muted-foreground">({(createReceiptFile.size / 1024).toFixed(0)}KB)</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setCreateReceiptFile(null) }}
                        className="ml-2 text-muted-foreground hover:text-destructive"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground"><Upload className="h-5 w-5 text-muted-foreground/50 mx-auto mb-1" />Haz clic para seleccionar archivo</p>
                  )}
                  <input
                    id="create-receipt-file"
                    type="file"
                    className="hidden"
                    accept="image/png,image/jpeg,image/webp,image/heic,.pdf"
                    onChange={(e) => { if (e.target.files?.[0]) setCreateReceiptFile(e.target.files[0]) }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Monto (COP)</Label>
                <Input type="number" placeholder="50000" value={createReceiptForm.amount}
                  onChange={(e) => setCreateReceiptForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Método de pago</Label>
                <Select value={createReceiptForm.paymentMethod} onValueChange={(v) => setCreateReceiptForm(f => ({ ...f, paymentMethod: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NEQUI">Nequi</SelectItem>
                    <SelectItem value="DAVIPLATA">Davivienda (Daviplata)</SelectItem>
                    <SelectItem value="BANCOLOMBIA">Bancolombia</SelectItem>
                    <SelectItem value="BANCARY">Bancario (Consignación)</SelectItem>
                    <SelectItem value="EFFECTIVE">Efectivo</SelectItem>
                    <SelectItem value="OTHER">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Referencia / Transacción</Label>
                <Input placeholder="Ej: 000123456789" value={createReceiptForm.reference}
                  onChange={(e) => setCreateReceiptForm(f => ({ ...f, reference: e.target.value }))} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Notas</Label>
                <Textarea placeholder="Observaciones..." rows={2} value={createReceiptForm.notes}
                  onChange={(e) => setCreateReceiptForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
          </div>
          </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); setForm({ ownerCedula: '', ownerPassword: '', ownerFullName: '', ownerEmail: '', ownerPhone: '', storeName: '', nit: '', legalName: '', address: '', phone: '', selectedPlanId: '' }); setSelectedBillingPeriod('MONTHLY'); setCreateReceiptFile(null); setCreateReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' }) }}>Cancelar</Button>
          <Button onClick={handleCreateStore} disabled={createMutation.isPending} className="gap-2 active:scale-[0.98] transition-all">
            {createMutation.isPending ? (<><div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Creando...</>) : (<><Plus className="h-4 w-4" />Crear Tienda</>)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- Reset Password Dialog ----
interface ResetPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedUser: StoreOwner | null
  onSuccess: () => void
}

export function ResetPasswordDialog({ open, onOpenChange, selectedUser, onSuccess }: ResetPasswordDialogProps) {
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const resetMutation = useSuperAdminResetPassword()

  async function handleResetPassword() {
    if (!selectedUser || !newPassword || newPassword.length < 6) { toast.error('Contraseña mín. 6 caracteres'); return }
    try {
      const data = await resetMutation.mutateAsync({ userId: selectedUser.id, newPassword })
      toast.success((data as any)?.message || 'Contraseña actualizada')
      setNewPassword('')
      onSuccess()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión')
    }
  }

  // Reset password when dialog opens
  const handleOpenChange = (val: boolean) => {
    if (val) setNewPassword('')
    onOpenChange(val)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm rounded-xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Resetear Contraseña</DialogTitle>
          <DialogDescription>
            {selectedUser && <>Usuario: <strong>{selectedUser.fullName || selectedUser.cedula}</strong> ({selectedUser.cedula})</>}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Nueva Contraseña</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input type={showNewPassword ? 'text' : 'password'} placeholder="Mínimo 6 caracteres" className="pl-10 pr-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground" aria-label="Mostrar u ocultar contraseña">{showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleResetPassword} disabled={!newPassword || newPassword.length < 6 || resetMutation.isPending} className="gap-2 active:scale-[0.98] transition-all"><KeyRound className="h-4 w-4" />Actualizar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
