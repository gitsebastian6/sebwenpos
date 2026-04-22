'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
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
  CalendarDays,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { KPIBar } from '@/components/shared/kpi-bar'
import { es } from 'date-fns/locale'

// ── Types ──────────────────────────────────────────────────────────────────

interface Provider {
  id: number
  storeId: number
  name: string
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  nit: string | null
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

type ActiveFilter = 'all' | 'active' | 'inactive'

// ── Component ──────────────────────────────────────────────────────────────

export function ProvidersView() {
  const { store } = useAuthStore()
  const [providers, setProviders] = useState<Provider[]>([])
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all')
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null)
  const [deleteProvider, setDeleteProvider] = useState<Provider | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formContactName, setFormContactName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [formCity, setFormCity] = useState('')
  const [formNit, setFormNit] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formIsActive, setFormIsActive] = useState(true)

  const fetchProviders = useCallback(async () => {
    if (!store?.id) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ storeId: store.id.toString() })
      if (search.trim()) params.set('q', search.trim())
      if (activeFilter === 'active') params.set('active', 'true')
      if (activeFilter === 'inactive') params.set('active', 'false')
      const res = await fetch(`/api/providers?${params}`)
      if (!res.ok) throw new Error('Error al cargar proveedores')
      const data = await res.json()
      setProviders(data)
    } catch {
      toast.error('Error al cargar proveedores')
    } finally {
      setLoading(false)
    }
  }, [store?.id, search, activeFilter])

  useEffect(() => {
    const timer = setTimeout(() => fetchProviders(), 300)
    return () => clearTimeout(timer)
  }, [fetchProviders])

  function openCreateDialog() {
    setEditingProvider(null)
    setFormName('')
    setFormContactName('')
    setFormPhone('')
    setFormEmail('')
    setFormAddress('')
    setFormCity('')
    setFormNit('')
    setFormNotes('')
    setFormIsActive(true)
    setDialogOpen(true)
  }

  function openEditDialog(provider: Provider) {
    setEditingProvider(provider)
    setFormName(provider.name)
    setFormContactName(provider.contactName || '')
    setFormPhone(provider.phone || '')
    setFormEmail(provider.email || '')
    setFormAddress(provider.address || '')
    setFormCity(provider.city || '')
    setFormNit(provider.nit || '')
    setFormNotes(provider.notes || '')
    setFormIsActive(provider.isActive)
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim()) {
      toast.error('El nombre es obligatorio')
      return
    }
    if (!store?.id) {
      toast.error('Tienda no disponible')
      return
    }
    setSubmitting(true)
    try {
      if (editingProvider) {
        // Update
        const body: Record<string, unknown> = {
          name: formName.trim(),
          contactName: formContactName.trim() || '',
          phone: formPhone.trim() || '',
          email: formEmail.trim() || '',
          address: formAddress.trim() || '',
          city: formCity.trim() || '',
          nit: formNit.trim() || '',
          notes: formNotes.trim() || '',
          isActive: formIsActive,
        }
        const res = await fetch(`/api/providers/${editingProvider.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Error al actualizar')
        }
        toast.success('Proveedor actualizado')
      } else {
        // Create
        const body: Record<string, unknown> = {
          storeId: store.id,
          name: formName.trim(),
        }
        if (formContactName.trim()) body.contactName = formContactName.trim()
        if (formPhone.trim()) body.phone = formPhone.trim()
        if (formEmail.trim()) body.email = formEmail.trim()
        if (formAddress.trim()) body.address = formAddress.trim()
        if (formCity.trim()) body.city = formCity.trim()
        if (formNit.trim()) body.nit = formNit.trim()
        if (formNotes.trim()) body.notes = formNotes.trim()

        const res = await fetch('/api/providers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Error al crear')
        }
        toast.success('Proveedor creado')
      }
      setDialogOpen(false)
      fetchProviders()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleActive(provider: Provider) {
    try {
      const res = await fetch(`/api/providers/${provider.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !provider.isActive }),
      })
      if (!res.ok) throw new Error()
      toast.success(provider.isActive ? 'Proveedor desactivado' : 'Proveedor activado')
      fetchProviders()
    } catch {
      toast.error('Error al cambiar estado')
    }
  }

  async function handleDelete() {
    if (!deleteProvider) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/providers/${deleteProvider.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      toast.success('Proveedor eliminado')
      setDeleteProvider(null)
      fetchProviders()
    } catch {
      toast.error('Error al eliminar proveedor')
    } finally {
      setDeleting(false)
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
                            onClick={() => openEditDialog(provider)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title="Eliminar"
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
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>
              {editingProvider ? 'Editar Proveedor' : 'Nuevo Proveedor'}
            </DialogTitle>
            <DialogDescription>
              {editingProvider
                ? 'Modifica los datos del proveedor.'
                : 'Completa los datos para registrar un nuevo proveedor.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="provider-name">
                Nombre / Razón Social <span className="text-destructive">*</span>
              </Label>
              <Input
                id="provider-name"
                placeholder="Nombre del proveedor"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="provider-contact">Persona de Contacto</Label>
                <Input
                  id="provider-contact"
                  placeholder="Nombre del contacto"
                  value={formContactName}
                  onChange={(e) => setFormContactName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-nit">NIT</Label>
                <Input
                  id="provider-nit"
                  placeholder="Número de Identificación Tributaria"
                  value={formNit}
                  onChange={(e) => setFormNit(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="provider-phone">Teléfono</Label>
                <Input
                  id="provider-phone"
                  placeholder="(555) 123-4567"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="provider-email">Email</Label>
                <Input
                  id="provider-email"
                  type="email"
                  placeholder="proveedor@ejemplo.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-address">Dirección</Label>
              <Input
                id="provider-address"
                placeholder="Dirección del proveedor"
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-city">Ciudad</Label>
              <Input
                id="provider-city"
                placeholder="Ciudad"
                value={formCity}
                onChange={(e) => setFormCity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-notes">Notas</Label>
              <Textarea
                id="provider-notes"
                placeholder="Notas adicionales sobre el proveedor..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={3}
              />
            </div>

            {/* Active toggle (only in edit) */}
            {editingProvider && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="provider-active" className="text-sm font-medium">
                    Estado
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {formIsActive ? 'Proveedor activo' : 'Proveedor inactivo'}
                  </p>
                </div>
                <Switch
                  id="provider-active"
                  checked={formIsActive}
                  onCheckedChange={setFormIsActive}
                />
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || !formName.trim()}>
                {submitting
                  ? 'Guardando...'
                  : editingProvider
                    ? 'Actualizar'
                    : 'Crear Proveedor'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
