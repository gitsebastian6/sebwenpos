'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import {
  Plus,
  Pencil,
  Trash2,
  Shield,
  Search,
  Users,
  Loader2,
  Star,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

// ─── Types ───────────────────────────────────────────────────────────────

interface Role {
  id: number
  storeId: number
  name: string
  description: string | null
  permissions: string
  isDefault: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
  _count: { employees: number }
}

// ─── Constants ───────────────────────────────────────────────────────────

interface PermissionDef {
  key: string
  label: string
}

interface PermissionGroup {
  title: string
  color: string
  bgColor: string
  borderColor: string
  badgeBg: string
  badgeText: string
  permissions: PermissionDef[]
}

const TOTAL_PERMISSIONS = 16

const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: 'Ventas',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/40',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    badgeBg: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    permissions: [
      { key: 'pos', label: 'Punto de Venta' },
      { key: 'tables', label: 'Mesas y Comandas' },
      { key: 'orders', label: 'Órdenes y Ventas' },
      { key: 'quotations', label: 'Cotizaciones' },
    ],
  },
  {
    title: 'Administración',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/40',
    borderColor: 'border-amber-200 dark:border-amber-800',
    badgeBg: 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300',
    badgeText: 'text-amber-700 dark:text-amber-300',
    permissions: [
      { key: 'products', label: 'Productos' },
      { key: 'inventory', label: 'Inventario' },
      { key: 'providers', label: 'Proveedores' },
    ],
  },
  {
    title: 'Finanzas',
    color: 'text-sky-600 dark:text-sky-400',
    bgColor: 'bg-sky-50 dark:bg-sky-950/40',
    borderColor: 'border-sky-200 dark:border-sky-800',
    badgeBg: 'bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300',
    badgeText: 'text-sky-700 dark:text-sky-300',
    permissions: [
      { key: 'accounting', label: 'Contabilidad' },
      { key: 'reports', label: 'Informes' },
      { key: 'invoices', label: 'Facturación' },
    ],
  },
  {
    title: 'Sistema',
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-50 dark:bg-rose-950/40',
    borderColor: 'border-rose-200 dark:border-rose-800',
    badgeBg: 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300',
    badgeText: 'text-rose-700 dark:text-rose-300',
    permissions: [
      { key: 'dashboard', label: 'Dashboard' },
      { key: 'settings', label: 'Configuración' },
      { key: 'manageEmployees', label: 'Gestionar Empleados' },
      { key: 'manageRoles', label: 'Gestionar Roles' },
      { key: 'services', label: 'Servicios' },
      { key: 'customers', label: 'Clientes' },
    ],
  },
]

const ALL_PERMISSIONS: Record<string, boolean> = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.key, false]))
)

