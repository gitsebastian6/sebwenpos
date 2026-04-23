'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Loader2, Save, Building2, MapPin, FileText, Receipt, Info, ShieldCheck, AlertTriangle } from 'lucide-react'
import { EInvoicingConfig } from '@/components/settings/e-invoicing-config'

export function InvoiceSettingsTab() {
  const { store, updateStore } = useAuthStore()

  // ── Tax data form state ──
  const [storeLegalName, setStoreLegalName] = useState(store?.legalName || '')
  const [storeNIT, setStoreNIT] = useState(store?.nit || '')
  const [savingTaxData, setSavingTaxData] = useState(false)

  // ── DIVIPOLA location state ──
  const [divipolaCode, setDivipolaCode] = useState(store?.divipolaCode || '')
  const [cityName, setCityName] = useState(store?.cityName || '')
  const [divipolaSaving, setDivipolaSaving] = useState(false)

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
  const [savingResolution, setSavingResolution] = useState(false)

  const hasTaxDataChanges =
    storeLegalName !== (store?.legalName || '') ||
    storeNIT !== (store?.nit || '')

  const hasDivipolaChanges =
    divipolaCode !== (store?.divipolaCode || '') ||
    cityName !== (store?.cityName || '')

  const divipolaCodeValid = !divipolaCode || /^\d{5}$/.test(divipolaCode)

  const hasDianChanges =
    invoicePrefix !== (store?.invoicePrefix || 'FE') ||
    resolutionNumber !== (store?.resolutionNumber || '') ||
    resolutionStartDate !== (store?.resolutionStartDate ? store.resolutionStartDate.split('T')[0] : '') ||
    resolutionEndDate !== (store?.resolutionEndDate ? store.resolutionEndDate.split('T')[0] : '') ||
    resolutionStartNumber !== (store?.resolutionStartNumber?.toString() || '') ||
    resolutionEndNumber !== (store?.resolutionEndNumber?.toString() || '') ||
    invoiceTestMode !== (store?.invoiceTestMode ?? true)

  // ── Save tax data ──
  async function handleSaveTaxData() {
    if (!store?.id) return
    setSavingTaxData(true)
    try {
      const res = await fetch(`/api/stores?storeId=${store.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: store?.name,
          legalName: storeLegalName || null,
          nit: storeNIT || null,
          address: store?.address || null,
          phone: store?.phone || null,
          currencyCode: store?.currencyCode,
        }),
      })
      if (!res.ok) throw new Error('Error al guardar')
      const data = await res.json()
      updateStore(data)
      toast.success('Datos Tributarios guardados correctamente')
    } catch {
      toast.error('Error al guardar los datos tributarios')
    } finally {
      setSavingTaxData(false)
    }
  }

  // ── Save DIVIPOLA location ──
  async function handleSaveDivipola() {
    if (!store?.id) return
    if (divipolaCode && !/^\d{5}$/.test(divipolaCode)) {
      toast.error('El código DIVIPOLA debe ser exactamente 5 dígitos numéricos (ej: 11001)')
      return
    }
    setDivipolaSaving(true)
    try {
      const res = await fetch(`/api/stores?storeId=${store.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          divipolaCode: divipolaCode || null,
          cityName: cityName || null,
        }),
      })
      if (!res.ok) throw new Error('Error al guardar')
      const data = await res.json()
      updateStore(data)
      toast.success('Ubicación DIVIPOLA guardada correctamente')
    } catch {
      toast.error('Error al guardar la ubicación DIVIPOLA')
    } finally {
      setDivipolaSaving(false)
    }
  }

  // ── Save DIAN resolution ──
  async function handleSaveDianResolution() {
    if (!store?.id) return
    setSavingResolution(true)
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
      setSavingResolution(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* ═══ Configuración Híbrida de Facturación Electrónica ═══ */}
      <EInvoicingConfig />
      <Separator className="my-2" />

      {/* Sección 1: Datos Tributarios del Negocio */}
      <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
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
              className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
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
              className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
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
                  {store?.name || 'Nombre del Negocio'}
                </p>
                {storeLegalName && (
                  <p className="text-[10px] text-muted-foreground">{storeLegalName}</p>
                )}
              </div>
              {storeNIT && <p className="text-center">NIT: {storeNIT}</p>}
              {store?.address && <p className="text-center">{store.address}</p>}
              {store?.phone && <p className="text-center">Tel: {store.phone}</p>}
              {!storeNIT && !store?.address && !store?.phone && (
                <p className="text-center text-muted-foreground italic">
                  Configura los datos de facturación para ver la vista previa
                </p>
              )}
            </div>
          </div>

          <Button
            onClick={handleSaveTaxData}
            disabled={savingTaxData || !hasTaxDataChanges}
            className="w-full gap-2 active:scale-[0.98] transition-all"
          >
            {savingTaxData ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar Datos Tributarios
          </Button>
        </CardContent>
      </Card>

      {/* Sección 1.5: Ubicación del Negocio (DIVIPOLA) */}
      <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Ubicación del Negocio (DIVIPOLA)
          </CardTitle>
          <CardDescription>
            Código de municipio según división político-administrativa de Colombia. Necesario para facturación electrónica.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="divipola-code">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  Código DIVIPOLA
                </span>
              </Label>
              <Input
                id="divipola-code"
                value={divipolaCode}
                onChange={(e) => setDivipolaCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="Ej: 11001"
                maxLength={5}
                className={`focus-visible:ring-primary/20 focus-visible:border-primary/40 ${!divipolaCodeValid ? 'border-destructive focus-visible:ring-destructive/20 focus-visible:border-destructive/40' : ''}`}
              />
              <p className="text-xs text-muted-foreground">
                Código de 5 dígitos del municipio (ej: 11001 Bogotá, 05001 Medellín, 76001 Cali)
              </p>
              {divipolaCode && !divipolaCodeValid && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  El código debe ser exactamente 5 dígitos numéricos
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="city-name">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  Nombre del Municipio
                </span>
              </Label>
              <Input
                id="city-name"
                value={cityName}
                onChange={(e) => setCityName(e.target.value)}
                placeholder="Ej: Bogotá D.C."
                className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
              />
              <p className="text-xs text-muted-foreground">
                Nombre del municipio/ciudad que aparece en las facturas electrónicas
              </p>
            </div>
          </div>

          <Separator />

          {/* Info box explaining DIVIPOLA */}
          <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20">
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                <div className="text-xs text-emerald-800 dark:text-emerald-200 space-y-1">
                  <p className="font-medium">¿Qué es DIVIPOLA?</p>
                  <p>
                    DIVIPOLA es el código estándar de la DIAN (Dirección de Impuestos y Aduanas Nacionales)
                    que identifica cada municipio y departamento de Colombia. Este código es obligatorio en
                    la generación de XML para facturas electrónicas (UBL 2.1).
                  </p>
                  <p>
                    Si no lo configuras, el sistema usará <span className="font-mono font-medium">11001</span> (Bogotá D.C.)
                    por defecto. Verifica tu código en el sitio oficial del DANE o consulta con tu contador.
                  </p>
                  <p className="font-medium mt-1">Ejemplos comunes:</p>
                  <div className="grid grid-cols-2 gap-1 mt-1 font-mono">
                    <span>11001 — Bogotá D.C.</span>
                    <span>05001 — Medellín</span>
                    <span>76001 — Cali</span>
                    <span>08001 — Barranquilla</span>
                    <span>54001 — Bucaramanga</span>
                    <span>63001 — Pereira</span>
                    <span>68001 — Manizales</span>
                    <span>73001 — Ibagué</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={handleSaveDivipola}
            disabled={divipolaSaving || !hasDivipolaChanges || !divipolaCodeValid}
            className="w-full gap-2 active:scale-[0.98] transition-all"
          >
            {divipolaSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar Ubicación
          </Button>
        </CardContent>
      </Card>

      {/* Sección 2: Resolución DIAN (Facturación Electrónica) */}
      <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
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
          <div className="flex items-center justify-between rounded-lg border border-border/50 p-3 hover:border-primary/20 transition-colors">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Modo de Pruebas</Label>
              <p className="text-xs text-muted-foreground">
                Activar para habilitación con la DIAN. Debes probar antes de ir a producción.
              </p>
            </div>
            <Switch
              checked={invoiceTestMode}
              onCheckedChange={setInvoiceTestMode}
              className="data-[state=checked]:bg-primary"
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
                className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
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
                className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
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
                className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
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
                className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
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
                className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
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
                className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
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
            disabled={savingResolution || !hasDianChanges}
            className="w-full gap-2 active:scale-[0.98] transition-all"
          >
            {savingResolution ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar Resolución DIAN
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
