'use client'

import {
  Hash,
  MapPin,
  Calendar,
  Phone,
  Mail,
  User,
  Shield,
  UserCheck,
  ShoppingCart,
  UsersRound,
} from 'lucide-react'
import type { StoreDetail } from './admin-panel-helpers'
import { planBadgeVariant, planLabel, PlanStatusBadge } from './admin-panel-helpers'

import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function StoreDetailDialog({
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
