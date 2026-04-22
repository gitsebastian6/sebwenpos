'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import {
  Building2, Store, Users, Package, ShoppingCart, ClipboardList, CreditCard, User,
  Lock, Eye, EyeOff, Phone, Mail, MapPin, Hash, Crown, FileText, Receipt,
  Zap, Truck, AlertCircle, Shield, KeyRound, Pencil, Trash2, Plus,
  ArrowRight, Upload, CheckCircle2, XCircle, Download, Clock, Filter,
  TrendingUp, TrendingDown, DollarSign, Settings, Link2,
  Eye as EyeIcon, FileCheck2, Banknote, Wallet, CircleDollarSign,
  BadgeCheck, AlertTriangle, CalendarDays,
} from 'lucide-react'
import { formatCOP, formatDateTime, formatDate, getSubscriptionStatusBadge, UsageBar, BILLING_PERIODS } from './helpers'
import type { StoreDetail, PlanData, StoreOwner, PaymentReceiptData } from './types'

interface StoreDetailViewProps {
  store: StoreDetail
  plans: PlanData[]
  onBack: () => void
  onResetPassword: (user: StoreOwner) => void
  onRefresh: (storeId: number) => void
}

export function StoreDetailView({ store: detail, plans, onBack, onResetPassword, onRefresh }: StoreDetailViewProps) {
  const { store, stats, employees, roles, taxRates, categories, products, customers, orders, services, providers, expenses, subscription, dianInfo, invoiceStats } = detail
  const profit = stats.totalSales - stats.totalExpenses
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showResetProductsDialog, setShowResetProductsDialog] = useState(false)
  const [resettingProducts, setResettingProducts] = useState(false)
  const [showChangePlanDialog, setShowChangePlanDialog] = useState(false)
  const [changingPlan, setChangingPlan] = useState(false)
  const [selectedPlanId, setSelectedPlanId] = useState<string>(subscription?.planId?.toString() || '')
  const [selectedPeriod, setSelectedPeriod] = useState<string>('MONTHLY')
  const [editForm, setEditForm] = useState({
    name: store.name || '',
    legalName: store.legalName || '',
    nit: store.nit || '',
    address: store.address || '',
    phone: store.phone || '',
    ownerFullName: store.user.fullName || '',
    ownerEmail: store.user.email || '',
    ownerPhone: store.user.phone || '',
  })

  // Edit dialog receipt state
  const [editReceiptFile, setEditReceiptFile] = useState<File | null>(null)
  const [editReceiptForm, setEditReceiptForm] = useState({
    amount: '', paymentMethod: 'NEQUI', reference: '', notes: '',
  })
  const [uploadingReceipt, setUploadingReceipt] = useState(false)

  // Payment receipts state
  const [receipts, setReceipts] = useState<PaymentReceiptData[]>([])
  const [receiptsLoading, setReceiptsLoading] = useState(false)
  const [previewReceipt, setPreviewReceipt] = useState<PaymentReceiptData | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [reviewing, setReviewing] = useState(false)

  // Upload receipt state (super admin)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedFilePreview, setSelectedFilePreview] = useState<string | null>(null)
  const [uploadForm, setUploadForm] = useState({
    amount: '',
    paymentMethod: 'NEQUI',
    reference: '',
    notes: '',
    autoApprove: true,
  })
  // Receipt preview dialog
  const [showReceiptPreviewDialog, setShowReceiptPreviewDialog] = useState(false)
  const [receiptPreviewData, setReceiptPreviewData] = useState<PaymentReceiptData | null>(null)
  const [receiptPreviewImage, setReceiptPreviewImage] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  // Receipt filter
  const [receiptFilter, setReceiptFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL')

  // Branches (sucursales) state
  const [branches, setBranches] = useState<Array<{
    id: number; name: string; legalName: string | null; nit: string | null;
    address: string | null; phone: string | null; createdAt: string;
    user: { cedula: string; fullName: string | null };
    _count: { employees: number; products: number; orders: number };
  }>>([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [showBranchDialog, setShowBranchDialog] = useState(false)
  const [branchCreating, setBranchCreating] = useState(false)
  const [parentSubInfo, setParentSubInfo] = useState<{ planName: string | null; status: string | null; maxStores: number; multiStoreEnabled: boolean } | null>(null)
  const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '', legalName: '', nit: '' })

  const loadReceipts = useCallback(async () => {
    try {
      setReceiptsLoading(true)
      const res = await fetch('/api/super-admin/payment-receipts')
      if (!res.ok) { return }
      const data = await res.json()
      setReceipts((data || []).filter((r: PaymentReceiptData) => r.storeId === store.id))
    } catch { /* non-critical */ }
    finally { setReceiptsLoading(false) }
  }, [store.id])

  useEffect(() => { loadReceipts() }, [loadReceipts])

  const loadBranches = useCallback(async () => {
    setBranchesLoading(true)
    try {
      const res = await fetch(`/api/super-admin/stores/${store.id}/branches`)
      if (res.ok) {
        const data = await res.json()
        setBranches(Array.isArray(data.branches) ? data.branches : [])
      setParentSubInfo(data.parentSubscription || null)
      }
    } catch { /* non-critical */ }
    finally { setBranchesLoading(false) }
  }, [store.id])

  useEffect(() => { loadBranches() }, [loadBranches])

  async function handleCreateBranch() {
    if (!branchForm.name || branchForm.name.length < 2) { toast.error('Nombre de sucursal obligatorio (mín. 2 caracteres)'); return }
    setBranchCreating(true)
    try {
      const res = await fetch(`/api/super-admin/stores/${store.id}/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(branchForm),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.code === 'MULTI_STORE_REQUIRED') {
          toast.error('Plan requerido: Empresarial', { description: data.error, duration: 6000 })
        } else if (data.code === 'MAX_STORES_REACHED') {
          toast.error('Límite alcanzado', { description: data.error, duration: 6000 })
        } else {
          toast.error(data.error || 'Error al crear sucursal')
        }
        return
      }
      toast.success(data.message || `Sucursal "${branchForm.name}" creada exitosamente`)
      setBranchForm({ name: '', address: '', phone: '', legalName: '', nit: '' })
      setShowBranchDialog(false)
      loadBranches()
      onRefresh(store.id)
    } catch { toast.error('Error de conexión') }
    finally { setBranchCreating(false) }
  }

  async function handleReviewReceipt(receiptId: number, action: 'APPROVE' | 'REJECT') {
    setReviewing(true)
    try {
      const res = await fetch(`/api/super-admin/payment-receipts/${receiptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reviewNotes }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al procesar comprobante'); return }
      toast.success(data.message)
      setPreviewReceipt(null)
      setReviewNotes('')
      loadReceipts()
      onRefresh(store.id)
    } catch { toast.error('Error de conexión') }
    finally { setReviewing(false) }
  }

  async function handleDeleteReceipt(receiptId: number) {
    try {
      const res = await fetch(`/api/super-admin/payment-receipts/${receiptId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al eliminar'); return }
      toast.success(data.message)
      loadReceipts()
    } catch { toast.error('Error de conexión') }
  }

  async function handleUploadReceipt() {
    if (!selectedFile || !uploadForm.amount || !store.id) {
      toast.error('Selecciona un archivo e indica el monto del pago')
      return
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      toast.error('El archivo excede 5MB. Selecciona uno más pequeño.')
      return
    }
    setUploading(true)
    try {
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string
          const base64 = result.split(',')[1]
          if (base64) resolve(base64)
          else reject(new Error('No se pudo leer el archivo'))
        }
        reader.onerror = () => reject(new Error('Error leyendo archivo'))
        reader.readAsDataURL(selectedFile)
      })

      const fileData = await base64Promise

      const res = await fetch('/api/super-admin/payment-receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: store.id,
          amount: parseInt(uploadForm.amount),
          paymentMethod: uploadForm.paymentMethod,
          reference: uploadForm.reference || undefined,
          notes: uploadForm.notes || undefined,
          fileData,
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          fileType: selectedFile.type || 'application/octet-stream',
          autoApprove: uploadForm.autoApprove,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Error al registrar comprobante')
        return
      }
      toast.success(data.message)
      setShowUploadDialog(false)
      setSelectedFile(null)
      setSelectedFilePreview(null)
      setUploadForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '', autoApprove: true })
      loadReceipts()
      onRefresh(store.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión al registrar')
    }
    finally { setUploading(false) }
  }

  async function handleViewReceipt(receipt: PaymentReceiptData) {
    setLoadingPreview(true)
    setShowReceiptPreviewDialog(true)
    setReceiptPreviewData(receipt)
    setReceiptPreviewImage(null)
    try {
      const res = await fetch(`/api/super-admin/payment-receipts/${receipt.id}`)
      const data = await res.json()
      if (res.ok && data.fileData) {
        const mime = data.fileType || 'application/octet-stream'
        if (mime.startsWith('image/')) {
          setReceiptPreviewImage(`data:${mime};base64,${data.fileData}`)
        } else {
          setReceiptPreviewImage(null)
        }
      }
    } catch { /* preview unavailable */ }
    finally { setLoadingPreview(false) }
  }

  function handleDownloadReceipt(receipt: PaymentReceiptData) {
    const download = async () => {
      try {
        const res = await fetch(`/api/super-admin/payment-receipts/${receipt.id}`)
        const data = await res.json()
        if (res.ok && data.fileData) {
          const mime = data.fileType || 'application/octet-stream'
          const href = `data:${mime};base64,${data.fileData}`
          const a = document.createElement('a')
          a.href = href
          a.download = data.fileName || 'comprobante'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          toast.success('Descarga iniciada')
        } else {
          toast.error('No se pudo obtener el archivo')
        }
      } catch { toast.error('Error al descargar comprobante') }
    }
    download()
  }

  // Subscription helpers
  const selectedPlan = plans.find(p => p.id.toString() === selectedPlanId)
  const selectedBillingPeriod = BILLING_PERIODS.find(bp => bp.value === selectedPeriod) || BILLING_PERIODS[0]
  const calculatedPrice = selectedPlan
    ? Math.round(selectedPlan.price * selectedBillingPeriod.months * (1 - selectedBillingPeriod.discount / 100))
    : 0

  const daysRemaining = subscription?.endDate
    ? (() => {
        const now = new Date()
        const end = new Date(subscription.endDate)
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate())
        return Math.ceil((endDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      })()
    : null

  function openEdit() {
    setEditForm({
      name: store.name || '',
      legalName: store.legalName || '',
      nit: store.nit || '',
      address: store.address || '',
      phone: store.phone || '',
      ownerFullName: store.user.fullName || '',
      ownerEmail: store.user.email || '',
      ownerPhone: store.user.phone || '',
    })
    setEditReceiptFile(null)
    setEditReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' })
    setShowEditDialog(true)
  }

  function openUploadDialog() {
    setSelectedFile(null)
    setSelectedFilePreview(null)
    setUploadForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '', autoApprove: true })
    setShowUploadDialog(true)
  }

  function openChangePlan() {
    const initialPlanId = subscription?.planId?.toString() || (plans.find(p => p.isActive)?.id?.toString() || '')
    const initialPlan = plans.find(p => p.id.toString() === initialPlanId)
    setSelectedPlanId(initialPlanId)
    if (initialPlan?.price === 0) {
      setSelectedPeriod('TRIAL')
    } else {
      setSelectedPeriod(subscription?.billingPeriod || 'MONTHLY')
    }
    setShowChangePlanDialog(true)
  }

  function updateEdit(field: string, value: string) { setEditForm((p) => ({ ...p, [field]: value })) }

  async function handleSave() {
    if (!editForm.name || editForm.name.length < 2) { toast.error('Nombre de tienda es obligatorio (mín. 2 caracteres)'); return }
    if (!editForm.ownerFullName || editForm.ownerFullName.length < 2) { toast.error('Nombre del propietario es obligatorio (mín. 2 caracteres)'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/super-admin/stores/${store.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          legalName: editForm.legalName || null,
          nit: editForm.nit || null,
          address: editForm.address || null,
          phone: editForm.phone || null,
          ownerFullName: editForm.ownerFullName,
          ownerEmail: editForm.ownerEmail || null,
          ownerPhone: editForm.ownerPhone || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al guardar'); return }
      toast.success(data.message || 'Datos actualizados')

      if (editReceiptFile && editReceiptForm.amount) {
        setUploadingReceipt(true)
        try {
          const reader = new FileReader()
          const fileData = await new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result as string
              const base64 = result.split(',')[1]
              if (base64) resolve(base64)
              else reject(new Error('No se pudo leer el archivo'))
            }
            reader.onerror = () => reject(new Error('Error leyendo archivo'))
            reader.readAsDataURL(editReceiptFile)
          })
          const receiptRes = await fetch('/api/super-admin/payment-receipts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storeId: store.id,
              amount: parseInt(editReceiptForm.amount),
              paymentMethod: editReceiptForm.paymentMethod,
              reference: editReceiptForm.reference || undefined,
              notes: editReceiptForm.notes || undefined,
              fileData,
              fileName: editReceiptFile.name,
              fileSize: editReceiptFile.size,
              fileType: editReceiptFile.type || 'application/octet-stream',
            }),
          })
          const receiptData = await receiptRes.json()
          if (!receiptRes.ok) { toast.error(receiptData.error || 'Error al subir comprobante') }
          else { toast.success('Comprobante de pago registrado') }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Error al subir comprobante')
        }
        finally { setUploadingReceipt(false) }
      }

      setShowEditDialog(false)
      setEditReceiptFile(null)
      setEditReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' })
      onRefresh(store.id)
    } catch { toast.error('Error de conexión') }
    finally { setSaving(false) }
  }

  async function handleResetProducts() {
    setResettingProducts(true)
    try {
      const res = await fetch(`/api/super-admin/stores/${store.id}/reset-products`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al reiniciar maestra'); return }
      toast.success(data.message)
      setShowResetProductsDialog(false)
      onRefresh(store.id)
    } catch { toast.error('Error de conexión') }
    finally { setResettingProducts(false) }
  }

  async function handleChangePlan() {
    if (!selectedPlanId) { toast.error('Seleccione un plan'); return }
    setChangingPlan(true)
    try {
      const res = await fetch(`/api/super-admin/stores/${store.id}/subscription`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: parseInt(selectedPlanId),
          billingPeriod: selectedPeriod,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al cambiar plan'); return }
      toast.success(data.message || 'Plan actualizado')
      setShowChangePlanDialog(false)
      onRefresh(store.id)
    } catch { toast.error('Error de conexión') }
    finally { setChangingPlan(false) }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 flex h-14 items-center gap-3 border-b bg-background/80 backdrop-blur-sm px-4 sm:px-6">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={onBack}><ArrowRight className="h-4 w-4 rotate-180" />Volver</Button>
        <Separator orientation="vertical" className="h-6" />
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
            <Building2 className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">{store.name}</h2>
            <p className="text-xs text-muted-foreground">{store.user.fullName} · {store.nit || 'Sin NIT'}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Store Info Header */}
          <Card className="rounded-xl border-border/50">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="text-xl">{store.name}</CardTitle>
                  {store.legalName && <p className="text-sm text-muted-foreground">{store.legalName}</p>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="default" size="sm" className="gap-1.5 active:scale-[0.98] transition-all" onClick={openEdit}>
                    <Pencil className="h-3.5 w-3.5" />Editar Datos
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5 active:scale-[0.98] transition-all" onClick={() => onResetPassword(store.user)}>
                    <KeyRound className="h-3.5 w-3.5" />Reset Contraseña
                  </Button>
                  <AlertDialog open={showResetProductsDialog} onOpenChange={setShowResetProductsDialog}>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm" className="gap-1.5 active:scale-[0.98] transition-all" disabled={store._count.products === 0}>
                        <Trash2 className="h-3.5 w-3.5" />Reset Maestra
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-destructive" />
                          Reiniciar Maestra de Productos
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                          <div className="space-y-3">
                            <p>
                              ¿Estás seguro de que deseas eliminar <strong>todos los productos</strong> de la tienda <strong>{store.name}</strong>?
                            </p>
                            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm space-y-1">
                              <p className="font-medium text-destructive">Esta acción eliminará:</p>
                              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                                <li><strong>{store._count.products}</strong> productos</li>
                                <li>Todos los movimientos de inventario asociados</li>
                                <li>Los items de compra vinculados a estos productos</li>
                              </ul>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Los items en órdenes, comandas y cotizaciones se conservarán (sin referencia al producto).
                              Esta acción <strong>no se puede deshacer</strong>.
                            </p>
                          </div>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter className="gap-2">
                        <AlertDialogCancel disabled={resettingProducts}>Cancelar</AlertDialogCancel>
                        <Button variant="destructive" onClick={handleResetProducts} disabled={resettingProducts} className="gap-1.5">
                          {resettingProducts ? (
                            <>
                              <span className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              Eliminando...
                            </>
                          ) : (
                            <>
                              <Trash2 className="h-3.5 w-3.5" />
                              Sí, eliminar todo
                            </>
                          )}
                        </Button>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div><span className="text-muted-foreground">Propietario:</span><br /><span className="font-medium">{store.user.fullName || store.user.cedula}</span></div>
                <div><span className="text-muted-foreground">Cédula:</span><br /><span className="font-mono">{store.user.cedula}</span></div>
                <div><span className="text-muted-foreground">Email:</span><br /><span className="font-medium">{store.user.email || '—'}</span></div>
                <div><span className="text-muted-foreground">Teléfono:</span><br /><span className="font-medium">{store.user.phone || '—'}</span></div>
                <div><span className="text-muted-foreground">Dirección:</span><br /><span className="font-medium">{store.address || '—'}</span></div>
                <div><span className="text-muted-foreground">Tel. Tienda:</span><br /><span className="font-medium">{store.phone || '—'}</span></div>
                <div><span className="text-muted-foreground">Moneda:</span><br /><span className="font-medium">{store.currencyCode}</span></div>
                <div><span className="text-muted-foreground">Creada:</span><br /><span className="font-medium">{formatDate(store.createdAt)}</span></div>
              </div>
            </CardContent>
          </Card>

          {/* Subscription Card */}
          <Card className="border-l-4 border-l-amber-500 rounded-xl border-border/50">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 bg-amber-100 dark:bg-amber-500/15 rounded-lg flex items-center justify-center">
                    <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Suscripción</CardTitle>
                    <CardDescription>Plan y estado de la suscripción</CardDescription>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5 active:scale-[0.98] transition-all" onClick={openChangePlan}>
                  <CreditCard className="h-3.5 w-3.5" />Cambiar Plan
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {subscription ? (
                <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Plan Actual</p>
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4 text-amber-500" />
                      <span className="font-semibold">{subscription.plan.name}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Estado</p>
                    {getSubscriptionStatusBadge(subscription.status)}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Facturación</p>
                    <p className="text-sm font-medium">
                      {subscription.billingPrice > 0 ? formatCOP(subscription.billingPrice) : '—'}
                      <span className="text-muted-foreground"> / {subscription.billingPeriod || '—'}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Fechas</p>
                    <p className="text-sm">
                      <span className="font-medium">{formatDate(subscription.startDate)}</span>
                      {subscription.endDate && (
                        <>
                          <span className="text-muted-foreground mx-1">→</span>
                          <span className="font-medium">{formatDate(subscription.endDate)}</span>
                        </>
                      )}
                    </p>
                  </div>
                  {subscription.trialEndDate && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Fin del Trial</p>
                      <p className="text-sm font-medium">{formatDate(subscription.trialEndDate)}</p>
                    </div>
                  )}
                  {subscription.nextBillingAt && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Próxima Facturación</p>
                      <p className="text-sm font-medium">{formatDate(subscription.nextBillingAt)}</p>
                    </div>
                  )}
                  {subscription.lastBilledAt && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Última Facturación</p>
                      <p className="text-sm font-medium">{formatDate(subscription.lastBilledAt)}</p>
                    </div>
                  )}
                  {daysRemaining !== null && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Días Restantes</p>
                      <p className={`text-sm font-bold ${daysRemaining <= 7 ? 'text-red-600' : daysRemaining <= 30 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {daysRemaining > 0 ? daysRemaining : 0} días
                      </p>
                    </div>
                  )}
                </div>
                {subscription && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-muted-foreground mb-2 font-medium">Uso del Plan</p>
                    <div className="grid grid-cols-2 gap-3">
                      <UsageBar label="Empleados" current={store._count.employees} max={subscription.plan.maxEmployees} icon={<Users className="h-3 w-3" />} />
                      <UsageBar label="Productos" current={store._count.products} max={subscription.plan.maxProducts} icon={<Package className="h-3 w-3" />} />
                    </div>
                  </div>
                )}
                </>
              ) : (
                <div className="flex items-center justify-center py-6 text-center">
                  <div>
                    <Crown className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" />
                    <p className="text-sm text-muted-foreground">Sin suscripción activa</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Asigne un plan a esta tienda</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* DIAN Info Card */}
          <Card className="border-l-4 border-l-emerald-500 rounded-xl border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 bg-emerald-100 dark:bg-emerald-500/15 rounded-lg flex items-center justify-center">
                  <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <CardTitle className="text-lg">Facturación Electrónica (DIAN)</CardTitle>
                  <CardDescription>Resolución y datos de facturación electrónica</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Resolución</h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">Número de Resolución:</span>
                      <p className="font-mono font-medium">{dianInfo.resolutionNumber || '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Prefijo:</span>
                      <p className="font-mono font-medium">{dianInfo.invoicePrefix || '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Consecutivo:</span>
                      <p className="font-mono font-medium">
                        {dianInfo.resolutionStartNumber ?? '—'} — {dianInfo.resolutionEndNumber ?? '—'}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Vigencia</h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground">Fecha Inicio:</span>
                      <p className="font-medium">{dianInfo.resolutionStartDate ? formatDate(dianInfo.resolutionStartDate) : '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Fecha Fin:</span>
                      <p className="font-medium">{dianInfo.resolutionEndDate ? formatDate(dianInfo.resolutionEndDate) : '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Modo:</span>
                      <p>
                        {dianInfo.invoiceTestMode === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : dianInfo.invoiceTestMode ? (
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20">Habilitación</Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20">Producción</Badge>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Estadísticas de Facturas</h4>
                  {invoiceStats && invoiceStats.length > 0 ? (
                    <div className="space-y-1.5">
                      {invoiceStats.map((stat) => (
                        <div key={stat.status} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{stat.status}</span>
                          <Badge variant="secondary" className="text-xs font-mono">{stat._count}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin datos de facturación</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4 border-l-4 border-l-emerald-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
                <div><p className="text-xs text-muted-foreground">Ventas Totales</p><p className="text-lg font-bold text-emerald-600">{formatCOP(stats.totalSales)}</p></div>
              </div>
            </Card>
            <Card className="p-4 border-l-4 border-l-red-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
              <div className="flex items-center gap-3">
                <TrendingDown className="h-5 w-5 text-red-500" />
                <div><p className="text-xs text-muted-foreground">Gastos Totales</p><p className="text-lg font-bold text-red-600">{formatCOP(stats.totalExpenses)}</p></div>
              </div>
            </Card>
            <Card className="p-4 border-l-4 border-l-blue-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-blue-500" />
                <div><p className="text-xs text-muted-foreground">Balance</p><p className={`text-lg font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCOP(profit)}</p></div>
              </div>
            </Card>
            <Card className="p-4 border-l-4 border-l-purple-500 hover:shadow-md transition-all duration-200 rounded-xl border-border/50">
              <div className="flex items-center gap-3">
                <ShoppingCart className="h-5 w-5 text-purple-500" />
                <div>
                  <p className="text-xs text-muted-foreground">Órdenes</p>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold">{store._count.orders}</p>
                    {Object.entries(stats.ordersByStatus).map(([k, v]) => (
                      <Badge key={k} variant="outline" className="text-[10px]">{k}: {v}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Sucursales (Branches) */}
          <Card className="rounded-xl border-border/50">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${parentSubInfo?.multiStoreEnabled ? 'bg-violet-100 dark:bg-violet-500/15' : 'bg-muted'}`}>
                    <Building2 className={`h-5 w-5 ${parentSubInfo?.multiStoreEnabled ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground/40'}`} />
                  </div>
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      Sucursales
                      {branches.length > 0 && <Badge variant="secondary" className="text-xs">{branches.length}/{parentSubInfo?.maxStores ?? 1}</Badge>}
                    </CardTitle>
                    <CardDescription>
                      {parentSubInfo?.multiStoreEnabled
                        ? <>Suscripción centralizada · Plan {parentSubInfo.planName} · Máx. {parentSubInfo.maxStores} sucursales</>
                        : 'Disponible únicamente con el plan Empresarial'
                      }
                    </CardDescription>
                  </div>
                </div>
                {parentSubInfo?.multiStoreEnabled ? (
                  branches.length < (parentSubInfo?.maxStores ?? 0) ? (
                    <Button size="sm" className="gap-1.5 active:scale-[0.98] transition-all" onClick={() => setShowBranchDialog(true)}>
                      <Plus className="h-3.5 w-3.5" />Nueva Sucursal
                    </Button>
                  ) : (
                    <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-600 dark:text-amber-400">Límite alcanzado</Badge>
                  )
                ) : (
                  <Badge variant="outline" className="text-xs border-muted-foreground/30 text-muted-foreground gap-1">
                    <Crown className="h-3 w-3" />Requiere Empresarial
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!parentSubInfo?.multiStoreEnabled && (
                <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 p-6 mb-4 text-center">
                  <Crown className="h-8 w-8 text-amber-500/50 mx-auto mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">Multi-Tienda no disponible en este plan</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Actualmente en plan <span className="font-semibold">{parentSubInfo?.planName || '—'}</span>. Actualiza a Empresarial para crear y gestionar sucursales.</p>
                </div>
              )}
              {branchesLoading ? (
                <div className="flex justify-center py-8"><div className="h-6 w-6 border-3 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : branches.length === 0 ? (
                <div className="text-center py-8">
                  <Building2 className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Sin sucursales creadas</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">{parentSubInfo?.multiStoreEnabled ? 'Crea sucursales para gestionar múltiples puntos de venta del mismo dueño' : 'Actualiza a Empresarial para habilitar esta funcionalidad'}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {branches.map((branch) => (
                    <div key={branch.id} className="p-4 rounded-xl border hover:shadow-md transition-all duration-200 group cursor-pointer" onClick={() => onRefresh(branch.id)}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 bg-violet-100 dark:bg-violet-500/15 rounded-lg flex items-center justify-center">
                            <Building2 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{branch.name}</p>
                            {branch.address && <p className="text-xs text-muted-foreground">{branch.address}</p>}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <Link2 className="h-2.5 w-2.5" />Vinculada
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{branch._count.employees}</span>
                        <span className="flex items-center gap-1"><Package className="h-3 w-3" />{branch._count.products}</span>
                        <span className="flex items-center gap-1"><ShoppingCart className="h-3 w-3" />{branch._count.orders}</span>
                        <span className="ml-auto">{formatDate(branch.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Create Branch Dialog */}
          <Dialog open={showBranchDialog} onOpenChange={(open) => { if (!open) setBranchForm({ name: '', address: '', phone: '', legalName: '', nit: '' }); setShowBranchDialog(open) }}>
            <DialogContent className="max-w-md rounded-xl">
              <DialogHeader>
                <DialogTitle>Nueva Sucursal</DialogTitle>
                <DialogDescription>Sucursal vinculada a {store.name}. Hereda la suscripción {parentSubInfo?.planName || '—'} ({branches.length + 1}/{parentSubInfo?.maxStores ?? '—'}). El dueño accede con las mismas credenciales.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Nombre de la Sucursal *</Label>
                  <Input placeholder="Ej: Sucursal Norte" value={branchForm.name} onChange={(e) => setBranchForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Razón Social</Label>
                  <Input placeholder={store.legalName || 'Opcional'} value={branchForm.legalName} onChange={(e) => setBranchForm(p => ({ ...p, legalName: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>NIT</Label>
                    <Input placeholder={store.nit || 'Opcional'} value={branchForm.nit} onChange={(e) => setBranchForm(p => ({ ...p, nit: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Teléfono</Label>
                    <Input placeholder="3001234567" value={branchForm.phone} onChange={(e) => setBranchForm(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Dirección</Label>
                  <Input placeholder="Calle 10 #5-30" value={branchForm.address} onChange={(e) => setBranchForm(p => ({ ...p, address: e.target.value }))} />
                </div>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5 shrink-0" />
                    La sucursal hereda la suscripción del plan {parentSubInfo?.planName || '—'}. No se generan credenciales separadas.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowBranchDialog(false)}>Cancelar</Button>
                <Button onClick={handleCreateBranch} disabled={branchCreating} className="gap-1.5">
                  {branchCreating ? <><div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />Creando...</> : <><Plus className="h-3.5 w-3.5" />Crear Sucursal</>}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Tabs con toda la información */}
          <Tabs defaultValue="employees" className="space-y-4">
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="employees" className="gap-1.5"><Users className="h-3.5 w-3.5" />Empleados ({employees.length})</TabsTrigger>
              <TabsTrigger value="products" className="gap-1.5"><Package className="h-3.5 w-3.5" />Productos ({store._count.products})</TabsTrigger>
              <TabsTrigger value="customers" className="gap-1.5"><CreditCard className="h-3.5 w-3.5" />Clientes ({store._count.customers})</TabsTrigger>
              <TabsTrigger value="orders" className="gap-1.5"><ClipboardList className="h-3.5 w-3.5" />Órdenes ({store._count.orders})</TabsTrigger>
              <TabsTrigger value="services" className="gap-1.5"><Zap className="h-3.5 w-3.5" />Servicios ({services.length})</TabsTrigger>
              <TabsTrigger value="taxes" className="gap-1.5"><Receipt className="h-3.5 w-3.5" />IVA ({taxRates.length})</TabsTrigger>
              <TabsTrigger value="categories" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Categorías ({categories.length})</TabsTrigger>
              <TabsTrigger value="roles" className="gap-1.5"><Shield className="h-3.5 w-3.5" />Roles ({roles.length})</TabsTrigger>
              <TabsTrigger value="expenses" className="gap-1.5"><AlertCircle className="h-3.5 w-3.5" />Gastos ({store._count.expenses})</TabsTrigger>
              <TabsTrigger value="providers" className="gap-1.5"><Truck className="h-3.5 w-3.5" />Proveedores ({providers.length})</TabsTrigger>
              <TabsTrigger value="receipts" className="gap-1.5"><Upload className="h-3.5 w-3.5" />Pagos ({receipts.length})</TabsTrigger>
            </TabsList>

            {/* EMPLEADOS */}
            <TabsContent value="employees">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {employees.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin empleados registrados</p></div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Nombre</TableHead><TableHead>Cédula</TableHead><TableHead>Cargo</TableHead><TableHead>Rol</TableHead><TableHead>Email</TableHead><TableHead>Teléfono</TableHead><TableHead>Estado</TableHead><TableHead>Ingreso</TableHead><TableHead className="text-right">Acciones</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {employees.map((emp) => (
                          <TableRow key={emp.id} className="hover:bg-muted/30">
                            <TableCell className="font-medium">{emp.user.fullName || '—'}</TableCell>
                            <TableCell className="font-mono text-sm">{emp.user.cedula}</TableCell>
                            <TableCell>{emp.position || '—'}</TableCell>
                            <TableCell>{emp.role ? <Badge variant="outline">{emp.role.name}</Badge> : '—'}</TableCell>
                            <TableCell className="text-sm">{emp.user.email || '—'}</TableCell>
                            <TableCell className="text-sm">{emp.user.phone || '—'}</TableCell>
                            <TableCell><Badge variant={emp.isActive ? 'default' : 'secondary'} className={emp.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20' : ''}>{emp.isActive ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                            <TableCell className="text-xs">{formatDate(emp.createdAt)}</TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Reset contraseña" aria-label="Restablecer contraseña" onClick={() => onResetPassword(emp.user)}>
                                <KeyRound className="h-3.5 w-3.5 text-amber-500" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* PRODUCTOS */}
            <TabsContent value="products">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {products.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin productos registrados</p></div>
                ) : (
                  <ScrollArea className="max-h-[500px]">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Producto</TableHead><TableHead>Categoría</TableHead><TableHead>IVA</TableHead><TableHead className="text-right">Precio</TableHead><TableHead className="text-right">Stock</TableHead><TableHead>Estado</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {products.map((p) => (
                          <TableRow key={p.id} className="hover:bg-muted/30">
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell>{p.category?.name || '—'}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{p.taxRate ? `${p.taxRate.name} (${p.taxRate.rate}%)` : 'Sin IVA'}</Badge></TableCell>
                            <TableCell className="text-right font-mono">{formatCOP(p.salePrice)}</TableCell>
                            <TableCell className="text-right"><span className={p.currentStock <= 5 ? 'text-red-600 font-medium' : ''}>{p.currentStock}</span></TableCell>
                            <TableCell><Badge variant={p.isActive ? 'default' : 'secondary'} className={p.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20' : ''}>{p.isActive ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* CLIENTES */}
            <TabsContent value="customers">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {customers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><CreditCard className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin clientes registrados</p></div>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Nombre</TableHead><TableHead>Teléfono</TableHead><TableHead>Email</TableHead><TableHead>NIT</TableHead><TableHead className="text-right">Deuda</TableHead><TableHead>Registro</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {customers.map((c) => (
                        <TableRow key={c.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-sm">{c.phone || '—'}</TableCell>
                          <TableCell className="text-sm">{c.email || '—'}</TableCell>
                          <TableCell className="font-mono text-sm">{c.nit || '—'}</TableCell>
                          <TableCell className="text-right"><span className={c.totalDebt > 0 ? 'text-red-600 font-medium' : ''}>{formatCOP(c.totalDebt)}</span></TableCell>
                          <TableCell className="text-xs">{formatDate(c.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* ÓRDENES */}
            <TabsContent value="orders">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {orders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><ClipboardList className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin órdenes registradas</p></div>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Número</TableHead><TableHead>Cliente</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Pago</TableHead><TableHead>Estado</TableHead><TableHead>Fecha</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {orders.map((o) => (
                        <TableRow key={o.id} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-sm font-medium">{o.orderNumber}</TableCell>
                          <TableCell>{o.customer?.name || 'Consumidor'}</TableCell>
                          <TableCell className="text-right font-mono">{formatCOP(o.total)}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{o.paymentMethod}</Badge></TableCell>
                          <TableCell><Badge variant={o.status === 'COMPLETED' ? 'default' : o.status === 'CANCELLED' ? 'destructive' : 'secondary'}>{o.status}</Badge></TableCell>
                          <TableCell className="text-xs">{formatDateTime(o.createdAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* SERVICIOS */}
            <TabsContent value="services">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {services.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><Zap className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin servicios registrados</p></div>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Servicio</TableHead><TableHead className="text-right">Precio</TableHead><TableHead>Unidad</TableHead><TableHead>Estado</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {services.map((sv) => (
                        <TableRow key={sv.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{sv.name}</TableCell>
                          <TableCell className="text-right font-mono">{formatCOP(sv.price)}</TableCell>
                          <TableCell className="text-sm">{sv.unit}</TableCell>
                          <TableCell><Badge variant={sv.isActive ? 'default' : 'secondary'} className={sv.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20' : ''}>{sv.isActive ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* IVA / TASAS */}
            <TabsContent value="taxes">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {taxRates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><Receipt className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin tarifas de impuesto</p></div>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Nombre</TableHead><TableHead>Código DIAN</TableHead><TableHead>Tipo</TableHead><TableHead className="text-right">Tasa</TableHead><TableHead>Aplica a</TableHead><TableHead>Categoría</TableHead><TableHead>Defecto</TableHead><TableHead>Estado</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {taxRates.map((t) => (
                        <TableRow key={t.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell><Badge variant="outline" className="font-mono text-xs">{t.code}</Badge></TableCell>
                          <TableCell className="text-sm">{t.rateType === 'PERCENTAGE' ? 'Porcentaje' : 'Fijo'}</TableCell>
                          <TableCell className="text-right font-mono font-medium">{t.rate}%</TableCell>
                          <TableCell className="text-sm">{t.applyTo === 'BOTH' ? 'Prod. y Serv.' : t.applyTo === 'PRODUCT' ? 'Productos' : 'Servicios'}</TableCell>
                          <TableCell className="text-sm">{t.category === 'SALES_TAX' ? 'Impuesto Venta' : t.category === 'CONSUMPTION_TAX' ? 'Consumo' : t.category}</TableCell>
                          <TableCell>{t.isDefault ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20">Sí</Badge> : '—'}</TableCell>
                          <TableCell><Badge variant={t.isActive ? 'default' : 'secondary'} className={t.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20' : ''}>{t.isActive ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* CATEGORÍAS */}
            <TabsContent value="categories">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {categories.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin categorías</p></div>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Categoría</TableHead><TableHead className="text-right">Productos</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {categories.map((c) => (
                        <TableRow key={c.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-right"><Badge variant="secondary">{c._count.products}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* ROLES */}
            <TabsContent value="roles">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {roles.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><Shield className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin roles definidos</p></div>
                ) : (
                  <div className="divide-y">
                    {roles.map((r) => {
                      const perms = JSON.parse(r.permissions || '{}') as Record<string, boolean>
                      const activeCount = Object.values(perms).filter(Boolean).length
                      return (
                        <div key={r.id} className="p-4 space-y-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{r.name}</span>
                              {r.isDefault && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20 text-xs">Por defecto</Badge>}
                              <Badge variant="outline" className="text-xs">{r._count.employees} empleados</Badge>
                              <Badge variant="secondary" className="text-xs">{activeCount} módulos activos</Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">{r.description || ''}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(perms).map(([key, val]) => (
                              <Badge key={key} variant={val ? 'default' : 'outline'} className={`text-[10px] ${val ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20' : 'opacity-50'}`}>
                                {key}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* GASTOS */}
            <TabsContent value="expenses">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {expenses.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><AlertCircle className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin gastos registrados</p></div>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Categoría</TableHead><TableHead>Descripción</TableHead><TableHead className="text-right">Monto</TableHead><TableHead>Fecha</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {expenses.map((e) => (
                        <TableRow key={e.id} className="hover:bg-muted/30">
                          <TableCell><Badge variant="outline">{e.category}</Badge></TableCell>
                          <TableCell className="font-medium">{e.description}</TableCell>
                          <TableCell className="text-right font-mono text-red-600">{formatCOP(e.amount)}</TableCell>
                          <TableCell className="text-xs">{formatDate(e.date)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* PROVEEDORES */}
            <TabsContent value="providers">
              <Card className="rounded-xl border-border/50"><CardContent className="p-0">
                {providers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm"><Truck className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2 animate-pulse" /><p>Sin proveedores registrados</p></div>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Nombre</TableHead><TableHead>Contacto</TableHead><TableHead>Teléfono</TableHead><TableHead>Email</TableHead><TableHead>NIT</TableHead><TableHead>Estado</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {providers.map((pv) => (
                        <TableRow key={pv.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{pv.name}</TableCell>
                          <TableCell className="text-sm">{pv.name}</TableCell>
                          <TableCell className="text-sm">{pv.phone || '—'}</TableCell>
                          <TableCell className="text-sm">{pv.email || '—'}</TableCell>
                          <TableCell className="font-mono text-sm">{pv.nit || '—'}</TableCell>
                          <TableCell><Badge variant={pv.isActive ? 'default' : 'secondary'} className={pv.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20' : ''}>{pv.isActive ? 'Activo' : 'Inactivo'}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent></Card>
            </TabsContent>

            {/* COMPROBANTES DE PAGO */}
            <TabsContent value="receipts">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 bg-emerald-100 dark:bg-emerald-500/15 rounded-lg flex items-center justify-center">
                      <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">Comprobantes de Pago</h3>
                      <p className="text-xs text-muted-foreground">Historial y gestión de pagos de {store.name}</p>
                    </div>
                  </div>
                  <Button onClick={openUploadDialog} className="gap-2 active:scale-[0.98] transition-all shadow-lg shadow-emerald-600/20" size="sm">
                    <Plus className="h-4 w-4" />Registrar Comprobante
                  </Button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Banknote className="h-3 w-3" />Total</div>
                    <p className="text-lg font-bold">{receipts.length}</p>
                  </div>
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mb-1"><Clock className="h-3 w-3" />Pendientes</div>
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{receipts.filter(r => r.status === 'PENDING').length}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mb-1"><BadgeCheck className="h-3 w-3" />Aprobados</div>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{receipts.filter(r => r.status === 'APPROVED').length}</p>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><CircleDollarSign className="h-3 w-3" />Total aprobado</div>
                    <p className="text-lg font-bold font-mono">{formatCOP(receipts.filter(r => r.status === 'APPROVED').reduce((s, r) => s + r.amount, 0))}</p>
                  </div>
                </div>

                {receipts.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((f) => (
                      <Button key={f} variant={receiptFilter === f ? 'default' : 'outline'} size="sm" className="h-7 text-xs gap-1" onClick={() => setReceiptFilter(f)}>
                        {f === 'ALL' ? 'Todos' : f === 'PENDING' ? 'Pendientes' : f === 'APPROVED' ? 'Aprobados' : 'Rechazados'}
                        <span className="text-[10px] opacity-70">({f === 'ALL' ? receipts.length : receipts.filter(r => r.status === f).length})</span>
                      </Button>
                    ))}
                  </div>
                )}

                {receiptsLoading ? (
                  <div className="flex justify-center py-12"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
                ) : (() => {
                  const filtered = receiptFilter === 'ALL' ? receipts : receipts.filter(r => r.status === receiptFilter)
                  return filtered.length === 0 ? (
                    <Card className="rounded-xl border-border/50 border-dashed">
                      <CardContent className="py-12 text-center">
                        <div className="h-16 w-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4"><FileCheck2 className="h-8 w-8 text-muted-foreground/30" /></div>
                        <p className="text-sm font-medium text-muted-foreground">{receipts.length === 0 ? 'Sin comprobantes de pago' : 'Sin comprobantes en esta categoría'}</p>
                        <p className="text-xs text-muted-foreground/60 mt-1.5 max-w-xs mx-auto">{receipts.length === 0 ? 'Registra el primer comprobante cuando el cliente realice el pago por Nequi, Daviplata o consignación.' : 'Cambia el filtro para ver otros comprobantes.'}</p>
                        {receipts.length === 0 && (
                          <Button onClick={openUploadDialog} size="sm" className="gap-2 mt-4 active:scale-[0.98] transition-all"><Upload className="h-3.5 w-3.5" />Registrar Primer Comprobante</Button>
                        )}
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {filtered.map((r) => (
                        <Card key={r.id} className={`rounded-xl border overflow-hidden transition-all duration-200 hover:shadow-md ${r.status === 'PENDING' ? 'border-amber-500/30 bg-amber-500/[0.02]' : r.status === 'APPROVED' ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
                          <CardContent className="p-0">
                            <div className="flex flex-col sm:flex-row">
                              <div className={`w-1.5 shrink-0 ${r.status === 'PENDING' ? 'bg-amber-500' : r.status === 'APPROVED' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                              <div className="flex-1 p-4">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                  <div className="flex-1 min-w-0 space-y-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold font-mono text-lg">{formatCOP(r.amount)}</span>
                                      <Badge variant="outline" className="text-[10px] gap-1"><Wallet className="h-2.5 w-2.5" />{r.paymentMethod}</Badge>
                                      {r.status === 'PENDING' && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/20 text-[10px] gap-1"><Clock className="h-2.5 w-2.5" />Pendiente</Badge>}
                                      {r.status === 'APPROVED' && <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20 text-[10px] gap-1"><BadgeCheck className="h-2.5 w-2.5" />Aprobado</Badge>}
                                      {r.status === 'REJECTED' && <Badge className="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20 text-[10px] gap-1"><XCircle className="h-2.5 w-2.5" />Rechazado</Badge>}
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                      <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatDateTime(r.createdAt)}</span>
                                      {r.reference && <span className="font-mono flex items-center gap-1"><Hash className="h-3 w-3" />Ref: {r.reference}</span>}
                                      <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{r.fileName}</span>
                                      <span className="flex items-center gap-1">{(r.fileSize / 1024).toFixed(0)} KB</span>
                                    </div>
                                    <div className="flex flex-col gap-0.5">
                                      {(() => {
                                        let planChange: { planChangeRequest: boolean; requestedPlanId: number; requestedPlanName: string; requestedBillingPeriod: string; userNotes: string | null } | null = null
                                        if (r.notes) {
                                          try {
                                            const parsed = JSON.parse(r.notes)
                                            if (parsed.planChangeRequest && parsed.requestedPlanName) planChange = parsed
                                          } catch { /* not JSON */ }
                                        }
                                        if (!planChange) {
                                          return r.notes ? <p className="text-xs text-muted-foreground italic">&#128221; {r.notes}</p> : null
                                        }
                                        return (
                                          <div className={`mt-1 p-2 rounded-lg border ${
                                            r.status === 'APPROVED' ? 'bg-violet-50 dark:bg-violet-500/5 border-violet-200/60 dark:border-violet-800/30'
                                            : r.status === 'REJECTED' ? 'bg-red-50 dark:bg-red-500/5 border-red-200/60 dark:border-red-800/30'
                                            : 'bg-sky-50 dark:bg-sky-500/5 border-sky-200/60 dark:border-sky-800/30'
                                          }`}>
                                            <div className="flex items-center gap-1.5">
                                              <ArrowRight className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                                              <p className={`text-xs font-semibold ${
                                                r.status === 'APPROVED' ? 'text-violet-700 dark:text-violet-300'
                                                : r.status === 'REJECTED' ? 'text-red-700 dark:text-red-300'
                                                : 'text-sky-700 dark:text-sky-300'
                                              }`}>
                                                &#x1f504; Solicitud de cambio a <span className="font-bold">{planChange.requestedPlanName}</span>
                                              </p>
                                            </div>
                                            {planChange.userNotes && (
                                              <p className="text-[11px] text-muted-foreground mt-0.5 italic">&quot;{planChange.userNotes}&quot;</p>
                                            )}
                                            {r.status === 'PENDING' && (
                                              <p className="text-[11px] text-sky-600/70 dark:text-sky-400/60 mt-0.5">
                                                &#x26a0;&#xfe0f; Al aprobar, el plan se cambiará automáticamente.
                                              </p>
                                            )}
                                          </div>
                                        )
                                      })()}
                                      {r.reviewNotes && <p className="text-xs text-muted-foreground"><span className="font-medium">Revisión:</span> {r.reviewNotes}{r.reviewedAt && <span className="ml-1">· {formatDateTime(r.reviewedAt)}</span>}</p>}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => handleViewReceipt(r)}><EyeIcon className="h-3.5 w-3.5" />Ver</Button>
                                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => handleDownloadReceipt(r)}><Download className="h-3.5 w-3.5" />Descargar</Button>
                                    {r.status === 'PENDING' && (<>
                                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Aprobar" aria-label="Aprobar comprobante" onClick={() => { setPreviewReceipt(r); setReviewNotes('') }}><CheckCircle2 className="h-4 w-4 text-emerald-600" /></Button>
                                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Rechazar" aria-label="Rechazar comprobante" onClick={() => { setPreviewReceipt(r); setReviewNotes('') }}><XCircle className="h-4 w-4 text-red-500" /></Button>
                                      <Button variant="ghost" size="icon" className="h-8 w-8" title="Eliminar" aria-label="Eliminar comprobante" onClick={() => handleDeleteReceipt(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                    </>)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )
                })()}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Edit Store Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { if (!open) { setEditReceiptFile(null); setEditReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' }) } setShowEditDialog(open) }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Editar Datos del Establecimiento</DialogTitle>
            <DialogDescription>Modifique la información del local y del propietario</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Datos del Establecimiento</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Nombre de la Tienda *</Label>
                  <div className="relative">
                    <Store className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Nombre del negocio" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editForm.name} onChange={(e) => updateEdit('name', e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Razón Social</Label>
                  <Input className="focus-visible:ring-primary/20 focus-visible:border-primary/40" placeholder="Razón social" value={editForm.legalName} onChange={(e) => updateEdit('legalName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>NIT</Label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="901234567-8" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editForm.nit} onChange={(e) => updateEdit('nit', e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Teléfono del Local</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="6011234567" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editForm.phone} onChange={(e) => updateEdit('phone', e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Dirección</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Calle 10 #5-30" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editForm.address} onChange={(e) => updateEdit('address', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Datos del Propietario</h3>
                <Badge variant="outline" className="text-xs font-mono">{store.user.cedula}</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Nombre Completo *</Label>
                  <Input className="focus-visible:ring-primary/20 focus-visible:border-primary/40" placeholder="Nombre del propietario" value={editForm.ownerFullName} onChange={(e) => updateEdit('ownerFullName', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input type="email" placeholder="correo@ejemplo.com" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editForm.ownerEmail} onChange={(e) => updateEdit('ownerEmail', e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="3001234567" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editForm.ownerPhone} onChange={(e) => updateEdit('ownerPhone', e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
            <Separator />
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                <h3 className="font-semibold text-sm">Comprobante de Pago (Opcional)</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Archivo del comprobante</Label>
                  <div
                    className="border-2 border-dashed rounded-lg p-3 text-center hover:border-primary/50 transition-colors cursor-pointer"
                    onClick={() => document.getElementById('edit-receipt-file')?.click()}
                  >
                    {editReceiptFile ? (
                      <div className="flex items-center justify-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium truncate">{editReceiptFile.name}</span>
                        <span className="text-xs text-muted-foreground">({(editReceiptFile.size / 1024).toFixed(0)}KB)</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditReceiptFile(null) }}
                          className="ml-2 text-muted-foreground hover:text-destructive"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground"><Upload className="h-5 w-5 text-muted-foreground/50 mx-auto mb-1" />Haz clic para seleccionar archivo</p>
                    )}
                    <input
                      id="edit-receipt-file"
                      type="file"
                      className="hidden"
                      accept="image/png,image/jpeg,image/webp,image/heic,.pdf"
                      onChange={(e) => { if (e.target.files?.[0]) setEditReceiptFile(e.target.files[0]) }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Monto (COP)</Label>
                  <Input type="number" placeholder="50000" value={editReceiptForm.amount}
                    onChange={(e) => setEditReceiptForm(f => ({ ...f, amount: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Método de pago</Label>
                  <Select value={editReceiptForm.paymentMethod} onValueChange={(v) => setEditReceiptForm(f => ({ ...f, paymentMethod: v }))}>
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
                  <Input placeholder="Ej: 000123456789" value={editReceiptForm.reference}
                    onChange={(e) => setEditReceiptForm(f => ({ ...f, reference: e.target.value }))} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Notas</Label>
                  <Textarea placeholder="Observaciones..." rows={2} value={editReceiptForm.notes}
                    onChange={(e) => setEditReceiptForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditReceiptFile(null); setEditReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' }) }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || uploadingReceipt} className="gap-2 active:scale-[0.98] transition-all">
              {saving || uploadingReceipt ? (
                <><div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />{uploadingReceipt ? 'Subiendo comprobante...' : 'Guardando...'}</>
              ) : (
                <><Pencil className="h-4 w-4" />Guardar Cambios</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Plan Dialog */}
      <Dialog open={showChangePlanDialog} onOpenChange={setShowChangePlanDialog}>
        <DialogContent className="max-w-lg rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              Cambiar Plan de Suscripción
            </DialogTitle>
            <DialogDescription>Seleccione un nuevo plan y período de facturación para {store.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {subscription && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <p className="text-xs text-muted-foreground">Plan Actual</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-semibold">{subscription.plan.name}</span>
                  {getSubscriptionStatusBadge(subscription.status)}
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{subscription.billingPeriod}</span>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label>Plan</Label>
              <Select value={selectedPlanId} onValueChange={(val) => {
                setSelectedPlanId(val)
                const plan = plans.find(p => p.id.toString() === val)
                if (plan && plan.price === 0) {
                  setSelectedPeriod('TRIAL')
                } else if (selectedPeriod === 'TRIAL') {
                  setSelectedPeriod('MONTHLY')
                }
              }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccione un plan" />
                </SelectTrigger>
                <SelectContent>
                  {plans.filter(p => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder).map((plan) => (
                    <SelectItem key={plan.id} value={plan.id.toString()}>
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-medium">{plan.name}</span>
                        <span className="text-muted-foreground text-xs">{formatCOP(plan.price)}/mes</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <Label>Período de Facturación</Label>
              <RadioGroup value={selectedPeriod} onValueChange={setSelectedPeriod} className="grid grid-cols-2 gap-3">
                {BILLING_PERIODS.map((period) => (
                  <Label
                    key={period.value}
                    htmlFor={`period-${period.value}`}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50 ${selectedPeriod === period.value ? 'border-primary bg-primary/5' : ''}`}
                  >
                    <RadioGroupItem value={period.value} id={`period-${period.value}`} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{period.label}</p>
                      {period.discount > 0 && (
                        <p className="text-xs text-emerald-600 font-medium">-{period.discount}% descuento</p>
                      )}
                    </div>
                  </Label>
                ))}
              </RadioGroup>
            </div>
            {selectedPlan && (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                {selectedBillingPeriod.value === 'TRIAL' ? (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Plan Trial</span>
                      <span className="font-bold text-emerald-600">GRATIS — 7 días</span>
                    </div>
                    <p className="text-xs text-muted-foreground">El plan Trial permite evaluar el sistema con funcionalidad completa por 7 días. Luego puede actualizar a un plan de pago.</p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Precio base</span>
                      <span>{formatCOP(selectedPlan.price)} × {selectedBillingPeriod.months} mes(es)</span>
                    </div>
                    {selectedBillingPeriod.discount > 0 && (
                      <div className="flex items-center justify-between text-sm text-emerald-600">
                        <span>Descuento ({selectedBillingPeriod.discount}%)</span>
                        <span>-{formatCOP(selectedPlan.price * selectedBillingPeriod.months * selectedBillingPeriod.discount / 100)}</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex items-center justify-between font-bold">
                      <span>Total</span>
                      <span className="text-lg">{formatCOP(calculatedPrice)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Equivale a {formatCOP(Math.round(calculatedPrice / selectedBillingPeriod.months))}/mes
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangePlanDialog(false)}>Cancelar</Button>
            <Button onClick={handleChangePlan} disabled={!selectedPlanId || changingPlan} className="gap-2 active:scale-[0.98] transition-all">
              {changingPlan ? (
                <><div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Actualizando...</>
              ) : (
                <><Crown className="h-4 w-4" />Cambiar Plan</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Receipt Dialog */}
      <Dialog open={!!previewReceipt} onOpenChange={(open) => { if (!open) { setPreviewReceipt(null); setReviewNotes('') } }}>
        <DialogContent className="max-w-xl rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-7 w-7 bg-amber-100 dark:bg-amber-500/15 rounded-lg flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
              Revisar Comprobante de Pago
            </DialogTitle>
            <DialogDescription>Verifica el comprobante y decide aprobar o rechazar el pago</DialogDescription>
          </DialogHeader>
          {previewReceipt && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Monto</p>
                    <p className="font-bold font-mono text-xl text-emerald-600 dark:text-emerald-400">{formatCOP(previewReceipt.amount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Método</p>
                    <Badge variant="outline" className="gap-1"><Wallet className="h-3 w-3" />{previewReceipt.paymentMethod}</Badge>
                  </div>
                  {previewReceipt.reference && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Referencia</p>
                      <p className="font-mono text-sm">{previewReceipt.reference}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Fecha registro</p>
                    <p className="text-sm">{formatDateTime(previewReceipt.createdAt)}</p>
                  </div>
                  {previewReceipt.notes && (
                    <div className="col-span-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Notas del cliente</p>
                      <p className="text-sm bg-muted/50 rounded px-2 py-1">{previewReceipt.notes}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { handleViewReceipt(previewReceipt) }}>
                  <EyeIcon className="h-3.5 w-3.5" />Ver imagen del comprobante
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => handleDownloadReceipt(previewReceipt)}>
                  <Download className="h-3.5 w-3.5" />Descargar archivo
                </Button>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs">Notas de revisión (opcional)</Label>
                <Textarea
                  placeholder="Ej: Pago verificado en cuenta bancaria..."
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <div className="flex-1" />
            <Button variant="destructive" onClick={() => previewReceipt && handleReviewReceipt(previewReceipt.id, 'REJECT')} disabled={reviewing} className="gap-2 active:scale-[0.98] transition-all">
              {reviewing ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <XCircle className="h-4 w-4" />}
              Rechazar
            </Button>
            <Button onClick={() => previewReceipt && handleReviewReceipt(previewReceipt.id, 'APPROVE')} disabled={reviewing} className="gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all">
              {reviewing ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Aprobar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Receipt Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={(open) => { if (!open) { setShowUploadDialog(false); setSelectedFile(null); setSelectedFilePreview(null) }}}>
        <DialogContent className="max-w-md rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-7 w-7 bg-emerald-100 dark:bg-emerald-500/15 rounded-lg flex items-center justify-center">
                <Upload className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              Registrar Comprobante de Pago
            </DialogTitle>
            <DialogDescription>Sube el comprobante del pago realizado por el cliente</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Archivo del comprobante <span className="text-destructive">*</span></Label>
              {!selectedFile ? (
                <div
                  className="border-2 border-dashed rounded-xl p-6 text-center hover:border-primary/50 hover:bg-muted/20 transition-all cursor-pointer group"
                  onClick={() => document.getElementById('sa-receipt-file')?.click()}
                >
                  <div className="h-12 w-12 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:bg-primary/10 transition-colors">
                    <Upload className="h-6 w-6 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">Haz clic o arrastra para subir</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">PNG, JPG, WebP, HEIC, PDF · Máximo 5MB</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedFilePreview && (
                    <div className="relative rounded-lg overflow-hidden border bg-muted/20">
                      <img src={selectedFilePreview} alt="Preview" className="max-h-40 mx-auto object-contain" />
                      <button
                        type="button" onClick={() => { setSelectedFile(null); setSelectedFilePreview(null) }}
                        className="absolute top-2 right-2 h-6 w-6 bg-background/80 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-destructive/80 transition-colors"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
                    <div className="h-9 w-9 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setSelectedFile(null); setSelectedFilePreview(null) }}>
                      Cambiar
                    </Button>
                  </div>
                </div>
              )}
              <input id="sa-receipt-file" type="file" className="hidden" accept="image/png,image/jpeg,image/webp,image/heic,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 5 * 1024 * 1024) { toast.error('El archivo excede 5MB'); return }
                  setSelectedFile(file)
                  if (file.type.startsWith('image/')) {
                    const reader = new FileReader()
                    reader.onload = () => setSelectedFilePreview(reader.result as string)
                    reader.readAsDataURL(file)
                  } else {
                    setSelectedFilePreview(null)
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Monto del pago (COP) <span className="text-destructive">*</span></Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-sm text-muted-foreground font-medium">$</span>
                <Input type="number" placeholder="69.000" className="pl-7 font-mono" value={uploadForm.amount} onChange={(e) => setUploadForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Método de pago</Label>
              <Select value={uploadForm.paymentMethod} onValueChange={(v) => setUploadForm(f => ({ ...f, paymentMethod: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NEQUI">Nequi</SelectItem>
                  <SelectItem value="DAVIPLATA">Davivienda (Daviplata)</SelectItem>
                  <SelectItem value="BANCOLOMBIA">Bancolombia</SelectItem>
                  <SelectItem value="BANCARY">Consignación Bancaria</SelectItem>
                  <SelectItem value="EFFECTIVE">Efectivo</SelectItem>
                  <SelectItem value="OTHER">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Referencia / N. transacción</Label>
              <Input placeholder="Ej: 000123456789" className="font-mono text-sm" value={uploadForm.reference} onChange={(e) => setUploadForm(f => ({ ...f, reference: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Notas adicionales</Label>
              <Textarea placeholder="Observaciones sobre el pago..." rows={2} value={uploadForm.notes} onChange={(e) => setUploadForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${uploadForm.autoApprove ? 'bg-emerald-100 dark:bg-emerald-500/15' : 'bg-amber-100 dark:bg-amber-500/15'}`}>
                  {uploadForm.autoApprove ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> : <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                </div>
                <div>
                  <p className="text-xs font-medium">Aprobar automáticamente</p>
                  <p className="text-[10px] text-muted-foreground">
                    {uploadForm.autoApprove
                      ? 'Se extenderá la suscripción del cliente inmediatamente'
                      : 'Quedará pendiente para revisión manual posterior'}
                  </p>
                </div>
              </div>
              <Switch
                checked={uploadForm.autoApprove}
                onCheckedChange={(checked) => setUploadForm(f => ({ ...f, autoApprove: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowUploadDialog(false); setSelectedFile(null); setSelectedFilePreview(null) }}>Cancelar</Button>
            <Button onClick={handleUploadReceipt} disabled={uploading || !selectedFile || !uploadForm.amount} className={`gap-2 active:scale-[0.98] transition-all ${uploadForm.autoApprove ? 'bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/20' : ''}`}>
              {uploading ? (
                <><div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />{uploadForm.autoApprove ? 'Aprobando...' : 'Registrando...'}</>
              ) : uploadForm.autoApprove ? (
                <><CheckCircle2 className="h-4 w-4" />Registrar y Aprobar</>
              ) : (
                <><Upload className="h-4 w-4" />Registrar como Pendiente</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Image Preview Dialog */}
      <Dialog open={showReceiptPreviewDialog} onOpenChange={(open) => { if (!open) { setShowReceiptPreviewDialog(false); setReceiptPreviewData(null); setReceiptPreviewImage(null) } }}>
        <DialogContent className="max-w-2xl rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-7 w-7 bg-blue-100 dark:bg-blue-500/15 rounded-lg flex items-center justify-center">
                <EyeIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              Vista Previa del Comprobante
            </DialogTitle>
          </DialogHeader>
          {loadingPreview ? (
            <div className="flex justify-center py-12"><div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : receiptPreviewData ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-bold font-mono text-lg text-emerald-600 dark:text-emerald-400">{formatCOP(receiptPreviewData.amount)}</span>
                <Badge variant="outline" className="gap-1"><Wallet className="h-3 w-3" />{receiptPreviewData.paymentMethod}</Badge>
                <span className="text-xs text-muted-foreground">{formatDateTime(receiptPreviewData.createdAt)}</span>
              </div>
              {receiptPreviewImage ? (
                <div className="rounded-lg border bg-muted/20 overflow-hidden">
                  <img src={receiptPreviewImage} alt="Comprobante" className="max-h-[60vh] mx-auto object-contain" />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-8 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Vista previa no disponible para este tipo de archivo</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">{receiptPreviewData.fileName} ({(receiptPreviewData.fileSize / 1024).toFixed(0)} KB)</p>
                </div>
              )}
              <div className="flex justify-end">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => receiptPreviewData && handleDownloadReceipt(receiptPreviewData)}>
                  <Download className="h-3.5 w-3.5" />Descargar original
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <footer className="border-t py-3 px-4 sm:px-6 text-center text-xs text-muted-foreground">
        Ventify POS · Detalle de Tienda · {store.name}
      </footer>
    </div>
  )
}
