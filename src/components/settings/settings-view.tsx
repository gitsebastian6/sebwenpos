'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Store,
  User,
  Receipt,
  Shield,
  Loader2,
  Save,
  Building2,
  Phone,
  MapPin,
  FileText,
  CreditCard,
  BadgeCheck,
  Percent,
  Info,
  Plus,
  Pencil,
  Trash2,
  Star,
  AlertTriangle,
  ToggleLeft,
  ToggleRight,
  ShieldCheck,
} from 'lucide-react'

// ── Constants ──

const DIAN_CODES: Record<string, string> = {
  '01': 'IVA General 19%',
  '02': 'IVA Reducido 5%',
  '03': 'IVA Exento 0%',
  '04': 'IVA Excluido',
  '05': 'Impoconsumo 8%',
  '06': 'ICA',
  '07': 'ReteFuente',
  '08': 'ReteICA',
  '09': 'ReteIVA',
}

const CATEGORY_LABELS: Record<string, string> = {
  SALES_TAX: 'Impuesto de Venta',
  CONSUMPTION_TAX: 'Impoconsumo',
  WITHHOLDING: 'Retención',
  MUNICIPAL: 'Municipal',
}

const CATEGORY_COLORS: Record<string, string> = {
  SALES_TAX: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  CONSUMPTION_TAX: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  WITHHOLDING: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  MUNICIPAL: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
}

const APPLY_TO_LABELS: Record<string, string> = {
  PRODUCT: 'Producto',
  SERVICE: 'Servicio',
  BOTH: 'Ambos',
}

