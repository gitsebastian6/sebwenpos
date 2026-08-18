'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useProviders, useCreateProvider, useUpdateProvider, useDeleteProvider } from '@/hooks/api/use-providers'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Truck,
  Phone,
  Mail,
  MapPin,
} from 'lucide-react'
import { toast } from 'sonner'
import { KPIBar } from '@/components/shared/kpi-bar'
import { ProviderFormDialog } from './provider-form-dialog'

import type { Provider } from '@/types'

type ActiveFilter = 'all' | 'active' | 'inactive'

// ── Component ──────────────────────────────────────────────────────────────

export function ProvidersView() {
  const { store } = useAuthStore()
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [deleteProvider, setDeleteProvider] = useState<Provider | null>(null)

  // ── Query hooks ──
  const activeParam = activeFilter === 'all' ? undefined : activeFilter === 'active'
  const { data: providers = [], isLoading: loading } = useProviders(store?.id, {
    q: search.trim() || undefined,
    active: activeParam,
  })

  // ── Mutation hooks ──
  const createProviderMut = useCreateProvider()
  const updateProviderMut = useUpdateProvider()
  const deleteProviderMut = useDeleteProvider()
  const deleting = deleteProviderMut.isPending

  function openCreateDialog() {
    setEditingProvider(null)
    setDialogOpen(true)
  }

  function openEditDialog(provider: Provider) {
    setEditingProvider(provider)
    setDialogOpen(true)
  }

  async function handleSaveProvider(body: Record<string, unknown>, isEditing: boolean) {
    if (isEditing && editingProvider) {
      await updateProviderMut.mutateAsync({ id: editingProvider.id, body })
      toast.success('Proveedor actualizado')
    } else {
      if (!store?.id) throw new Error('Tienda no disponible')
      await createProviderMut.mutateAsync({ body: { ...body, storeId: store.id } })
      toast.success('Proveedor creado')
    }
  }

  async function handleToggleActive(provider: Provider) {
    try {
      await updateProviderMut.mutateAsync({
        id: provider.id,
        body: { isActive: !provider.isActive },
      })
      toast.success(provider.isActive ? 'Proveedor desactivado' : 'Proveedor activado')
    } catch {
      toast.error('Error al cambiar estado')
    }
  }

  async function handleDelete() {
    if (!deleteProvider) return
    try {
      await deleteProviderMut.mutateAsync({ id: deleteProvider.id })
      toast.success('Proveedor eliminado')
      setDeleteProvider(null)
    } catch {
      toast.error('Error al eliminar proveedor')
    }
  }

  const activeCount = providers.filter((p) => p.isActive).length
  const inactiveCount = providers.filter((p) => !p.isActive).length

  return (
    <div className="space-y-6">
      <KPIBar context="default" />

      {/* ── Header + Search ─────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Truck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Proveedores</h2>
            <p className="text-sm text-muted-foreground">
              {loading
                ? '...'
                : `${activeCount} activo${activeCount !== 1 ? 's' : ''}, ${inactiveCount} inactivo${inactiveCount !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <Button onClick={openCreateDialog} size="sm" className="active:scale-[0.98] transition-all">
          <Plus className="h-4 w-4" />
          Nuevo Proveedor
        </Button>
      </div>

      {/* ── Search + Filter Bar ─────────────────────────────────── */}
      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, NIT, contacto..."
                className="pl-9 focus-visible:ring-primary/20 focus-visible:border-primary/40 transition-all"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              {(
                [
                  { key: 'all', label: 'Todos' },
                  { key: 'active', label: 'Activos' },
                  { key: 'inactive', label: 'Inactivos' },
                ] as const
              ).map((filter) => (
                <Button
                  key={filter.key}
                  variant={activeFilter === filter.key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveFilter(filter.key)}
                  className="text-xs"
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Table ───────────────────────────────────────────────── */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : providers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Truck className="mb-3 h-16 w-16 text-muted-foreground/30 animate-pulse" />
              <p className="text-muted-foreground font-medium">No se encontraron proveedores</p>
              <p className="text-sm text-muted-foreground/60">
                {search || activeFilter !== 'all'
                  ? 'Intenta con otra búsqueda o filtro'
                  : 'Crea tu primer proveedor'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Nombre</TableHead>
                    <TableHead className="whitespace-nowrap">Contacto</TableHead>
                    <TableHead className="whitespace-nowrap">Teléfono</TableHead>
                    <TableHead className="whitespace-nowrap">Email</TableHead>
                    <TableHead className="whitespace-nowrap">Ciudad</TableHead>
                    <TableHead className="whitespace-nowrap">NIT</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providers.map((provider) => (
                    <TableRow
                      key={provider.id}
                      className={`${!provider.isActive ? 'opacity-60' : ''} hover:bg-muted/30 transition-colors`}
                    >
                      <TableCell className="font-medium">
                        <span className="truncate max-w-[120px] block" title={provider.name}>{provider.name}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="truncate max-w-[100px] block" title={provider.contactName || ''}>
                          {provider.contactName || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {provider.phone ? (
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            {provider.phone}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {provider.email ? (
                          <span className="truncate max-w-[140px] inline-flex items-center gap-1" title={provider.email}>
                            <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            {provider.email}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {provider.city ? (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                            {provider.city}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {provider.nit ? (
                          <span className="truncate max-w-[100px] block font-mono" title={provider.nit}>{provider.nit}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusToggle
                          isActive={provider.isActive}
                          onToggle={() => handleToggleActive(provider)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Editar"
                            aria-label="Editar proveedor"
                            onClick={() => openEditDialog(provider)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title="Eliminar"
                            aria-label="Eliminar proveedor"
                            onClick={() => setDeleteProvider(provider)}
                          >
                            <Trash2 className="h-4 w-4" />
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

      {/* ── Create / Edit Dialog ────────────────────────────────── */}
      <ProviderFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingProvider={editingProvider}
        onSave={handleSaveProvider}
      />

      {/* ── Delete Confirmation ─────────────────────────────────── */}
      <AlertDialog
        open={!!deleteProvider}
        onOpenChange={(open) => !open && setDeleteProvider(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar proveedor?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente el proveedor{' '}
              <span className="font-semibold text-foreground">
                {deleteProvider?.name}
              </span>
              . Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function StatusToggle({
  isActive,
  onToggle,
}: {
  isActive: boolean
  onToggle: () => void
}) {
  if (isActive) {
    return (
      <Badge
        variant="outline"
        className="bg-emerald-500/15 text-emerald-400 dark:bg-emerald-500/15 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-500/20 cursor-pointer hover:bg-emerald-500/25 dark:hover:bg-emerald-500/25 transition-colors"
        onClick={onToggle}
      >
        Activo
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="bg-gray-500/15 text-gray-400 dark:bg-gray-500/15 dark:text-gray-400 border-gray-500/20 dark:border-gray-500/20 cursor-pointer hover:bg-gray-500/25 dark:hover:bg-gray-500/25 transition-colors"
      onClick={onToggle}
    >
      Inactivo
    </Badge>
  )
}
