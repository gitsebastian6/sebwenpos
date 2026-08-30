'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import type { Provider } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProviderFormData {
  name: string
  contactName: string
  phone: string
  email: string
  address: string
  city: string
  nit: string
  notes: string
  isActive: boolean
}

export const emptyProviderForm: ProviderFormData = {
  name: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  nit: '',
  notes: '',
  isActive: true,
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface ProviderFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editingProvider: Provider | null
  /** Prefills the "Nombre" field — used when opened from a search box that found no match. */
  initialName?: string
  onSave: (body: Record<string, unknown>, isEditing: boolean) => Promise<void>
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ProviderFormDialog({
  open,
  onOpenChange,
  editingProvider,
  initialName,
  onSave,
}: ProviderFormDialogProps) {
  const [form, setForm] = useState<ProviderFormData>(emptyProviderForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editingProvider) {
      setForm({
        name: editingProvider.name,
        contactName: editingProvider.contactName || '',
        phone: editingProvider.phone || '',
        email: editingProvider.email || '',
        address: editingProvider.address || '',
        city: editingProvider.city || '',
        nit: editingProvider.nit || '',
        notes: editingProvider.notes || '',
        isActive: editingProvider.isActive,
      })
    } else {
      setForm({ ...emptyProviderForm, name: initialName?.trim() || '' })
    }
  }, [open, editingProvider, initialName])

  const isEditing = !!editingProvider

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    setSaving(true)
    try {
      const body = isEditing
        ? {
            name: form.name.trim(),
            contactName: form.contactName.trim() || '',
            phone: form.phone.trim() || '',
            email: form.email.trim() || '',
            address: form.address.trim() || '',
            city: form.city.trim() || '',
            nit: form.nit.trim() || '',
            notes: form.notes.trim() || '',
            isActive: form.isActive,
          }
        : {
            name: form.name.trim(),
            ...(form.contactName.trim() && { contactName: form.contactName.trim() }),
            ...(form.phone.trim() && { phone: form.phone.trim() }),
            ...(form.email.trim() && { email: form.email.trim() }),
            ...(form.address.trim() && { address: form.address.trim() }),
            ...(form.city.trim() && { city: form.city.trim() }),
            ...(form.nit.trim() && { nit: form.nit.trim() }),
            ...(form.notes.trim() && { notes: form.notes.trim() }),
          }
      await onSave(body, isEditing)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar proveedor')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onOpenChange(false) }}>
      <DialogContent mobileFullscreen className="sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Proveedor' : 'Nuevo Proveedor'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Modifica los datos del proveedor.' : 'Completa los datos para registrar un nuevo proveedor.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prov-name">
              Nombre / Razón Social <span className="text-destructive">*</span>
            </Label>
            <Input
              id="prov-name"
              placeholder="Nombre del proveedor"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prov-contact">Persona de Contacto</Label>
              <Input
                id="prov-contact"
                placeholder="Nombre del contacto"
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prov-nit">NIT</Label>
              <Input
                id="prov-nit"
                placeholder="Número de Identificación Tributaria"
                value={form.nit}
                onChange={(e) => setForm({ ...form, nit: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prov-phone">Teléfono</Label>
              <Input
                id="prov-phone"
                placeholder="(555) 123-4567"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prov-email">Email</Label>
              <Input
                id="prov-email"
                type="email"
                placeholder="proveedor@ejemplo.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prov-address">Dirección</Label>
            <Input
              id="prov-address"
              placeholder="Dirección del proveedor"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prov-city">Ciudad</Label>
            <Input
              id="prov-city"
              placeholder="Ciudad"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prov-notes">Notas</Label>
            <Textarea
              id="prov-notes"
              placeholder="Notas adicionales sobre el proveedor..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
            />
          </div>

          {isEditing && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="prov-active" className="text-sm font-medium">Estado</Label>
                <p className="text-xs text-muted-foreground">
                  {form.isActive ? 'Proveedor activo' : 'Proveedor inactivo'}
                </p>
              </div>
              <Switch
                id="prov-active"
                checked={form.isActive}
                onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
            {saving ? 'Guardando...' : isEditing ? 'Actualizar' : 'Crear Proveedor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
