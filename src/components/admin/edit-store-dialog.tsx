'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Store as StoreIcon, User, Hash, Calendar, RefreshCw } from 'lucide-react'
import { useUpdateAdminStore } from '@/hooks/api/use-admin-panel'
import type { Store, EditStoreForm } from './admin-panel-helpers'
import { planBadgeVariant, planLabel, PlanStatusBadge } from './admin-panel-helpers'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function EditStoreDialog({
  store,
  open,
  onOpenChange,
  onSaved,
}: {
  store: Store | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<EditStoreForm>({
    storeName: store?.name || '',
    nit: store?.nit || '',
    legalName: store?.legalName || '',
    city: store?.city || '',
    address: store?.address || '',
    plan: store?.plan || 'TRIAL',
    ownerFullName: store?.owner.fullName || '',
    ownerPhone: store?.owner.phone || '',
    ownerEmail: store?.owner.email || '',
  })
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  const updateStore = useUpdateAdminStore()

  const validate = (): boolean => {
    const newErrors: Partial<Record<string, string>> = {}
    if (!form.storeName.trim()) newErrors.storeName = 'Nombre de tienda requerido'
    if (!form.ownerFullName.trim()) newErrors.ownerFullName = 'Nombre del propietario requerido'
    if (form.ownerPhone.length < 7) newErrors.ownerPhone = 'Teléfono inválido'
    if (form.ownerEmail && !form.ownerEmail.includes('@'))
      newErrors.ownerEmail = 'Email inválido'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (!store) return
    if (!validate()) return
    updateStore.mutate(
      {
        storeId: store.id,
        body: {
          storeName: form.storeName,
          nit: form.nit || null,
          legalName: form.legalName || null,
          city: form.city || null,
          address: form.address || null,
          plan: form.plan,
          ownerFullName: form.ownerFullName,
          ownerPhone: form.ownerPhone,
          ownerEmail: form.ownerEmail || null,
        },
      },
      {
        onSuccess: () => {
          toast.success(`Tienda "${form.storeName}" actualizada exitosamente`)
          onOpenChange(false)
          onSaved()
        },
        onError: (e) => {
          toast.error(e.message)
        },
      }
    )
  }

  const updateField = (field: keyof EditStoreForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="size-5" /> Editar Tienda
          </DialogTitle>
          <DialogDescription>
            Modifique la información de la tienda y su propietario.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Store Info */}
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <StoreIcon className="size-4" /> Información de la Tienda
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-storeName">Nombre de la Tienda *</Label>
                <Input
                  id="edit-storeName"
                  value={form.storeName}
                  onChange={(e) => updateField('storeName', e.target.value)}
                  aria-invalid={!!errors.storeName}
                />
                {errors.storeName && (
                  <p className="text-xs text-destructive">{errors.storeName}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-nit">NIT</Label>
                <Input
                  id="edit-nit"
                  placeholder="Ej: 900123456-7"
                  value={form.nit}
                  onChange={(e) => updateField('nit', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-legalName">Razón Social</Label>
                <Input
                  id="edit-legalName"
                  placeholder="Ej: El Buen Sabor SAS"
                  value={form.legalName}
                  onChange={(e) => updateField('legalName', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-city">Ciudad</Label>
                <Input
                  id="edit-city"
                  placeholder="Ej: Bogotá"
                  value={form.city}
                  onChange={(e) => updateField('city', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-address">Dirección</Label>
                <Input
                  id="edit-address"
                  placeholder="Ej: Calle 10 #5-30"
                  value={form.address}
                  onChange={(e) => updateField('address', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Plan</Label>
                <Select
                  value={form.plan}
                  onValueChange={(v) => updateField('plan', v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seleccionar plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRIAL">Prueba (Trial)</SelectItem>
                    <SelectItem value="BASIC">Básico</SelectItem>
                    <SelectItem value="PRO">Pro</SelectItem>
                    <SelectItem value="ENTERPRISE">Empresa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Plan Status Info */}
            {store && (
              <div className="mt-3 rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant={planBadgeVariant(store.plan)} className="text-xs">
                    {planLabel(store.plan)}
                  </Badge>
                  <PlanStatusBadge store={store} />
                </div>
                {store.planStartDate && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="size-3" />
                    <span>Inicio: {new Date(store.planStartDate).toLocaleDateString('es-CO')}</span>
                  </div>
                )}
                {store.planExpiresAt && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="size-3" />
                    <span>Vence: {new Date(store.planExpiresAt).toLocaleDateString('es-CO')}</span>
                  </div>
                )}
                {!store.planExpiresAt && store.plan && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                    <span>Plan sin fecha de expiración</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Owner Info */}
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <User className="size-4" /> Información del Propietario
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-ownerFullName">Nombre Completo *</Label>
                <Input
                  id="edit-ownerFullName"
                  value={form.ownerFullName}
                  onChange={(e) => updateField('ownerFullName', e.target.value)}
                  aria-invalid={!!errors.ownerFullName}
                />
                {errors.ownerFullName && (
                  <p className="text-xs text-destructive">{errors.ownerFullName}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-ownerPhone">Teléfono *</Label>
                <Input
                  id="edit-ownerPhone"
                  value={form.ownerPhone}
                  onChange={(e) => updateField('ownerPhone', e.target.value)}
                  aria-invalid={!!errors.ownerPhone}
                />
                {errors.ownerPhone && (
                  <p className="text-xs text-destructive">{errors.ownerPhone}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-ownerEmail">Email</Label>
                <Input
                  id="edit-ownerEmail"
                  type="email"
                  value={form.ownerEmail}
                  onChange={(e) => updateField('ownerEmail', e.target.value)}
                  aria-invalid={!!errors.ownerEmail}
                />
                {errors.ownerEmail && (
                  <p className="text-xs text-destructive">{errors.ownerEmail}</p>
                )}
              </div>
              <div className="flex items-end gap-2 text-sm text-muted-foreground pb-2">
                <Hash className="size-4" />
                <span>Cédula: <span className="font-medium text-foreground">{store?.owner.cedula || '—'}</span> (solo lectura)</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={updateStore.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={updateStore.isPending}>
            {updateStore.isPending && <RefreshCw className="size-4 animate-spin" />}
            Guardar Cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
