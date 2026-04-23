'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { useUpdateAdminStore } from '@/hooks/api/use-admin-panel'
import type { Store } from './admin-panel-helpers'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function ResetPasswordDialog({
  store,
  open,
  onOpenChange,
}: {
  store: Store | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [newPassword, setNewPassword] = useState('')
  const updateStore = useUpdateAdminStore()

  const handleReset = async () => {
    if (!store) return
    if (newPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return
    }
    updateStore.mutate(
      { storeId: store.id, body: { ownerPassword: newPassword } },
      {
        onSuccess: () => {
          toast.success(`Contraseña actualizada para ${store.owner.fullName}`)
          setNewPassword('')
          onOpenChange(false)
        },
        onError: (e) => {
          toast.error(e.message)
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Restablecer Contraseña</DialogTitle>
          <DialogDescription>
            Nueva contraseña para <strong>{store?.owner.fullName}</strong> ({store?.owner.email})
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label htmlFor="new-password">Nueva Contraseña</Label>
          <Input
            id="new-password"
            type="password"
            placeholder="Mínimo 6 caracteres"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          {newPassword.length > 0 && newPassword.length < 6 && (
            <p className="text-xs text-destructive">Mínimo 6 caracteres requeridos</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={updateStore.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleReset} disabled={updateStore.isPending || newPassword.length < 6}>
            {updateStore.isPending && <RefreshCw className="size-4 animate-spin" />}
            Actualizar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
