'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Store as StoreIcon, User, RefreshCw } from 'lucide-react'
import { useCreateAdminStore, type CreateStoreForm } from '@/hooks/api/use-admin-panel'
import { emptyForm } from './admin-panel-helpers'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

export function CreateStoreDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const [form, setForm] = useState<CreateStoreForm>(emptyForm)
  const [errors, setErrors] = useState<Partial<Record<keyof CreateStoreForm, string>>>({})
  const createStore = useCreateAdminStore()

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof CreateStoreForm, string>> = {}
    if (!form.storeName.trim()) newErrors.storeName = 'Nombre de tienda requerido'
    if (form.ownerCedula.length < 5) newErrors.ownerCedula = 'Mínimo 5 caracteres'
    if (form.ownerPassword.length < 6) newErrors.ownerPassword = 'Mínimo 6 caracteres'
    if (form.ownerPhone.length < 7) newErrors.ownerPhone = 'Teléfono inválido'
    if (!form.ownerEmail.trim() || !form.ownerEmail.includes('@'))
      newErrors.ownerEmail = 'Email inválido'
    if (!form.ownerFullName.trim()) newErrors.ownerFullName = 'Nombre del propietario requerido'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    createStore.mutate(form, {
      onSuccess: () => {
        toast.success('Tienda creada exitosamente')
        setForm(emptyForm)
        setErrors({})
        onOpenChange(false)
        onCreated()
      },
      onError: (e) => {
        toast.error(e.message)
      },
    })
  }

  const updateField = (field: keyof CreateStoreForm, value: string) => {
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
            <Plus className="size-5" /> Crear Nueva Tienda
          </DialogTitle>
          <DialogDescription>
            Complete la información de la tienda y su propietario.
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
                <Label htmlFor="create-storeName">Nombre de la Tienda *</Label>
                <Input
                  id="create-storeName"
                  placeholder="Ej: Restaurante El Buen Sabor"
                  value={form.storeName}
                  onChange={(e) => updateField('storeName', e.target.value)}
                  aria-invalid={!!errors.storeName}
                />
                {errors.storeName && (
                  <p className="text-xs text-destructive">{errors.storeName}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-nit">NIT</Label>
                <Input
                  id="create-nit"
                  placeholder="Ej: 900123456-7"
                  value={form.nit}
                  onChange={(e) => updateField('nit', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-legalName">Razón Social</Label>
                <Input
                  id="create-legalName"
                  placeholder="Ej: El Buen Sabor SAS"
                  value={form.legalName}
                  onChange={(e) => updateField('legalName', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-city">Ciudad</Label>
                <Input
                  id="create-city"
                  placeholder="Ej: Bogotá"
                  value={form.city}
                  onChange={(e) => updateField('city', e.target.value)}
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
          </div>

          <Separator />

          {/* Owner Info */}
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <User className="size-4" /> Información del Propietario
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="create-ownerFullName">Nombre Completo *</Label>
                <Input
                  id="create-ownerFullName"
                  placeholder="Ej: Juan Pérez"
                  value={form.ownerFullName}
                  onChange={(e) => updateField('ownerFullName', e.target.value)}
                  aria-invalid={!!errors.ownerFullName}
                />
                {errors.ownerFullName && (
                  <p className="text-xs text-destructive">{errors.ownerFullName}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-ownerCedula">Cédula (Usuario de login) *</Label>
                <Input
                  id="create-ownerCedula"
                  placeholder="Mínimo 5 caracteres"
                  value={form.ownerCedula}
                  onChange={(e) => updateField('ownerCedula', e.target.value)}
                  aria-invalid={!!errors.ownerCedula}
                />
                {errors.ownerCedula && (
                  <p className="text-xs text-destructive">{errors.ownerCedula}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Tipo de Documento</Label>
                <Select
                  value={form.ownerDocumentType}
                  onValueChange={(v) => updateField('ownerDocumentType', v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CC">Cédula de Ciudadanía</SelectItem>
                    <SelectItem value="CE">Cédula de Extranjería</SelectItem>
                    <SelectItem value="NIT">NIT</SelectItem>
                    <SelectItem value="PP">Pasaporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-ownerPhone">Teléfono *</Label>
                <Input
                  id="create-ownerPhone"
                  placeholder="Ej: 3001234567"
                  value={form.ownerPhone}
                  onChange={(e) => updateField('ownerPhone', e.target.value)}
                  aria-invalid={!!errors.ownerPhone}
                />
                {errors.ownerPhone && (
                  <p className="text-xs text-destructive">{errors.ownerPhone}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-ownerEmail">Email *</Label>
                <Input
                  id="create-ownerEmail"
                  type="email"
                  placeholder="Ej: juan@email.com"
                  value={form.ownerEmail}
                  onChange={(e) => updateField('ownerEmail', e.target.value)}
                  aria-invalid={!!errors.ownerEmail}
                />
                {errors.ownerEmail && (
                  <p className="text-xs text-destructive">{errors.ownerEmail}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-ownerPassword">Contraseña *</Label>
                <Input
                  id="create-ownerPassword"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={form.ownerPassword}
                  onChange={(e) => updateField('ownerPassword', e.target.value)}
                  aria-invalid={!!errors.ownerPassword}
                />
                {errors.ownerPassword && (
                  <p className="text-xs text-destructive">{errors.ownerPassword}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createStore.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={createStore.isPending}>
            {createStore.isPending && <RefreshCw className="size-4 animate-spin" />}
            Crear Tienda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
