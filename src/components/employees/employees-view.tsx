'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Users,
  Shield,
  UserCog,
  Star,
  Info,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'

import {
  useEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  type Employee,
} from '@/hooks/api/use-employees'
import {
  useRoles,
  type Role,
} from '@/hooks/api/use-roles'

// ─── Constants ───────────────────────────────────────────────────────────

const POSITIONS = [
  { value: 'Cajero', label: 'Cajero' },
  { value: 'Mesero', label: 'Mesero' },
  { value: 'Bartender', label: 'Bartender' },
  { value: 'Administrador', label: 'Administrador' },
  { value: 'Otro', label: 'Otro' },
]

// Permission labels for read-only display
const PERMISSION_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  pos: 'Punto de Venta',
  tables: 'Mesas y Comandas',
  products: 'Productos',
  customers: 'Clientes',
  providers: 'Proveedores',
  orders: 'Órdenes y Ventas',
  invoices: 'Facturación',
  inventory: 'Inventario',
  accounting: 'Contabilidad',
  services: 'Servicios',
  reports: 'Informes',
  settings: 'Configuración',
  quotations: 'Cotizaciones',
  manageEmployees: 'Gestionar Empleados',
  manageRoles: 'Gestionar Roles',
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function parsePermissions(permissionsStr: string): Record<string, boolean> {
  try {
    return JSON.parse(permissionsStr)
  } catch {
    return {}
  }
}

function getRoleBadgeVariant(roleName: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!roleName) return 'outline'
  const lower = roleName.toLowerCase()
  if (lower.includes('admin') || lower.includes('gerente') || lower.includes('owner')) return 'destructive'
  if (lower.includes('cajero') || lower.includes('mesero') || lower.includes('bartender')) return 'secondary'
  return 'default'
}

// ─── Component ───────────────────────────────────────────────────────────

