'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, AlertTriangle } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useCancelSubscription } from '@/hooks/api/use-settings'

// ── Cancel Subscription Dialog ──
// Confirmation dialog that collects a cancellation reason and calls the API.

export interface CancelSubscriptionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storeId: number
  currentPlanName: string
  onCancelled: () => void
}

export function CancelSubscriptionDialog({
  open,
  onOpenChange,
  storeId,
  currentPlanName,
  onCancelled,
}: CancelSubscriptionDialogProps) {
  const [cancelReason, setCancelReason] = useState('')
  const cancelMutation = useCancelSubscription()
  const cancelling = cancelMutation.isPending

  async function handleCancelSubscription() {
    if (cancelReason.trim().length < 5) {
      toast.error('Indica el motivo de cancelación (mínimo 5 caracteres)')
      return
    }
    try {
      await cancelMutation.mutateAsync({
        storeId,
        cancelReason: cancelReason.trim(),
      })
      toast.success('Suscripción cancelada correctamente')
      onOpenChange(false)
      setCancelReason('')
      onCancelled()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión al cancelar suscripción')
    }
  }

  // Reset form when dialog reopens
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setCancelReason('')
    }
    onOpenChange(nextOpen)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Cancelar Suscripción
          </AlertDialogTitle>
          <AlertDialogDescription>
            ¿Estás seguro de que deseas cancelar tu suscripción a <strong>{currentPlanName}</strong>? Esta acción es irreversible y perderás acceso a las funciones de tu plan actual al finalizar el período.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-2 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason" className="text-sm font-semibold">
              Motivo de cancelación <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="cancel-reason"
              placeholder="Cuéntanos por qué deseas cancelar (mínimo 5 caracteres)..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              className="text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Tu motivo nos ayuda a mejorar Viva POS.
            </p>
          </div>
        </div>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={cancelling}>Volver</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); handleCancelSubscription() }}
            disabled={cancelling || cancelReason.trim().length < 5}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {cancelling ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Cancelando...</>
            ) : (
              'Sí, Cancelar Suscripción'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