function getGroupForPermission(key: string): PermissionGroup | undefined {
  return PERMISSION_GROUPS.find((g) => g.permissions.some((p) => p.key === key))
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function parsePermissions(permissionsStr: string): Record<string, boolean> {
  try {
    return { ...ALL_PERMISSIONS, ...JSON.parse(permissionsStr) }
  } catch {
    return { ...ALL_PERMISSIONS }
  }
}

function getActivePermissionKeys(permissionsStr: string): string[] {
  const perms = parsePermissions(permissionsStr)
  return Object.entries(perms)
    .filter(([, v]) => v)
    .map(([k]) => k)
}

function getPermissionCount(permissionsStr: string): number {
  return getActivePermissionKeys(permissionsStr).length
}

// ─── Component ───────────────────────────────────────────────────────────

export function RolesView() {
  const { store } = useAuthStore()

  // ── Data state ────────────────────────────────────────────────────────
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // ── Create/Edit dialog state ──────────────────────────────────────────
  const [showFormDialog, setShowFormDialog] = useState(false)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formPermissions, setFormPermissions] = useState<Record<string, boolean>>({ ...ALL_PERMISSIONS })
  const [formIsDefault, setFormIsDefault] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── Delete dialog state ───────────────────────────────────────────────
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletingRole, setDeletingRole] = useState<Role | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // ── Data fetching ─────────────────────────────────────────────────────

  const fetchRoles = useCallback(async () => {
    if (!store?.id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/roles?storeId=${store.id}`)
      if (!res.ok) throw new Error('Error al cargar roles')
      const data = await res.json()
      setRoles(data)
    } catch {
      toast.error('Error al cargar los roles')
    } finally {
      setLoading(false)
    }
  }, [store?.id])

  useEffect(() => {
    fetchRoles()
  }, [fetchRoles])

  // ── Permission helpers ────────────────────────────────────────────────

  function toggleFormPermission(key: string) {
    setFormPermissions((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function toggleAllInGroup(group: PermissionGroup, value: boolean) {
    setFormPermissions((prev) => {
      const next = { ...prev }
      for (const p of group.permissions) {
        next[p.key] = value
      }
      return next
    })
  }

  function formPermissionCount(): number {
    return Object.values(formPermissions).filter(Boolean).length
  }

  // ── Open create dialog ────────────────────────────────────────────────

  function openCreateDialog() {
    setEditingRole(null)
    setFormName('')
    setFormDescription('')
    setFormPermissions({ ...ALL_PERMISSIONS })
    setFormIsDefault(false)
    setShowFormDialog(true)
  }

  // ── Open edit dialog ──────────────────────────────────────────────────

  function openEditDialog(role: Role) {
    setEditingRole(role)
    setFormName(role.name)
    setFormDescription(role.description || '')
    setFormPermissions(parsePermissions(role.permissions))
    setFormIsDefault(role.isDefault)
    setShowFormDialog(true)
  }

  // ── Save handler (create or update) ───────────────────────────────────

  async function handleSave() {
    if (!store?.id) return
    if (!formName.trim()) {
      toast.error('El nombre del rol es obligatorio')
      return
    }
    if (formName.trim().length < 2) {
      toast.error('El nombre debe tener al menos 2 caracteres')
      return
    }

    setSaving(true)
    try {
      if (editingRole) {
        // Update
        const res = await fetch(`/api/roles/${editingRole.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim(),
            description: formDescription.trim() || null,
            permissions: formPermissions,
            isDefault: formIsDefault,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Error al actualizar el rol')
        }
        toast.success('Rol actualizado correctamente')
      } else {
        // Create
        const res = await fetch('/api/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId: store.id,
            name: formName.trim(),
            description: formDescription.trim() || null,
            permissions: formPermissions,
            isDefault: formIsDefault,
          }),
        })
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Error al crear el rol')
        }
        toast.success('Rol creado correctamente')
      }
      setShowFormDialog(false)
      fetchRoles()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al guardar el rol')
    } finally {
      setSaving(false)
    }
  }

  // ── Toggle active status ──────────────────────────────────────────────

  async function handleToggleActive(role: Role) {
    const newStatus = !role.isActive
    const action = newStatus ? 'activar' : 'desactivar'
    try {
      const res = await fetch(`/api/roles/${role.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newStatus }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `Error al ${action} el rol`)
      }
      toast.success(`Rol ${newStatus ? 'activado' : 'desactivado'}`)
      fetchRoles()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Error al ${action} el rol`)
    }
  }

  // ── Delete handler ────────────────────────────────────────────────────

  function openDeleteDialog(role: Role) {
    setDeletingRole(role)
    setDeleteError(null)
    setShowDeleteDialog(true)
  }

  async function handleDelete() {
    if (!deletingRole) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/roles/${deletingRole.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        // Show error in dialog instead of toast
        setDeleteError(data.error || 'Error al eliminar el rol')
        setDeleting(false)
        return
      }
      toast.success('Rol eliminado correctamente')
      setShowDeleteDialog(false)
      setDeletingRole(null)
      fetchRoles()
    } catch {
      setDeleteError('Error de conexión al eliminar el rol')
    } finally {
      setDeleting(false)
    }
  }

  // ── Filtered roles ────────────────────────────────────────────────────

  const filteredRoles = roles.filter((role) => {
    if (!search) return true
    const q = search.toLowerCase()
    return role.name.toLowerCase().includes(q)
  })

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Gestión de Roles</h2>
          <p className="text-sm text-muted-foreground">
            Crea y administra roles personalizados para tus empleados
          </p>
        </div>
        <Button onClick={openCreateDialog} className="active:scale-[0.98] transition-all">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Rol
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar rol por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 focus-visible:ring-primary/20 focus-visible:border-primary/40"
        />
      </div>

      {/* Roles Cards Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredRoles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Shield className="h-16 w-16 mb-4 opacity-30 animate-pulse" />
          <p className="text-sm font-medium">No hay roles</p>
          <p className="text-xs">
            {search ? 'No se encontraron resultados para tu búsqueda' : 'Crea tu primer rol personalizado'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRoles.map((role) => {
            const activeKeys = getActivePermissionKeys(role.permissions)
            const permCount = activeKeys.length

            return (
              <Card
                key={role.id}
                className="relative border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl"
              >
                <CardContent className="p-4 sm:p-5 space-y-4">
                  {/* Top row: Name + Badges + Actions */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold truncate">{role.name}</h3>
                        {role.isDefault && (
                          <Badge className="bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 border-0 text-[10px] px-1.5 py-0">
                            <Star className="h-3 w-3 mr-0.5" />
                            Por defecto
                          </Badge>
                        )}
                        {!role.isActive && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Inactivo
                          </Badge>
                        )}
                      </div>
                      {role.description && (
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                          {role.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 active:scale-[0.95] transition-all"
                        onClick={() => openEditDialog(role)}
                        title="Editar rol"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive active:scale-[0.95] transition-all"
                        onClick={() => openDeleteDialog(role)}
                        title="Eliminar rol"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <ToggleRight className="h-4 w-4" />
                      {permCount}/{TOTAL_PERMISSIONS} módulos activos
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="h-4 w-4" />
                      {role._count.employees} empleado{role._count.employees !== 1 ? 's' : ''} asignado{role._count.employees !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Active module badges */}
                  {activeKeys.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {activeKeys.map((key) => {
                        const group = getGroupForPermission(key)
                        const perm = PERMISSION_GROUPS
                          .flatMap((g) => g.permissions)
                          .find((p) => p.key === key)
                        if (!group || !perm) return null
                        return (
                          <Badge
                            key={key}
                            variant="secondary"
                            className={`text-[10px] px-1.5 py-0 border-0 ${group.badgeBg}`}
                          >
                            {perm.label}
                          </Badge>
                        )
                      })}
                    </div>
                  )}

                  {/* Active toggle */}
                  <div className="flex items-center justify-between rounded-lg border border-border/50 p-2.5 hover:border-primary/20 transition-colors">
                    <div className="flex items-center gap-2">
                      {role.isActive ? (
                        <ToggleRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-sm font-medium">
                        {role.isActive ? 'Rol activo' : 'Rol inactivo'}
                      </span>
                    </div>
                    <Switch
                      checked={role.isActive}
                      onCheckedChange={() => handleToggleActive(role)}
                      aria-label={role.isActive ? 'Desactivar rol' : 'Activar rol'}
                      className="data-[state=checked]:bg-primary"
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ─── Create / Edit Dialog ──────────────────────────────────────── */}
      <Dialog
        open={showFormDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowFormDialog(false)
            setEditingRole(null)
          }
        }}
      >
        <DialogContent className="max-w-lg rounded-xl backdrop-blur-sm flex flex-col max-h-[90vh] overflow-hidden !gap-0">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {editingRole ? 'Editar Rol' : 'Nuevo Rol'}
            </DialogTitle>
            <DialogDescription>
              {editingRole
                ? `Editando el rol "${editingRole.name}"`
                : 'Define un nuevo rol con permisos personalizados para tus empleados'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 p-2 overflow-y-auto flex-1 min-h-0">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="role-name">Nombre del rol *</Label>
              <Input
                id="role-name"
                placeholder="Ej: Cajero, Mesero, Administrador..."
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                maxLength={50}
                className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="role-description">Descripción</Label>
              <Textarea
                id="role-description"
                placeholder="Describe brevemente el propósito de este rol..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                maxLength={200}
                rows={2}
                className="resize-none focus-visible:ring-primary/20 focus-visible:border-primary/40"
              />
            </div>

            {/* Is Default checkbox */}
            <div className="flex items-center gap-3 rounded-lg border border-border/50 p-3 hover:border-primary/20 transition-colors">
              <Checkbox
                id="role-default"
                checked={formIsDefault}
                onCheckedChange={(checked) => setFormIsDefault(checked === true)}
                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <div className="grid gap-0.5 leading-none">
                <Label htmlFor="role-default" className="text-sm font-medium cursor-pointer">
                  <span className="flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5 text-amber-500" />
                    Rol por defecto
                  </span>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Se asignará automáticamente a los nuevos empleados
                </p>
              </div>
            </div>

            <Separator />

            {/* Permission Groups */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Permisos</span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {formPermissionCount()}/{TOTAL_PERMISSIONS} activos
                </Badge>
              </div>

              <ScrollArea className="pr-3">
                <div className="space-y-4">
                  {PERMISSION_GROUPS.map((group) => {
                    const groupKeys = group.permissions.map((p) => p.key)
                    const allSelected = groupKeys.every((k) => formPermissions[k])
                    const noneSelected = groupKeys.every((k) => !formPermissions[k])

                    return (
                      <div
                        key={group.title}
                        className={`rounded-lg border p-3 space-y-2 ${group.bgColor} ${group.borderColor}`}
                      >
                        {/* Group header */}
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-semibold uppercase tracking-wider ${group.color}`}>
                            {group.title}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => toggleAllInGroup(group, !allSelected)}
                          >
                            {allSelected ? 'Desmarcar todos' : 'Marcar todos'}
                          </Button>
                        </div>

                        {/* Permission rows with Switch toggles */}
                        <div className="space-y-1">
                          {group.permissions.map((perm) => (
                            <div
                              key={perm.key}
                              className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-background/50 transition-colors"
                            >
                              <Label
                                htmlFor={`perm-${perm.key}`}
                                className="text-sm font-normal cursor-pointer"
                              >
                                {perm.label}
                              </Label>
                              <Switch
                                id={`perm-${perm.key}`}
                                checked={!!formPermissions[perm.key]}
                                onCheckedChange={() => toggleFormPermission(perm.key)}
                                aria-label={perm.label}
                                className="data-[state=checked]:bg-primary"
                              />
                            </div>
                          ))}
                        </div>

                        {/* Group count */}
                        <div className="flex items-center justify-end">
                          <span className={`text-[10px] font-medium ${group.color}`}>
                            {groupKeys.filter((k) => formPermissions[k]).length}/{groupKeys.length} activos
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter className="gap-2 shrink-0 pt-2 border-t border-border/50 px-1">
            <Button
              variant="outline"
              onClick={() => {
                setShowFormDialog(false)
                setEditingRole(null)
              }}
              className="active:scale-[0.98] transition-all"
            >
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="active:scale-[0.98] transition-all">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingRole ? 'Guardar Cambios' : 'Crear Rol'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete AlertDialog ─────────────────────────────────────────── */}
      <AlertDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowDeleteDialog(false)
            setDeletingRole(null)
            setDeleteError(null)
          }
        }}
      >
        <AlertDialogContent className="rounded-xl backdrop-blur-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar rol?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {deletingRole && (
                  <>
                    <p className="mb-2">
                      Estás a punto de eliminar el rol{' '}
                      <strong>{deletingRole.name}</strong>.
                      Esta acción no se puede deshacer.
                    </p>
                    {deletingRole._count.employees > 0 && (
                      <p className="text-destructive font-medium">
                        ⚠️ Este rol tiene {deletingRole._count.employees} empleado
                        {deletingRole._count.employees !== 1 ? 's' : ''} asignado
                        {deletingRole._count.employees !== 1 ? 's' : ''}. Debes reasignarlos antes de eliminarlo.
                      </p>
                    )}
                  </>
                )}
                {deleteError && (
                  <div className="mt-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
                    <p className="text-sm text-destructive font-medium">{deleteError}</p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting || (deletingRole ? deletingRole._count.employees > 0 : false)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.98] transition-all"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