export function EmployeesView() {
  const { store } = useAuthStore()

  // ─── Data fetching with TanStack Query ────────────────────────────────
  const { data: employees = [], isLoading: employeesLoading } = useEmployees(store?.id)
  const { data: allRoles = [], isLoading: rolesLoading } = useRoles(store?.id)
  const roles = allRoles.filter((r) => r.isActive)

  // ─── Mutations ───────────────────────────────────────────────────────
  const createEmployee = useCreateEmployee()
  const updateEmployee = useUpdateEmployee()
  const deleteEmployee = useDeleteEmployee()

  const [search, setSearch] = useState('')

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createForm, setCreateForm] = useState({
    cedula: '',
    fullName: '',
    password: '',
    position: 'Cajero',
    roleId: '',
    phone: '',
    email: '',
  })

  // Edit dialog state
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [editForm, setEditForm] = useState({
    position: '',
    roleId: '',
    phone: '',
    email: '',
    fullName: '',
    commissionRate: '',
  })
  const [editActive, setEditActive] = useState(true)

  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletingEmployee, setDeletingEmployee] = useState<Employee | null>(null)

  // ─── Default role ────────────────────────────────────────────────────

  const defaultRole = roles.find((r) => r.isDefault)

  // ─── Create handler ──────────────────────────────────────────────────

  function resetCreateForm() {
    setCreateForm({
      cedula: '',
      fullName: '',
      password: '',
      position: 'Cajero',
      roleId: defaultRole ? String(defaultRole.id) : '',
      phone: '',
      email: '',
    })
  }

  async function handleCreate() {
    if (!store?.id) return
    const { cedula, fullName, password, position, roleId, phone, email } = createForm
    if (!cedula || !fullName || !password) {
      toast.error('Cédula, nombre y contraseña son obligatorios')
      return
    }
    if (password.length < 6) {
      toast.error('La contraseña debe tener mínimo 6 caracteres')
      return
    }
    try {
      const body: Record<string, unknown> = {
        storeId: store.id,
        cedula,
        fullName,
        password,
        position: position || null,
        phone: phone || null,
        email: email || null,
      }
      if (roleId) {
        body.roleId = parseInt(roleId)
      }
      await createEmployee.mutateAsync({ body })
      toast.success('Empleado creado correctamente')
      setShowCreateDialog(false)
      resetCreateForm()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al crear empleado')
    }
  }

  // ─── Edit handler ────────────────────────────────────────────────────

  function openEditDialog(employee: Employee) {
    setEditingEmployee(employee)
    setEditForm({
      position: employee.position || '',
      roleId: employee.roleId ? String(employee.roleId) : '',
      phone: employee.user.phone || '',
      email: employee.user.email || '',
      fullName: employee.user.fullName || '',
      commissionRate: employee.commissionRate != null ? String(employee.commissionRate) : '',
    })
    setEditActive(employee.isActive)
    setShowEditDialog(true)
  }

  async function handleSaveEdit() {
    if (!editingEmployee) return
    try {
      const body: Record<string, unknown> = {
        position: editForm.position || null,
        isActive: editActive,
        fullName: editForm.fullName || null,
        phone: editForm.phone || null,
        email: editForm.email || null,
        commissionRate: editForm.commissionRate !== '' ? Number(editForm.commissionRate) : null,
      }
      if (editForm.roleId) {
        body.roleId = parseInt(editForm.roleId)
      } else {
        // Explicitly set to null to unassign role
        body.roleId = null
      }
      await updateEmployee.mutateAsync({ id: editingEmployee.id, body })
      toast.success('Empleado actualizado correctamente')
      setShowEditDialog(false)
      setEditingEmployee(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al actualizar empleado')
    }
  }

  // ─── Status toggle handler ───────────────────────────────────────────

  async function handleToggleStatus(employee: Employee) {
    const newStatus = !employee.isActive
    const action = newStatus ? 'activar' : 'desactivar'
    try {
      await updateEmployee.mutateAsync({ id: employee.id, body: { isActive: newStatus } })
      toast.success(`Empleado ${newStatus ? 'activado' : 'desactivado'}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Error al ${action} empleado`)
    }
  }

  // ─── Delete handler ──────────────────────────────────────────────────

  function openDeleteDialog(employee: Employee) {
    setDeletingEmployee(employee)
    setShowDeleteDialog(true)
  }

  async function handleDelete() {
    if (!deletingEmployee) return
    try {
      await deleteEmployee.mutateAsync({ id: deletingEmployee.id })
      toast.success('Empleado eliminado correctamente')
      setShowDeleteDialog(false)
      setDeletingEmployee(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar empleado')
    }
  }

  // ─── Filtered employees ──────────────────────────────────────────────

  const filteredEmployees = employees.filter((emp) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      emp.user.cedula.toLowerCase().includes(q) ||
      (emp.user.fullName || '').toLowerCase().includes(q) ||
      (emp.position || '').toLowerCase().includes(q)
    )
  })

  // ─── Selected role helpers ───────────────────────────────────────────

  function getSelectedRole(roleIdStr: string): Role | undefined {
    if (!roleIdStr) return undefined
    return roles.find((r) => r.id === parseInt(roleIdStr))
  }

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Gestión de Empleados</h2>
          <p className="text-sm text-muted-foreground">
            Administra los empleados de tu establecimiento y asigna roles con permisos
          </p>
        </div>
        <Button onClick={() => { resetCreateForm(); setShowCreateDialog(true) }} className="active:scale-[0.98] transition-all">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Empleado
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por cédula, nombre, cargo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 focus-visible:ring-primary/20 focus-visible:border-primary/40"
        />
      </div>

      {/* Employees Table */}
      <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
        <CardContent className="p-0">
          {employeesLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Users className="h-16 w-16 mb-4 opacity-30 animate-pulse" />
              <p className="text-sm font-medium">No hay empleados</p>
              <p className="text-xs">
                {search ? 'No se encontraron resultados' : 'Crea tu primer empleado'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Cédula</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="hidden md:table-cell">Cargo</TableHead>
                    <TableHead className="hidden sm:table-cell">Rol asignado</TableHead>
                    <TableHead className="w-[100px]">Estado</TableHead>
                    <TableHead className="hidden lg:table-cell w-[110px]">Creado</TableHead>
                    <TableHead className="w-[120px] text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees.map((emp) => (
                    <TableRow key={emp.id} className={`${!emp.isActive ? 'opacity-60' : ''} hover:bg-muted/30 transition-colors`}>
                      <TableCell className="font-mono text-sm">{emp.user.cedula}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{emp.user.fullName || 'Sin nombre'}</p>
                          {emp.user.email && (
                            <p className="text-xs text-muted-foreground hidden lg:block">{emp.user.email}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="outline" className="text-xs">
                          {emp.position || 'Sin cargo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {emp.role ? (
                          <Badge variant={getRoleBadgeVariant(emp.role.name)} className="text-xs">
                            {emp.role.name}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Sin rol
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={emp.isActive}
                          onCheckedChange={() => handleToggleStatus(emp)}
                          aria-label={emp.isActive ? 'Desactivar empleado' : 'Activar empleado'}
                        />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {format(new Date(emp.createdAt), 'dd MMM yyyy', { locale: es })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 active:scale-[0.95] transition-all"
                            onClick={() => openEditDialog(emp)}
                            title="Editar"
                            aria-label="Editar empleado"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive active:scale-[0.95] transition-all"
                            onClick={() => openDeleteDialog(emp)}
                            title="Eliminar"
                            aria-label="Eliminar empleado"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

      {/* ─── Create Dialog ────────────────────────────────────────────── */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => { if (!open) { setShowCreateDialog(false); resetCreateForm() } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5" />
              Nuevo Empleado
            </DialogTitle>
            <DialogDescription>
              Crea una nueva cuenta de empleado y asígnale un rol
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Cédula */}
            <div className="space-y-2">
              <Label htmlFor="create-cedula">Cédula *</Label>
              <Input
                id="create-cedula"
                placeholder="Ej: 1098765432"
                value={createForm.cedula}
                onChange={(e) => setCreateForm((f) => ({ ...f, cedula: e.target.value }))}
                className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
              />
            </div>

            {/* Nombre completo */}
            <div className="space-y-2">
              <Label htmlFor="create-name">Nombre completo *</Label>
              <Input
                id="create-name"
                placeholder="Ej: Juan Pérez"
                value={createForm.fullName}
                onChange={(e) => setCreateForm((f) => ({ ...f, fullName: e.target.value }))}
                className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
              />
            </div>

            {/* Contraseña */}
            <div className="space-y-2">
              <Label htmlFor="create-password">Contraseña *</Label>
              <Input
                id="create-password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
              />
            </div>

            {/* Cargo */}
            <div className="space-y-2">
              <Label>Cargo</Label>
              <Select
                value={createForm.position}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, position: v }))}
              >
                <SelectTrigger className="w-full focus-visible:ring-primary/20 focus-visible:border-primary/40">
                  <SelectValue placeholder="Seleccionar cargo" />
                </SelectTrigger>
                <SelectContent>
                  {POSITIONS.map((pos) => (
                    <SelectItem key={pos.value} value={pos.value}>
                      {pos.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Rol */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                Rol
              </Label>
              <Select
                value={createForm.roleId}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, roleId: v }))}
              >
                <SelectTrigger className="w-full focus-visible:ring-primary/20 focus-visible:border-primary/40">
                  <SelectValue placeholder={rolesLoading ? 'Cargando roles...' : 'Seleccionar rol'} />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={String(role.id)}>
                      <div className="flex items-center gap-1.5">
                        {role.isDefault && (
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />
                        )}
                        <span>{role.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {createForm.roleId && (
                <p className="text-xs text-muted-foreground mt-1">
                  {(() => {
                    const sel = getSelectedRole(createForm.roleId)
                    if (!sel) return null
                    return sel.description || (sel.isDefault ? 'Rol predeterminado para nuevos empleados' : null)
                  })()}
                </p>
              )}
            </div>

            {/* Teléfono + Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="create-phone">Teléfono</Label>
                <Input
                  id="create-phone"
                  placeholder="Ej: 3001234567"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                  className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-email">Email</Label>
                <Input
                  id="create-email"
                  type="email"
                  placeholder="Ej: juan@tienda.com"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
                />
              </div>
            </div>

            <Separator />

            {/* Info about permissions */}
            <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 border border-border/50">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Los permisos se configuran en el módulo de Roles. Asigna un rol para definir los accesos del empleado.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); resetCreateForm() }} className="active:scale-[0.98] transition-all">
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={createEmployee.isPending} className="active:scale-[0.98] transition-all">
              {createEmployee.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crear Empleado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Dialog ──────────────────────────────────────────────── */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { if (!open) { setShowEditDialog(false); setEditingEmployee(null) } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Editar Empleado
            </DialogTitle>
            <DialogDescription>
              {editingEmployee && (
                <>Editando a <strong>{editingEmployee.user.fullName}</strong> — Cédula: {editingEmployee.user.cedula}</>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Status */}
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-3 hover:border-primary/20 transition-colors">
              <div>
                <p className="text-sm font-medium">Estado del empleado</p>
                <p className="text-xs text-muted-foreground">
                  {editActive ? 'El empleado puede iniciar sesión y operar el sistema' : 'El empleado no puede iniciar sesión'}
                </p>
              </div>
              <Switch checked={editActive} onCheckedChange={setEditActive} className="data-[state=checked]:bg-primary" />
            </div>

            {/* Nombre completo */}
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nombre completo</Label>
              <Input
                id="edit-name"
                value={editForm.fullName}
                onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
                className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
              />
            </div>

            {/* Cargo */}
            <div className="space-y-2">
              <Label>Cargo</Label>
              <Select
                value={editForm.position}
                onValueChange={(v) => setEditForm((f) => ({ ...f, position: v }))}
              >
                <SelectTrigger className="w-full focus-visible:ring-primary/20 focus-visible:border-primary/40">
                  <SelectValue placeholder="Seleccionar cargo" />
                </SelectTrigger>
                <SelectContent>
                  {POSITIONS.map((pos) => (
                    <SelectItem key={pos.value} value={pos.value}>
                      {pos.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Comisión */}
            <div className="space-y-2">
              <Label htmlFor="edit-commission">% Comisión por venta</Label>
              <Input
                id="edit-commission"
                type="number"
                min="0"
                max="100"
                placeholder="Ej: 5"
                value={editForm.commissionRate}
                onChange={(e) => setEditForm((f) => ({ ...f, commissionRate: e.target.value }))}
                className="max-w-[140px] focus-visible:ring-primary/20 focus-visible:border-primary/40"
              />
              <p className="text-xs text-muted-foreground">
                Se aplica sobre ventas netas cuando el servicio vendido no tiene su propio % (Servicios &gt; editar servicio).
              </p>
            </div>

            {/* Rol */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                Rol asignado
              </Label>
              <Select
                value={editForm.roleId}
                onValueChange={(v) => setEditForm((f) => ({ ...f, roleId: v }))}
              >
                <SelectTrigger className="w-full focus-visible:ring-primary/20 focus-visible:border-primary/40">
                  <SelectValue placeholder={rolesLoading ? 'Cargando roles...' : 'Seleccionar rol'} />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={String(role.id)}>
                      <div className="flex items-center gap-1.5">
                        {role.isDefault && (
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />
                        )}
                        <span>{role.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editForm.roleId && (
                <p className="text-xs text-muted-foreground mt-1">
                  {(() => {
                    const sel = getSelectedRole(editForm.roleId)
                    if (!sel) return null
                    return sel.description || (sel.isDefault ? 'Rol predeterminado para nuevos empleados' : null)
                  })()}
                </p>
              )}
            </div>

            {/* Teléfono + Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Teléfono</Label>
                <Input
                  id="edit-phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
                />
              </div>
            </div>

            <Separator />

            {/* Current role permissions (read-only) */}
            {editingEmployee?.role && (() => {
              const perms = parsePermissions(editingEmployee.role.permissions)
              const activePerms = Object.entries(perms).filter(([, v]) => v === true).map(([k]) => k)
              return (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      Permisos del rol &quot;{editingEmployee.role.name}&quot;
                    </span>
                    <Badge variant="secondary" className="text-xs ml-auto">
                      {activePerms.length} activos
                    </Badge>
                  </div>
                  <ScrollArea className="max-h-48">
                    <div className="flex flex-wrap gap-1.5">
                      {activePerms.length > 0 ? (
                        activePerms.map((key) => (
                          <Badge key={key} variant="outline" className="text-xs font-normal">
                            {PERMISSION_LABELS[key] || key}
                          </Badge>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">Sin permisos activos</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )
            })()}

            {!editForm.roleId && !editingEmployee?.role && (
              <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 border border-border/50">
                <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Los permisos se configuran en el módulo de Roles. Asigna un rol para definir los accesos del empleado.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditingEmployee(null) }} className="active:scale-[0.98] transition-all">
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateEmployee.isPending} className="active:scale-[0.98] transition-all">
              {updateEmployee.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Dialog ────────────────────────────────────────────── */}
      <AlertDialog open={showDeleteDialog} onOpenChange={(open) => { if (!open) { setShowDeleteDialog(false); setDeletingEmployee(null) } }}>
        <AlertDialogContent className="rounded-xl backdrop-blur-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar empleado?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingEmployee && (
                <>
                  Estás a punto de eliminar a <strong>{deletingEmployee.user.fullName}</strong> (Cédula: {deletingEmployee.user.cedula}).
                  {deletingEmployee.role && (
                    <> Actualmente tiene el rol <strong>{deletingEmployee.role.name}</strong>.</>
                  )}
                  {' '}Esta acción no se puede deshacer. Se eliminará la cuenta de usuario asociada permanentemente.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteEmployee.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteEmployee.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.98] transition-all"
            >
              {deleteEmployee.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
