'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import {
  useAdminStores,
  useAdminStoreDetail,
  useCreateAdminStore,
  useUpdateAdminStore,
  type AdminStore,
  type AdminStoreDetail,
  type AdminSummary,
  type CreateStoreForm,
} from '@/hooks/api/use-admin-panel'
import {
  Building2,
  Users,
  ShoppingCart,
  Store,
  Plus,
  Search,
  Eye,
  Power,
  PowerOff,
  KeyRound,
  RefreshCw,
  ChevronLeft,
  Phone,
  Mail,
  User,
  MapPin,
  Hash,
  Calendar,
  Shield,
  UserCheck,
  Package,
  UsersRound,
  Pencil,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'

// ── Type aliases from hook ─────────────────────────────────────

type Store = AdminStore
type StoreDetail = AdminStoreDetail
type Summary = AdminSummary

// ── Create Store Form ───────────────────────────────────────────

const emptyForm: CreateStoreForm = {
  storeName: '',
  nit: '',
  legalName: '',
  city: '',
  ownerFullName: '',
  ownerCedula: '',
  ownerDocumentType: 'CC',
  ownerPhone: '',
  ownerEmail: '',
  ownerPassword: '',
  plan: 'TRIAL',
}

// ── Edit Store Form Type ─────────────────────────────────────────

interface EditStoreForm {
  storeName: string
  nit: string
  legalName: string
  city: string
  address: string
  plan: string
  ownerFullName: string
  ownerPhone: string
  ownerEmail: string
}

// ── Plan Badge Helper ────────────────────────────────────────────

function planBadgeVariant(plan: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  switch (plan) {
    case 'ENTERPRISE':
      return 'default'
    case 'PRO':
      return 'secondary'
    case 'BASIC':
      return 'outline'
    case 'TRIAL':
      return 'destructive'
    default:
      return 'outline'
  }
}

function planLabel(plan: string): string {
  switch (plan) {
    case 'TRIAL': return 'Prueba'
    case 'BASIC': return 'Básico'
    case 'PRO': return 'Pro'
    case 'ENTERPRISE': return 'Empresa'
    default: return plan
  }
}

// ── Plan Expiration Badge ──────────────────────────────────────────

function PlanStatusBadge({ store }: { store: { planExpiresAt: string | null } }) {
  if (!store.planExpiresAt) return null

  const expiresAt = new Date(store.planExpiresAt)
  const now = new Date()
  const diffMs = expiresAt.getTime() - now.getTime()
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (daysRemaining < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-600 dark:text-red-400">
        EXPIRADO
      </span>
    )
  }

  const colorClass = daysRemaining <= 7
    ? 'text-amber-600 dark:text-amber-400'
    : 'text-emerald-600 dark:text-emerald-400'

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${colorClass}`}>
      {daysRemaining} días restantes
    </span>
  )
}

// ── Stat Card ────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType
  label: string
  value: number | string
  color: string
}) {
  return (
    <Card className="py-4">
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`flex items-center justify-center rounded-lg p-2.5 ${color}`}>
          <Icon className="size-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground truncate">{label}</p>
          <p className="text-2xl font-bold leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Reset Password Dialog ────────────────────────────────────────

function ResetPasswordDialog({
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

// ── Store Detail Dialog ──────────────────────────────────────────

function StoreDetailDialog({
  store,
  loading,
  open,
  onOpenChange,
}: {
  store: StoreDetail | null
  loading: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Always render DialogTitle for accessibility */}
        <DialogTitle className="sr-only">
          {loading ? 'Cargando detalle...' : store ? `Detalle de ${store.name}` : 'Detalle de tienda'}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Información detallada de la tienda seleccionada
        </DialogDescription>

        {loading && !store ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Separator className="my-4" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : store ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <DialogTitle className="text-xl">{store.name}</DialogTitle>
                <Badge variant={store.isActive ? 'default' : 'destructive'}>
                  {store.isActive ? 'Activa' : 'Inactiva'}
                </Badge>
                <Badge variant={planBadgeVariant(store.plan)}>{planLabel(store.plan)}</Badge>
                <PlanStatusBadge store={store} />
              </div>
              <DialogDescription>{store.legalName || 'Sin razón social'}</DialogDescription>
            </DialogHeader>

            {/* Store Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <Hash className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">NIT:</span>
                <span className="font-medium">{store.nit || '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">Ciudad:</span>
                <span className="font-medium">{store.city || '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">Creada:</span>
                <span className="font-medium">{new Date(store.createdAt).toLocaleDateString('es-CO')}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">Plan inicio:</span>
                <span className="font-medium">
                  {store.planStartDate ? new Date(store.planStartDate).toLocaleDateString('es-CO') : '—'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">Plan vence:</span>
                <span className="font-medium">
                  {store.planExpiresAt ? new Date(store.planExpiresAt).toLocaleDateString('es-CO') : 'Nunca'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <PlanStatusBadge store={store} />
              </div>
            </div>

            <Separator />

            {/* Owner Info */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Shield className="size-4" /> Información del Propietario
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <User className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Nombre:</span>
                  <span className="font-medium">{store.owner.fullName}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Hash className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Cédula:</span>
                  <span className="font-medium">{store.owner.cedula}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Teléfono:</span>
                  <span className="font-medium">{store.owner.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{store.owner.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <UserCheck className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Estado:</span>
                  <Badge variant={store.owner.isActive ? 'default' : 'destructive'} className="text-xs">
                    {store.owner.isActive ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
              </div>
            </div>

            <Separator />

            {/* Stats */}
            <div>
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <ShoppingCart className="size-4" /> Estadísticas
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold">{store.stats.totalOrders}</p>
                  <p className="text-xs text-muted-foreground">Pedidos</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold">{store.stats.totalStaff}</p>
                  <p className="text-xs text-muted-foreground">Personal</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold">{store.stats.totalProducts}</p>
                  <p className="text-xs text-muted-foreground">Productos</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold">{store.stats.totalCustomers}</p>
                  <p className="text-xs text-muted-foreground">Clientes</p>
                </div>
                <div className="rounded-lg border p-3 text-center">
                  <p className="text-2xl font-bold">{store.stats.totalRoles}</p>
                  <p className="text-xs text-muted-foreground">Roles</p>
                </div>
              </div>
            </div>

            {/* Staff List */}
            {store.staff && store.staff.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <UsersRound className="size-4" /> Personal ({store.staff.length})
                  </h4>
                  <div className="rounded-lg border overflow-hidden max-h-64 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead className="hidden sm:table-cell">Cédula</TableHead>
                          <TableHead className="hidden md:table-cell">Rol</TableHead>
                          <TableHead className="hidden lg:table-cell">Teléfono</TableHead>
                          <TableHead>Estado</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {store.staff.map((member) => (
                          <TableRow key={member.id}>
                            <TableCell className="font-medium">{member.fullName || '—'}</TableCell>
                            <TableCell className="hidden sm:table-cell">{member.cedula || '—'}</TableCell>
                            <TableCell className="hidden md:table-cell">{member.roleName || '—'}</TableCell>
                            <TableCell className="hidden lg:table-cell">{member.phone}</TableCell>
                            <TableCell>
                              <Badge variant={member.isActive ? 'default' : 'destructive'} className="text-xs">
                                {member.isActive ? 'Activo' : 'Inactivo'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            No se pudo cargar la información de la tienda.
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Create Store Dialog ──────────────────────────────────────────

function CreateStoreDialog({
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
              <Store className="size-4" /> Información de la Tienda
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

// ── Edit Store Dialog ────────────────────────────────────────────

function EditStoreDialog({
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
              <Store className="size-4" /> Información de la Tienda
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

// ── Main Admin Panel ─────────────────────────────────────────────

export function AdminPanel() {
  const logout = useAuthStore((s) => s.logout)
  const user = useAuthStore((s) => s.user)

  // TanStack Query hooks
  const { data: storesData, isLoading: loading } = useAdminStores()
  const stores = storesData?.stores ?? []
  const summary = storesData?.summary ?? null

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false)
  const [detailStoreId, setDetailStoreId] = useState<number | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [resetStore, setResetStore] = useState<Store | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [editStore, setEditStore] = useState<Store | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  // Store detail query (only enabled when dialog is open with a storeId)
  const { data: detailStore, isLoading: detailLoading } = useAdminStoreDetail(detailStoreId)

  // Toggle active mutation
  const updateStore = useUpdateAdminStore()

  const handleToggleActive = (store: Store) => {
    updateStore.mutate(
      { storeId: store.id, body: { isActive: !store.isActive } },
      {
        onSuccess: () => {
          toast.success(
            store.isActive
              ? `Tienda "${store.name}" desactivada`
              : `Tienda "${store.name}" activada`
          )
        },
        onError: (e) => {
          toast.error(e.message)
        },
      }
    )
  }

  const handleOpenDetail = (storeId: number) => {
    setDetailStoreId(storeId)
    setDetailOpen(true)
  }

  const handleOpenReset = (store: Store) => {
    setResetStore(store)
    setResetOpen(true)
  }

  const handleOpenEdit = (store: Store) => {
    setEditStore(store)
    setEditOpen(true)
  }

  // Filtered stores
  const filteredStores = stores.filter((s) => {
    const matchesSearch =
      !search.trim() ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.owner.fullName.toLowerCase().includes(search.toLowerCase()) ||
      s.nit?.toLowerCase().includes(search.toLowerCase()) ||
      s.city?.toLowerCase().includes(search.toLowerCase())
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && s.isActive) ||
      (statusFilter === 'inactive' && !s.isActive)
    return matchesSearch && matchesStatus
  })

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <Building2 className="size-6 text-primary" />
            <h1 className="text-lg sm:text-xl font-bold">Panel de Administración</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-muted-foreground">
              {user?.fullName || 'Super Admin'}
            </span>
            <Button variant="outline" size="sm" onClick={logout}>
              <ChevronLeft className="size-4" />
              <span className="hidden sm:inline">Cerrar Sesión</span>
              <span className="sm:hidden">Salir</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard
              icon={Building2}
              label="Total Tiendas"
              value={summary.totalStores}
              color="bg-emerald-600"
            />
            <StatCard
              icon={Store}
              label="Activas"
              value={summary.activeStores}
              color="bg-green-600"
            />
            <StatCard
              icon={Store}
              label="Inactivas"
              value={summary.inactiveStores}
              color="bg-red-500"
            />
            <StatCard
              icon={ShoppingCart}
              label="Total Pedidos"
              value={summary.totalOrders}
              color="bg-amber-600"
            />
            <StatCard
              icon={Users}
              label="Total Usuarios"
              value={summary.totalUsers}
              color="bg-violet-600"
            />
          </div>
        )}

        {/* Main Content */}
        <Card className="py-0">
          <CardHeader className="flex-row items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg">Tiendas</CardTitle>
              <CardDescription>
                {loading
                  ? 'Cargando...'
                  : `${filteredStores.length} de ${stores.length} tiendas`}
              </CardDescription>
            </div>
            <Button onClick={() => setCreateOpen(true)} size="sm">
              <Plus className="size-4" />
              Crear Tienda
            </Button>
          </CardHeader>

          <CardContent className="p-4 space-y-4">
            {/* Search and Filter */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, propietario, NIT o ciudad..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="active">Activas</SelectItem>
                  <SelectItem value="inactive">Inactivas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Stores Table */}
            {loading ? (
              <div className="space-y-3 py-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredStores.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Package className="size-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No se encontraron tiendas</p>
                <p className="text-xs mt-1">
                  Intenta ajustar el filtro de búsqueda o crea una nueva tienda.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="hidden sm:table-cell">Propietario</TableHead>
                      <TableHead className="hidden md:table-cell">Ciudad</TableHead>
                      <TableHead className="hidden lg:table-cell">NIT</TableHead>
                      <TableHead className="hidden xl:table-cell">Plan</TableHead>
                      <TableHead className="hidden xl:table-cell">Personal</TableHead>
                      <TableHead className="hidden lg:table-cell">Pedidos</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="hidden md:table-cell">Creada</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStores.map((store) => (
                      <TableRow
                        key={store.id}
                        className="cursor-pointer"
                        onClick={() => handleOpenDetail(store.id)}
                      >
                        <TableCell className="font-medium">{store.name}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div className="flex flex-col">
                            <span className="text-sm">{store.owner.fullName}</span>
                            <span className="text-xs text-muted-foreground">
                              {store.owner.email}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {store.city || '—'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell font-mono text-xs">
                          {store.nit || '—'}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <div className="flex flex-col gap-0.5">
                            <Badge variant={planBadgeVariant(store.plan)} className="text-xs w-fit">
                              {planLabel(store.plan)}
                            </Badge>
                            <PlanStatusBadge store={store} />
                          </div>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          {store.stats.totalStaff}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {store.stats.totalOrders}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={store.isActive ? 'default' : 'destructive'}
                            className="text-xs"
                          >
                            {store.isActive ? 'Activa' : 'Inactiva'}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {new Date(store.createdAt).toLocaleDateString('es-CO')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className="flex items-center justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => handleOpenEdit(store)}
                              title="Editar tienda"
                              aria-label="Editar tienda"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => handleOpenDetail(store.id)}
                              title="Ver detalle"
                              aria-label="Ver detalle de tienda"
                            >
                              <Eye className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => handleOpenReset(store)}
                              title="Restablecer contraseña"
                              aria-label="Restablecer contraseña"
                            >
                              <KeyRound className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => handleToggleActive(store)}
                              disabled={updateStore.isPending}
                              title={store.isActive ? 'Desactivar' : 'Activar'}
                              aria-label="Activar o desactivar tienda"
                            >
                              {updateStore.isPending ? (
                                <RefreshCw className="size-4 animate-spin" />
                              ) : store.isActive ? (
                                <PowerOff className="size-4 text-red-500" />
                              ) : (
                                <Power className="size-4 text-green-500" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Dialogs */}
      <CreateStoreDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {}}
      />
      <StoreDetailDialog
        store={detailStore}
        loading={detailLoading}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
      <EditStoreDialog
        key={editStore?.id}
        store={editStore}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => {}}
      />
      <ResetPasswordDialog
        store={resetStore}
        open={resetOpen}
        onOpenChange={setResetOpen}
      />
    </div>
  )
}
