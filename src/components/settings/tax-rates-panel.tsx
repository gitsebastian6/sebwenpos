'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { useTaxes, useCreateTax, useUpdateTax, useDeleteTax } from '@/hooks/api/use-taxes'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
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
import { Loader2, Plus, Pencil, Trash2, Star, Percent, Info, ToggleLeft, ToggleRight, AlertTriangle } from 'lucide-react'
import { TaxRate } from '@/types'

// ── Constants ──

export const DIAN_CODES: Record<string, string> = {
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

export const CATEGORY_LABELS: Record<string, string> = {
  SALES_TAX: 'Impuesto de Venta',
  CONSUMPTION_TAX: 'Impoconsumo',
  WITHHOLDING: 'Retención',
  MUNICIPAL: 'Municipal',
}

export const CATEGORY_COLORS: Record<string, string> = {
  SALES_TAX: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  CONSUMPTION_TAX: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  WITHHOLDING: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  MUNICIPAL: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
}

export const APPLY_TO_LABELS: Record<string, string> = {
  PRODUCT: 'Producto',
  SERVICE: 'Servicio',
  BOTH: 'Ambos',
}

export function TaxRatesPanel() {
  const { store } = useAuthStore()
  const [showTaxDialog, setShowTaxDialog] = useState(false)
  const [editingTax, setEditingTax] = useState<TaxRate | null>(null)
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

  // ── Query hooks ──
  const { data: taxRates = [], isLoading: loadingTaxes } = useTaxes(store?.id)

  // ── Mutation hooks ──
  const createTax = useCreateTax()
  const updateTax = useUpdateTax()
  const deleteTax = useDeleteTax()
  const savingTax = createTax.isPending || updateTax.isPending || deleteTax.isPending

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
  function openEditTaxDialog(tax: TaxRate) {
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
    try {
      if (editingTax) {
        // Update
        await updateTax.mutateAsync({
          id: editingTax.id,
          body: {
            name: taxName,
            code: taxCode,
            rateType: taxRateType,
            rate: taxRateValue,
            applyTo: taxApplyTo,
            category: taxCategory,
            isDefault: taxIsDefault,
            isActive: taxIsActive,
            description: taxDescription || null,
          },
        })
        toast.success('Tarifa de impuesto actualizada')
      } else {
        // Create
        await createTax.mutateAsync({
          body: {
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
          },
        })
        toast.success('Tarifa de impuesto creada')
      }
      setShowTaxDialog(false)
      resetTaxForm()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el impuesto')
    }
  }

  // ── Toggle tax active ──
  async function handleToggleTaxActive(tax: TaxRate) {
    try {
      await updateTax.mutateAsync({
        id: tax.id,
        body: { isActive: !tax.isActive },
      })
      toast.success(tax.isActive ? 'Impuesto desactivado' : 'Impuesto activado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cambiar el estado del impuesto')
    }
  }

  // ── Delete tax rate ──
  async function handleDeleteTax(id: number) {
    try {
      await deleteTax.mutateAsync({ id })
      toast.success('Tarifa de impuesto eliminada')
      setDeletingTaxId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar el impuesto')
      setDeletingTaxId(null)
    }
  }

  return (
    <div className="space-y-6">
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
        <Button onClick={openCreateTaxDialog} size="sm" className="gap-1.5 active:scale-[0.98] transition-all">
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
            <Percent className="h-14 w-14 mx-auto text-muted-foreground/30 mb-3 animate-pulse" />
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
              className={`${!tax.isActive ? 'opacity-60' : ''} border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl`}
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
                        className="h-7 w-7 active:scale-[0.95] transition-all"
                        onClick={() => openEditTaxDialog(tax)}
                        aria-label="Editar impuesto"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog open={deletingTaxId === tax.id} onOpenChange={(open) => !open && setDeletingTaxId(null)}>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive active:scale-[0.95] transition-all"
                            onClick={() => setDeletingTaxId(tax.id)}
                            aria-label="Eliminar impuesto"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-xl backdrop-blur-sm">
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
                              className="bg-destructive text-white hover:bg-destructive/90 active:scale-[0.98] transition-all"
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
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-xl backdrop-blur-sm">
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
                className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
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
                  className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
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
              className="active:scale-[0.98] transition-all"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveTax}
              disabled={savingTax || !taxName.trim()}
              className="gap-1.5 active:scale-[0.98] transition-all"
            >
              {savingTax ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</>
              ) : (
                'Guardar Impuesto'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
