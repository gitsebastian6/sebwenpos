'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import {
  useAdminStores,
  useAdminStoreDetail,
  useUpdateAdminStore,
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
  Pencil,
  Package,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

import type { Store as StoreType } from './admin-panel-helpers'
import { StatCard, planBadgeVariant, planLabel, PlanStatusBadge } from './admin-panel-helpers'
import { ResetPasswordDialog } from './reset-password-dialog'
import { StoreDetailDialog } from './store-detail-dialog'
import { CreateStoreDialog } from './create-store-dialog'
import { EditStoreDialog } from './edit-store-dialog'

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
  const [resetStore, setResetStore] = useState<StoreType | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [editStore, setEditStore] = useState<StoreType | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  // Store detail query (only enabled when dialog is open with a storeId)
  const { data: detailStore, isLoading: detailLoading } = useAdminStoreDetail(detailStoreId)

  // Toggle active mutation
  const updateStore = useUpdateAdminStore()

  const handleToggleActive = (store: StoreType) => {
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

  const handleOpenReset = (store: StoreType) => {
    setResetStore(store)
    setResetOpen(true)
  }

  const handleOpenEdit = (store: StoreType) => {
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
