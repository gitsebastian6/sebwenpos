'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { useUpdateUser } from '@/hooks/api/use-settings'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Loader2, Save, User, Phone, BadgeCheck, Shield } from 'lucide-react'
import { SecurityQuestionCard } from '@/components/settings/security-question-card'

export function PersonalSettingsTab() {
  const { user, updateUser } = useAuthStore()

  const [userFullName, setUserFullName] = useState(user?.fullName || '')
  const [userEmail, setUserEmail] = useState(user?.email || '')
  const [userCedula, setUserCedula] = useState(user?.cedula || '')
  const hasChanges =
    userFullName !== (user?.fullName || '') ||
    userEmail !== (user?.email || '') ||
    userCedula !== (user?.cedula || '')

  const updateUserMutation = useUpdateUser()
  const saving = updateUserMutation.isPending

  async function handleSave() {
    if (!user?.id) return
    try {
      const data = await updateUserMutation.mutateAsync({
        userId: user.id,
        data: {
          fullName: userFullName,
          email: userEmail || null,
          cedula: userCedula || null,
        },
      })
      updateUser(data)
      toast.success('Datos personales actualizados')
    } catch {
      toast.error('Error al guardar datos personales')
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
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
          <div className="rounded-lg border border-border/50 p-3 bg-muted/30 mb-2">
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
              className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
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
              className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
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
              className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
            />
            <p className="text-xs text-muted-foreground">
              Número de documento de identidad del propietario o responsable
            </p>
          </div>

          <Separator />

          <div className="rounded-lg border border-border/50 p-3 bg-muted/30">
            <div className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Rol:</span>
              <span className="font-medium">{user?.role === 'OWNER' ? 'Propietario' : 'Empleado'}</span>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges || !userFullName.trim()}
            className="w-full gap-2 active:scale-[0.98] transition-all"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar Cambios
          </Button>
        </CardContent>
      </Card>

      {/* ═══ Security Question Card ═══ */}
      <SecurityQuestionCard />
    </div>
  )
}