export function SettingsView() {
  const { user, store, updateStore, updateUser } = useAuthStore()

  // ── Store form state ──
  const [storeName, setStoreName] = useState(store?.name || '')
  const [storeLegalName, setStoreLegalName] = useState(store?.legalName || '')
  const [storeNIT, setStoreNIT] = useState(store?.nit || '')
  const [storeAddress, setStoreAddress] = useState(store?.address || '')
  const [storePhone, setStorePhone] = useState(store?.phone || '')
  const [storeCurrency, setStoreCurrency] = useState(store?.currencyCode || 'COP')
  const [storeSaving, setStoreSaving] = useState(false)

  // ── DIAN Resolution form state ──
  const [invoicePrefix, setInvoicePrefix] = useState(store?.invoicePrefix || 'FE')
  const [resolutionNumber, setResolutionNumber] = useState(store?.resolutionNumber || '')
  const [resolutionStartDate, setResolutionStartDate] = useState(
    store?.resolutionStartDate ? store.resolutionStartDate.split('T')[0] : ''
  )
  const [resolutionEndDate, setResolutionEndDate] = useState(
    store?.resolutionEndDate ? store.resolutionEndDate.split('T')[0] : ''
  )
  const [resolutionStartNumber, setResolutionStartNumber] = useState(
    store?.resolutionStartNumber?.toString() || ''
  )
  const [resolutionEndNumber, setResolutionEndNumber] = useState(
    store?.resolutionEndNumber?.toString() || ''
  )
  const [invoiceTestMode, setInvoiceTestMode] = useState(store?.invoiceTestMode ?? true)

  // ── User form state ──
  const [userFullName, setUserFullName] = useState(user?.fullName || '')
  const [userEmail, setUserEmail] = useState(user?.email || '')
  const [userCedula, setUserCedula] = useState(user?.cedula || '')
  const [userSaving, setUserSaving] = useState(false)

  // ── Tax rates state ──
  const [taxRates, setTaxRates] = useState<any[]>([])
  const [loadingTaxes, setLoadingTaxes] = useState(false)
  const [showTaxDialog, setShowTaxDialog] = useState(false)
  const [editingTax, setEditingTax] = useState<any>(null)
  const [savingTax, setSavingTax] = useState(false)
  const [deletingTaxId, setDeletingTaxId] = useState<number | null>(null)

  // ── Tax form state ──
  const [taxName, setTaxName] = useState('')
  const [taxCode, setTaxCode] = useState('01')
  const [taxRateType, setTaxRateType] = useState('PERCENTAGE')
  const [taxRateValue, setTaxRateValue] = useState(19)
  const [taxApplyTo, setTaxApplyTo] = useState('PRODUCT')
  const [taxCategory, setTaxCategory] = useState('SALES_TAX')
  const [taxIsDefault, setTaxIsDefault] = useState(false)
  const [taxIsActive, setTaxIsActive] = useState(true)
  const [taxDescription, setTaxDescription] = useState('')

  // ── Fetch tax rates ──
  const fetchTaxRates = useCallback(async () => {
    if (!store?.id) return
    setLoadingTaxes(true)
    try {
      const res = await fetch(`/api/taxes?storeId=${store.id}`)
      if (!res.ok) throw new Error('Error al cargar impuestos')
      const data = await res.json()
      setTaxRates(data)
    } catch {
      toast.error('Error al cargar las tarifas de impuesto')
    } finally {
      setLoadingTaxes(false)
    }
  }, [store?.id])

  useEffect(() => {
    fetchTaxRates()
  }, [fetchTaxRates])

  // ── Reset tax form ──
  function resetTaxForm() {
    setTaxName('')
    setTaxCode('01')
    setTaxRateType('PERCENTAGE')
    setTaxRateValue(19)
    setTaxApplyTo('PRODUCT')
    setTaxCategory('SALES_TAX')
    setTaxIsDefault(false)
    setTaxIsActive(true)
    setTaxDescription('')
    setEditingTax(null)
  }

  // ── Open dialog for creating ──
  function openCreateTaxDialog() {
    resetTaxForm()
    setShowTaxDialog(true)
  }

  // ── Open dialog for editing ──
  function openEditTaxDialog(tax: any) {
    setEditingTax(tax)
    setTaxName(tax.name)
    setTaxCode(tax.code)
    setTaxRateType(tax.rateType)
    setTaxRateValue(tax.rate)
    setTaxApplyTo(tax.applyTo)
    setTaxCategory(tax.category)
    setTaxIsDefault(tax.isDefault)
    setTaxIsActive(tax.isActive)
    setTaxDescription(tax.description || '')
    setShowTaxDialog(true)
  }

  // ── Save tax rate (create or update) ──
  async function handleSaveTax() {
    if (!store?.id || !taxName.trim()) {
      toast.error('El nombre del impuesto es obligatorio')
      return
    }
    setSavingTax(true)
    try {
      if (editingTax) {
        // Update
        const res = await fetch(`/api/taxes/${editingTax.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: taxName,
            code: taxCode,
            rateType: taxRateType,
            rate: taxRateValue,
            applyTo: taxApplyTo,
            category: taxCategory,
            isDefault: taxIsDefault,
            isActive: taxIsActive,
            description: taxDescription || null,
          }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Error al actualizar')
        }
        toast.success('Tarifa de impuesto actualizada')
      } else {
        // Create
        const res = await fetch('/api/taxes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId: store.id,
            name: taxName,
            code: taxCode,
            rateType: taxRateType,
            rate: taxRateValue,
            applyTo: taxApplyTo,
            category: taxCategory,
            isDefault: taxIsDefault,
            isActive: taxIsActive,
            description: taxDescription || null,
          }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || 'Error al crear')
        }
        toast.success('Tarifa de impuesto creada')
      }
      setShowTaxDialog(false)
      resetTaxForm()
      fetchTaxRates()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el impuesto')
    } finally {
      setSavingTax(false)
    }
  }

  // ── Toggle tax active ──
  async function handleToggleTaxActive(tax: any) {
    try {
      const res = await fetch(`/api/taxes/${tax.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !tax.isActive }),
      })
      if (!res.ok) throw new Error('Error al cambiar estado')
      toast.success(tax.isActive ? 'Impuesto desactivado' : 'Impuesto activado')
      fetchTaxRates()
    } catch {
      toast.error('Error al cambiar el estado del impuesto')
    }
  }

  // ── Delete tax rate ──
  async function handleDeleteTax(id: number) {
    try {
      const res = await fetch(`/api/taxes/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al eliminar')
      }
      toast.success('Tarifa de impuesto eliminada')
      setDeletingTaxId(null)
      fetchTaxRates()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar el impuesto')
      setDeletingTaxId(null)
    }
  }

  // ── Save store ──
  async function handleSaveStore() {
    if (!store?.id) return
    setStoreSaving(true)
    try {
      const res = await fetch(`/api/stores?storeId=${store.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: storeName,
          legalName: storeLegalName || null,
          nit: storeNIT || null,
          address: storeAddress || null,
          phone: storePhone || null,
          currencyCode: storeCurrency,
        }),
      })
      if (!res.ok) throw new Error('Error al guardar')
      const data = await res.json()
      updateStore(data)
      toast.success('Datos del negocio actualizados')
    } catch {
      toast.error('Error al guardar los datos del negocio')
    } finally {
      setStoreSaving(false)
    }
  }

  // ── Save DIAN resolution ──
  async function handleSaveDianResolution() {
    if (!store?.id) return
    setStoreSaving(true)
    try {
      const res = await fetch(`/api/stores?storeId=${store.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoicePrefix: invoicePrefix || null,
          resolutionNumber: resolutionNumber || null,
          resolutionStartDate: resolutionStartDate || null,
          resolutionEndDate: resolutionEndDate || null,
          resolutionStartNumber: resolutionStartNumber ? parseInt(resolutionStartNumber) : null,
          resolutionEndNumber: resolutionEndNumber ? parseInt(resolutionEndNumber) : null,
          invoiceTestMode,
        }),
      })
      if (!res.ok) throw new Error('Error al guardar')
      const data = await res.json()
      updateStore(data)
      toast.success('Resolución DIAN guardada correctamente')
    } catch {
      toast.error('Error al guardar la resolución DIAN')
    } finally {
      setStoreSaving(false)
    }
  }

  // ── Save user ──
  async function handleSaveUser() {
    if (!user?.id) return
    setUserSaving(true)
    try {
      const res = await fetch(`/api/users?userId=${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: userFullName,
          email: userEmail || null,
          cedula: userCedula || null,
        }),
      })
      if (!res.ok) throw new Error('Error al guardar')
      const data = await res.json()
      updateUser(data)
      toast.success('Datos personales actualizados')
    } catch {
      toast.error('Error al guardar datos personales')
    } finally {
      setUserSaving(false)
    }
  }

  const hasStoreChanges =
    storeName !== (store?.name || '') ||
    storeLegalName !== (store?.legalName || '') ||
    storeNIT !== (store?.nit || '') ||
    storeAddress !== (store?.address || '') ||
    storePhone !== (store?.phone || '') ||
    storeCurrency !== (store?.currencyCode || 'COP')

  const hasUserChanges =
    userFullName !== (user?.fullName || '') ||
    userEmail !== (user?.email || '') ||
    userCedula !== (user?.cedula || '')

  const hasDianChanges =
    invoicePrefix !== (store?.invoicePrefix || 'FE') ||
    resolutionNumber !== (store?.resolutionNumber || '') ||
    resolutionStartDate !== (store?.resolutionStartDate ? store.resolutionStartDate.split('T')[0] : '') ||
    resolutionEndDate !== (store?.resolutionEndDate ? store.resolutionEndDate.split('T')[0] : '') ||
    resolutionStartNumber !== (store?.resolutionStartNumber?.toString() || '') ||
    resolutionEndNumber !== (store?.resolutionEndNumber?.toString() || '') ||
    invoiceTestMode !== (store?.invoiceTestMode ?? true)

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Store className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Configuración</h2>
          <p className="text-sm text-muted-foreground">Administra tu negocio y preferencias</p>
        </div>
      </div>

      <Tabs defaultValue="business" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="business" className="gap-2">
            <Building2 className="h-4 w-4" />
            <span className="text-xs">Negocio</span>
          </TabsTrigger>
          <TabsTrigger value="personal" className="gap-2">
            <User className="h-4 w-4" />
            <span className="text-xs">Personal</span>
          </TabsTrigger>
          <TabsTrigger value="invoice" className="gap-2">
            <Receipt className="h-4 w-4" />
            <span className="text-xs">Facturación</span>
          </TabsTrigger>
          <TabsTrigger value="taxes" className="gap-2">
            <Percent className="h-4 w-4" />
            <span className="text-xs">IVA</span>
          </TabsTrigger>
        </TabsList>

        {/* ═══ TAB: NEGOCIO ═══ */}
        <TabsContent value="business" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Información del Negocio
              </CardTitle>
              <CardDescription>
                Datos que se muestran en la aplicación y en los tickets de venta
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="store-name">
                  Nombre del Negocio <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="store-name"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="pl-9"
                    placeholder="Ej: Bar La Terraza"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="store-address">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    Dirección
                  </span>
                </Label>
                <Input
                  id="store-address"
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  placeholder="Ej: Cra 15 #82-34, Bogotá"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="store-phone">
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    Teléfono del Negocio
                  </span>
                </Label>
                <Input
                  id="store-phone"
                  value={storePhone}
                  onChange={(e) => setStorePhone(e.target.value)}
                  placeholder="Ej: 601-3456789"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="store-currency">
                  <span className="flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5" />
                    Moneda
                  </span>
                </Label>
                <select
                  id="store-currency"
                  value={storeCurrency}
                  onChange={(e) => setStoreCurrency(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="COP">COP - Peso Colombiano</option>
                  <option value="MXN">MXN - Peso Mexicano</option>
                  <option value="USD">USD - Dólar Americano</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="ARS">ARS - Peso Argentino</option>
                  <option value="PEN">PEN - Sol Peruano</option>
                  <option value="CLP">CLP - Peso Chileno</option>
                  <option value="VEB">VEB - Bolívar</option>
                  <option value="BRL">BRL - Real Brasileño</option>
                </select>
              </div>

              <Button
                onClick={handleSaveStore}
                disabled={storeSaving || !hasStoreChanges || !storeName.trim()}
                className="w-full gap-2"
              >
                {storeSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar Cambios
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: PERSONAL ═══ */}
        <TabsContent value="personal" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" />
                Datos Personales
              </CardTitle>
              <CardDescription>
                Tu información como administrador del negocio
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border p-3 bg-muted/30 mb-2">
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Teléfono:</span>
                  <span className="font-medium">{user?.phone}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="user-fullname">
                  Nombre Completo <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="user-fullname"
                  value={userFullName}
                  onChange={(e) => setUserFullName(e.target.value)}
                  placeholder="Ej: Juan Pérez"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="user-email">Correo Electrónico</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="Ej: juan@email.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="user-cedula">
                  <span className="flex items-center gap-1.5">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Cédula / Identificación
                  </span>
                </Label>
                <Input
                  id="user-cedula"
                  value={userCedula}
                  onChange={(e) => setUserCedula(e.target.value)}
                  placeholder="Ej: 1098765432"
                />
                <p className="text-xs text-muted-foreground">
                  Número de documento de identidad del propietario o responsable
                </p>
              </div>

              <Separator />

              <div className="rounded-lg border p-3 bg-muted/30">
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Rol:</span>
                  <span className="font-medium">{user?.role === 'OWNER' ? 'Propietario' : 'Empleado'}</span>
                </div>
              </div>

              <Button
                onClick={handleSaveUser}
                disabled={userSaving || !hasUserChanges || !userFullName.trim()}
                className="w-full gap-2"
              >
                {userSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar Cambios
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: FACTURACIÓN ═══ */}
        <TabsContent value="invoice" className="space-y-6">
          {/* Sección 1: Datos Tributarios del Negocio */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Datos Tributarios del Negocio
              </CardTitle>
              <CardDescription>
                Información fiscal que aparece en las facturas y tickets impresos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="legal-name">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" />
                    Razón Social / Nombre Legal
                  </span>
                </Label>
                <Input
                  id="legal-name"
                  value={storeLegalName}
                  onChange={(e) => setStoreLegalName(e.target.value)}
                  placeholder="Ej: Terraza S.A.S."
                />
                <p className="text-xs text-muted-foreground">
                  Nombre legal del negocio registrado (diferente al nombre comercial si aplica)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="store-nit">
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    NIT
                  </span>
                </Label>
                <Input
                  id="store-nit"
                  value={storeNIT}
                  onChange={(e) => setStoreNIT(e.target.value)}
                  placeholder="Ej: 900.123.456-7"
                />
                <p className="text-xs text-muted-foreground">
                  Número de Identificación Tributaria para facturación
                </p>
              </div>

              <Separator />

              {/* Preview del encabezado */}
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  Vista previa del encabezado de factura
                </p>
                <div className="border-2 border-dashed rounded-lg p-4 bg-muted/20 font-mono text-xs space-y-1">
                  <div className="text-center">
                    <p className="font-bold text-sm uppercase tracking-wider">
                      {storeName || 'Nombre del Negocio'}
                    </p>
                    {storeLegalName && (
                      <p className="text-[10px] text-muted-foreground">{storeLegalName}</p>
                    )}
                  </div>
                  {storeNIT && <p className="text-center">NIT: {storeNIT}</p>}
                  {storeAddress && <p className="text-center">{storeAddress}</p>}
                  {storePhone && <p className="text-center">Tel: {storePhone}</p>}
                  {!storeNIT && !storeAddress && !storePhone && (
                    <p className="text-center text-muted-foreground italic">
                      Configura los datos de facturación para ver la vista previa
                    </p>
                  )}
                </div>
              </div>

              <Button
                onClick={handleSaveStore}
                disabled={storeSaving || !hasStoreChanges}
                className="w-full gap-2"
              >
                {storeSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar Datos Tributarios
              </Button>
            </CardContent>
          </Card>

          {/* Sección 2: Resolución DIAN (Facturación Electrónica) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Resolución DIAN
              </CardTitle>
              <CardDescription>
                Configuración de numeración para facturación electrónica
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Test Mode Warning */}
              {invoiceTestMode && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Modo de pruebas (habilitación) activado. Las facturas generadas no se enviarán a la DIAN.
                </div>
              )}

              {/* Test Mode Toggle */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Modo de Pruebas</Label>
                  <p className="text-xs text-muted-foreground">
                    Activar para habilitación con la DIAN. Debes probar antes de ir a producción.
                  </p>
                </div>
                <Switch
                  checked={invoiceTestMode}
                  onCheckedChange={setInvoiceTestMode}
                />
              </div>

              <Separator />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="resolution-number">
                    Número de Resolución
                  </Label>
                  <Input
                    id="resolution-number"
                    value={resolutionNumber}
                    onChange={(e) => setResolutionNumber(e.target.value)}
                    placeholder="18764"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invoice-prefix">
                    Prefijo
                  </Label>
                  <Input
                    id="invoice-prefix"
                    value={invoicePrefix}
                    onChange={(e) => setInvoicePrefix(e.target.value)}
                    placeholder="FE"
                    maxLength={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    Máximo 4 caracteres (ej: FE, POS)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="resolution-start-date">
                    Fecha Inicio
                  </Label>
                  <Input
                    id="resolution-start-date"
                    type="date"
                    value={resolutionStartDate}
                    onChange={(e) => setResolutionStartDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="resolution-end-date">
                    Fecha Fin
                  </Label>
                  <Input
                    id="resolution-end-date"
                    type="date"
                    value={resolutionEndDate}
                    onChange={(e) => setResolutionEndDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="resolution-start-number">
                    Consecutivo Inicial
                  </Label>
                  <Input
                    id="resolution-start-number"
                    type="number"
                    value={resolutionStartNumber}
                    onChange={(e) => setResolutionStartNumber(e.target.value)}
                    placeholder="1"
                    min={0}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="resolution-end-number">
                    Consecutivo Final
                  </Label>
                  <Input
                    id="resolution-end-number"
                    type="number"
                    value={resolutionEndNumber}
                    onChange={(e) => setResolutionEndNumber(e.target.value)}
                    placeholder="10000"
                    min={0}
                  />
                </div>
              </div>

              {/* Info note */}
              <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                    <div className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                      <p className="font-medium">Preparación para Facturación Electrónica DIAN</p>
                      <p>
                        Estas configuraciones preparan tu negocio para la facturación electrónica.
                        Los datos de la resolución son los que te otorga la DIAN al habilitarte
                        como facturador electrónico.
                      </p>
                      <p>
                        Mantén el modo de pruebas activado hasta que la DIAN valide tu entorno.
                        Una vez en producción, las facturas se enviarán automáticamente.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Button
                onClick={handleSaveDianResolution}
                disabled={storeSaving || !hasDianChanges}
                className="w-full gap-2"
              >
                {storeSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar Resolución DIAN
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: IMPUESTOS ═══ */}
        <TabsContent value="taxes" className="space-y-6">
          {/* Info Box */}
          <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                  <p className="font-medium">Configuración de Impuestos - DIAN Colombia</p>
                  <p>En Colombia, los precios al público incluyen IVA. Este sistema calcula automáticamente el desglose tributario para cada venta.</p>
                  <p>Asigna un impuesto a cada producto en el módulo de Productos. El impuesto por defecto se aplica a productos nuevos.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Header with Add button */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Tarifas de Impuesto</h3>
              <p className="text-xs text-muted-foreground">
                {taxRates.length} tarifa{taxRates.length !== 1 ? 's' : ''} configurada{taxRates.length !== 1 ? 's' : ''}
              </p>
            </div>
            <Button onClick={openCreateTaxDialog} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Nuevo Impuesto
            </Button>
          </div>

          {/* Tax Rate Cards */}
          {loadingTaxes ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : taxRates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Percent className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">
                  No hay tarifas de impuesto configuradas
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Crea tu primera tarifa para comenzar a clasificar tus productos.
                </p>
                <Button
                  onClick={openCreateTaxDialog}
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Crear Tarifa
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {taxRates.map((tax) => (
                <Card
                  key={tax.id}
                  className={!tax.isActive ? 'opacity-60' : ''}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      {/* Left: Tax info */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-medium text-sm truncate">{tax.name}</h4>
                          {tax.isDefault && (
                            <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0">
                              <Star className="h-2.5 w-2.5 fill-current" />
                              Por defecto
                            </Badge>
                          )}
                          {!tax.isActive && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                              Inactivo
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* DIAN Code Badge */}
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                            DIAN {tax.code}
                          </Badge>
                          {/* Category Badge */}
                          <Badge className={`text-[10px] px-1.5 py-0 border-0 ${CATEGORY_COLORS[tax.category] || ''}`}>
                            {CATEGORY_LABELS[tax.category] || tax.category}
                          </Badge>
                          {/* Apply To Badge */}
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {APPLY_TO_LABELS[tax.applyTo] || tax.applyTo}
                          </Badge>
                        </div>

                        {/* Rate display */}
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-bold">
                            {tax.rateType === 'PERCENTAGE' ? `${tax.rate}%` : `$${tax.rate.toLocaleString('es-CO')}`}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({tax.rateType === 'PERCENTAGE' ? 'Porcentaje' : 'Valor fijo'})
                          </span>
                        </div>

                        {tax.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">{tax.description}</p>
                        )}

                        {tax._count?.products > 0 && (
                          <p className="text-[10px] text-muted-foreground">
                            Asignado a {tax._count.products} producto{tax._count.products !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEditTaxDialog(tax)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog open={deletingTaxId === tax.id} onOpenChange={(open) => !open && setDeletingTaxId(null)}>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => setDeletingTaxId(tax.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Eliminar Tarifa de Impuesto</AlertDialogTitle>
                                <AlertDialogDescription>
                                  ¿Estás seguro de que deseas eliminar &quot;{tax.name}&quot;? Esta acción no se puede deshacer.
                                  {tax._count?.products > 0 && (
                                    <span className="block mt-2 font-medium text-destructive">
                                      ⚠️ Esta tarifa está asignada a {tax._count.products} producto(s).
                                    </span>
                                  )}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setDeletingTaxId(null)}>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteTax(tax.id)}
                                  className="bg-destructive text-white hover:bg-destructive/90"
                                >
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1.5 text-xs px-2"
                          onClick={() => handleToggleTaxActive(tax)}
                        >
                          {tax.isActive ? (
                            <>
                              <ToggleRight className="h-3.5 w-3.5 text-green-500" />
                              <span className="text-green-600">Activo</span>
                            </>
                          ) : (
                            <>
                              <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-muted-foreground">Inactivo</span>
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* ── Tax Create/Edit Dialog ── */}
          <Dialog open={showTaxDialog} onOpenChange={(open) => { setShowTaxDialog(open); if (!open) resetTaxForm() }}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingTax ? 'Editar Tarifa de Impuesto' : 'Nueva Tarifa de Impuesto'}
                </DialogTitle>
                <DialogDescription>
                  {editingTax
                    ? 'Modifica los datos de la tarifa de impuesto.'
                    : 'Configura una nueva tarifa de impuesto para tu negocio.'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Name */}
                <div className="space-y-2">
                  <Label htmlFor="tax-name">
                    Nombre <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="tax-name"
                    value={taxName}
                    onChange={(e) => setTaxName(e.target.value)}
                    placeholder="Ej: IVA 19%"
                  />
                </div>

                {/* Code */}
                <div className="space-y-2">
                  <Label htmlFor="tax-code">
                    Código DIAN <span className="text-destructive">*</span>
                  </Label>
                  <Select value={taxCode} onValueChange={setTaxCode}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecciona código DIAN" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DIAN_CODES).map(([code, label]) => (
                        <SelectItem key={code} value={code}>
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-xs bg-muted px-1 rounded">{code}</span>
                            <span>{label}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Rate Type + Rate */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="tax-rate-type">Tipo de Tasa</Label>
                    <Select value={taxRateType} onValueChange={setTaxRateType}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PERCENTAGE">Porcentaje (%)</SelectItem>
                        <SelectItem value="FIXED_AMOUNT">Valor Fijo ($)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax-rate-value">
                      Tasa <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="tax-rate-value"
                      type="number"
                      value={taxRateValue}
                      onChange={(e) => setTaxRateValue(Number(e.target.value))}
                      placeholder={taxRateType === 'PERCENTAGE' ? '19' : '800'}
                      min={0}
                    />
                  </div>
                </div>

                {/* Apply To */}
                <div className="space-y-2">
                  <Label>Aplica A</Label>
                  <Select value={taxApplyTo} onValueChange={setTaxApplyTo}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PRODUCT">Producto</SelectItem>
                      <SelectItem value="SERVICE">Servicio</SelectItem>
                      <SelectItem value="BOTH">Ambos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Category */}
                <div className="space-y-2">
                  <Label>Categoría</Label>
                  <Select value={taxCategory} onValueChange={setTaxCategory}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          <span className="flex items-center gap-2">
                            <span className={`inline-block w-2 h-2 rounded-full ${
                              key === 'SALES_TAX' ? 'bg-blue-500' :
                              key === 'CONSUMPTION_TAX' ? 'bg-amber-500' :
                              key === 'WITHHOLDING' ? 'bg-purple-500' :
                              'bg-teal-500'
                            }`} />
                            {label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="tax-description">Descripción (opcional)</Label>
                  <Textarea
                    id="tax-description"
                    value={taxDescription}
                    onChange={(e) => setTaxDescription(e.target.value)}
                    placeholder="Nota o descripción adicional..."
                    rows={2}
                  />
                </div>

                <Separator />

                {/* Checkboxes */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="tax-is-default"
                      checked={taxIsDefault}
                      onCheckedChange={(checked) => setTaxIsDefault(checked === true)}
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor="tax-is-default" className="text-sm font-medium cursor-pointer">
                        Impuesto por defecto
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Se asigna automáticamente a productos nuevos
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="tax-is-active"
                      checked={taxIsActive}
                      onCheckedChange={(checked) => setTaxIsActive(checked === true)}
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor="tax-is-active" className="text-sm font-medium cursor-pointer">
                        Activo
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Los impuestos inactivos no se mostrarán en la selección
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => { setShowTaxDialog(false); resetTaxForm() }}
                  disabled={savingTax}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSaveTax}
                  disabled={savingTax || !taxName.trim()}
                  className="gap-2"
                >
                  {savingTax ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editingTax ? 'Actualizar' : 'Crear'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  )
}
