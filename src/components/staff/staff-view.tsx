'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Plus, Search, Edit2, Trash2, UserCheck, UserX, Copy, Shield,
  LayoutDashboard, ShoppingCart, Armchair, Package, Users, Truck,
  ClipboardList, FileText, Warehouse, Calculator, Zap, FileBarChart,
  Settings, UsersRound, Loader2, Crown, CheckCircle2, XCircle,
  KeyRound,
} from 'lucide-react'

import {
  useStaff,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useUpdateRoleName,
  useCreateRole,
  useDeleteRole,
  useResetUserPassword,
  type StaffUser,
  type StaffRole,
} from '@/hooks/api/use-staff'

// ── Module definitions ─────────────────────────────
const MODULE_GROUPS = [
  {
    label: 'VENTAS',
    modules: [
      { key: 'pos', label: 'Punto de Venta', icon: <ShoppingCart className="h-4 w-4" /> },
      { key: 'tables', label: 'Mesas', icon: <Armchair className="h-4 w-4" /> },
      { key: 'orders', label: 'Órdenes', icon: <ClipboardList className="h-4 w-4" /> },
    ],
  },
  {
    label: 'INVENTARIO',
    modules: [
      { key: 'products', label: 'Productos', icon: <Package className="h-4 w-4" /> },
      { key: 'inventory', label: 'Inventario', icon: <Warehouse className="h-4 w-4" /> },
      { key: 'providers', label: 'Proveedores', icon: <Truck className="h-4 w-4" /> },
    ],
  },
  {
    label: 'FINANCIERO',
    modules: [
      { key: 'accounting', label: 'Contabilidad', icon: <Calculator className="h-4 w-4" /> },
      { key: 'invoices', label: 'Facturación', icon: <FileText className="h-4 w-4" /> },
      { key: 'services', label: 'Servicios', icon: <Zap className="h-4 w-4" /> },
    ],
  },
  {
    label: 'GESTIÓN',
    modules: [
      { key: 'customers', label: 'Clientes', icon: <Users className="h-4 w-4" /> },
      { key: 'reports', label: 'Informes', icon: <FileBarChart className="h-4 w-4" /> },
      { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
      { key: 'settings', label: 'Configuración', icon: <Settings className="h-4 w-4" /> },
      { key: 'staff', label: 'Personal', icon: <UsersRound className="h-4 w-4" /> },
    ],
  },
]

// ── Role templates ─────────────────────────────────
const ROLE_TEMPLATES: Record<string, { description: string; permissions: Record<string, boolean> }> = {
  Administrador: {
    description: 'Acceso completo a todos los módulos del sistema',
    permissions: Object.fromEntries(
      MODULE_GROUPS.flatMap(g => g.modules.map(m => [m.key, true]))
    ),
  },
  Cajero: {
    description: 'Gestión de ventas, órdenes y atención al cliente',
    permissions: { pos: true, orders: true, customers: true, dashboard: true },
  },
  Mesero: {
    description: 'Gestión de mesas, comandas y atención en sala',
    permissions: { pos: true, tables: true, orders: true, customers: true, dashboard: true },
  },
  Bartender: {
    description: 'Preparación de bebidas y control de inventario de barra',
    permissions: { pos: true, orders: true, inventory: true, products: true, dashboard: true },
  },
  Contador: {
    description: 'Gestión contable, facturación y reportes financieros',
    permissions: { accounting: true, invoices: true, reports: true, orders: true, dashboard: true },
  },
}

const ROLE_COLORS: Record<string, string> = {
  Administrador: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  Cajero: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
  Mesero: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  Bartender: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  Contador: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
}

const DOC_TYPES = [
  { value: 'CC', label: 'Cédula de Ciudadanía (CC)' },
  { value: 'CE', label: 'Cédula de Extranjería (CE)' },
  { value: 'TI', label: 'Tarjeta de Identidad (TI)' },
  { value: 'PP', label: 'Pasaporte (PP)' },
  { value: 'NIT', label: 'NIT' },
]

// ── Helper: get badge color class for role name ────
function getRoleBadgeClass(name: string | null): string {
  if (!name) return 'bg-muted text-muted-foreground'
  for (const key of Object.keys(ROLE_COLORS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) {
      return ROLE_COLORS[key]
    }
  }
  return 'bg-muted text-muted-foreground'
}

// ── Main Component ─────────────────────────────────
export function StaffView() {
  const { store } = useAuthStore()
  const storeId = store?.id

  // ─── Data fetching with TanStack Query ────────────────────────────────
  const { data, isLoading: loading } = useStaff(storeId)

  const [search, setSearch] = useState('')

  // ─── Mutations ───────────────────────────────────────────────────────
  const createUserMutation = useCreateUser()
  const updateUserMutation = useUpdateUser()
  const deleteUserMutation = useDeleteUser()
  const updateRoleNameMutation = useUpdateRoleName()
  const createRoleMutation = useCreateRole()
  const deleteRoleMutation = useDeleteRole()
  const resetPasswordMutation = useResetUserPassword()

  // Employee dialog
  const [showEmployeeDialog, setShowEmployeeDialog] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<StaffUser | null>(null)
  const [empForm, setEmpForm] = useState({
    documentType: 'CC' as string,
    cedula: '',
    fullName: '',
    phone: '',
    email: '',
    password: '',
    roleId: '' as string,
  })

  // Role dialog
  const [showRoleDialog, setShowRoleDialog] = useState(false)
  const [editingRole, setEditingRole] = useState<StaffRole | null>(null)
  const [roleForm, setRoleForm] = useState({
    name: '',
    description: '',
    permissions: {} as Record<string, boolean>,
    isDefault: false,
  })

  // Reset password dialog
  const [showResetPwdDialog, setShowResetPwdDialog] = useState(false)
  const [resetPwdUser, setResetPwdUser] = useState<StaffUser | null>(null)
  const [newPassword, setNewPassword] = useState('')

  // ── Employee CRUD ───────────────────────────────
  function openAddEmployee() {
    setEditingEmployee(null)
    setEmpForm({ documentType: 'CC', cedula: '', fullName: '', phone: '', email: '', password: '', roleId: data?.roles.find(r => r.isDefault)?.id?.toString() || '' })
    setShowEmployeeDialog(true)
  }

  function openEditEmployee(emp: StaffUser) {
    setEditingEmployee(emp)
    setEmpForm({
      documentType: emp.documentType || 'CC',
      cedula: emp.cedula || '',
      fullName: emp.fullName || '',
      phone: emp.phone,
      email: emp.email || '',
      password: '',
      roleId: emp.roleId?.toString() || '',
    })
    setShowEmployeeDialog(true)
  }

  async function saveEmployee() {
    if (!storeId) return
    if (!empForm.fullName.trim()) { toast.error('El nombre es requerido'); return }
    if (!editingEmployee && (!empForm.cedula.trim() || empForm.cedula.length < 5)) { toast.error('Número de documento mínimo 5 dígitos (usuario de login)'); return }
    if (!editingEmployee && empForm.password.length < 6) { toast.error('Contraseña mínimo 6 caracteres'); return }

    try {
      if (editingEmployee) {
        const body: Record<string, unknown> = {
          fullName: empForm.fullName,
          phone: empForm.phone,
          email: empForm.email || null,
          cedula: empForm.cedula || null,
          documentType: empForm.documentType,
          roleId: empForm.roleId ? parseInt(empForm.roleId) : null,
        }
        await updateUserMutation.mutateAsync({ userId: editingEmployee.id, body })
        toast.success('Empleado actualizado')
      } else {
        await createUserMutation.mutateAsync({
          body: {
            storeId,
            phone: empForm.phone,
            password: empForm.password,
            fullName: empForm.fullName,
            email: empForm.email || null,
            cedula: empForm.cedula || null,
            documentType: empForm.documentType,
            roleId: empForm.roleId ? parseInt(empForm.roleId) : null,
          },
        })
        toast.success('Empleado creado exitosamente')
      }
      setShowEmployeeDialog(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión')
    }
  }

  async function toggleEmployeeActive(emp: StaffUser) {
    if (emp.role === 'OWNER') { toast.error('No se puede desactivar al propietario'); return }
    try {
      await updateUserMutation.mutateAsync({ userId: emp.id, body: { isActive: !emp.isActive } })
      toast.success(emp.isActive ? 'Empleado desactivado' : 'Empleado activado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    }
  }

  async function deleteEmployee(emp: StaffUser) {
    if (emp.role === 'OWNER') { toast.error('No se puede eliminar al propietario'); return }
    try {
      await deleteUserMutation.mutateAsync({ id: emp.id })
      toast.success('Empleado eliminado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  // ── Role CRUD ───────────────────────────────────
  function openAddRole(templateName?: string) {
    setEditingRole(null)
    const template = templateName ? ROLE_TEMPLATES[templateName] : null
    setRoleForm({
      name: templateName || '',
      description: template?.description || '',
      permissions: template?.permissions ? { ...template.permissions } : Object.fromEntries(MODULE_GROUPS.flatMap(g => g.modules.map(m => [m.key, false]))),
      isDefault: false,
    })
    setShowRoleDialog(true)
  }

  function openEditRole(role: StaffRole) {
    setEditingRole(role)
    setRoleForm({
      name: role.name,
      description: role.description || '',
      permissions: { ...role.permissions },
      isDefault: role.isDefault,
    })
    setShowRoleDialog(true)
  }

  function openDuplicateRole(role: StaffRole) {
    setEditingRole(null)
    setRoleForm({
      name: `${role.name} (Copia)`,
      description: role.description || '',
      permissions: { ...role.permissions },
      isDefault: false,
    })
    setShowRoleDialog(true)
  }

  async function saveRole() {
    if (!storeId) return
    if (!roleForm.name.trim()) { toast.error('El nombre del rol es requerido'); return }

    try {
      if (editingRole) {
        await updateRoleNameMutation.mutateAsync({ id: editingRole.id, body: roleForm })
        toast.success('Rol actualizado')
      } else {
        await createRoleMutation.mutateAsync({ body: { storeId, ...roleForm } })
        toast.success('Rol creado exitosamente')
      }
      setShowRoleDialog(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error de conexión')
    }
  }

  async function deleteRole(role: StaffRole) {
    try {
      await deleteRoleMutation.mutateAsync({ id: role.id })
      toast.success('Rol eliminado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  // ── Reset Password ────────────────────────────
  function openResetPassword(emp: StaffUser) {
    setResetPwdUser(emp)
    setNewPassword('')
    setShowResetPwdDialog(true)
  }

  async function handleResetPassword() {
    if (!resetPwdUser) return
    if (newPassword.length < 6) { toast.error('La contraseña debe tener al menos 6 caracteres'); return }

    try {
      await resetPasswordMutation.mutateAsync({ id: resetPwdUser.id, body: { newPassword } })
      toast.success(`Contraseña de ${resetPwdUser.fullName || resetPwdUser.phone} actualizada`)
      setShowResetPwdDialog(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cambiar contraseña')
    }
  }

  function toggleAllPermissions(value: boolean) {
    const newPerms: Record<string, boolean> = {}
    MODULE_GROUPS.flatMap(g => g.modules.map(m => m.key)).forEach(k => { newPerms[k] = value })
    setRoleForm(prev => ({ ...prev, permissions: newPerms }))
  }

  function countEnabledPermissions(perms: Record<string, boolean>): number {
    return Object.values(perms).filter(Boolean).length
  }

  const totalModules = MODULE_GROUPS.reduce((acc, g) => acc + g.modules.length, 0)

  // ── Filtered data ───────────────────────────────
  const filteredUsers = data?.users.filter(u => {
    const q = search.toLowerCase()
    return (
      (u.fullName || '').toLowerCase().includes(q) ||
      (u.phone || '').includes(q) ||
      (u.cedula || '').includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.roleName || '').toLowerCase().includes(q)
    )
  }) ?? []

  // ── Render ──────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Personal y Roles</h2>
        <p className="text-muted-foreground">
          Gestiona los empleados y permisos de acceso a cada módulo del sistema
        </p>
      </div>

      {/* Stats */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <UserCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data.stats.activeUsers}</p>
                <p className="text-xs text-muted-foreground">Empleados activos</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                <Users className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data.stats.totalUsers}</p>
                <p className="text-xs text-muted-foreground">Total empleados</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Shield className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data.stats.totalRoles}</p>
                <p className="text-xs text-muted-foreground">Roles configurados</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="employees" className="w-full">
        <TabsList>
          <TabsTrigger value="employees" className="gap-2">
            <Users className="h-4 w-4" />
            EMPLEADOS ({data?.stats.totalUsers ?? 0})
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-2">
            <Shield className="h-4 w-4" />
            ROLES ({data?.stats.totalRoles ?? 0})
          </TabsTrigger>
        </TabsList>

        {/* ═══════════ EMPLEADOS TAB ═══════════ */}
        <TabsContent value="employees" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre, documento, teléfono..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button onClick={openAddEmployee} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              Agregar Empleado
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="hidden sm:table-cell">Documento</TableHead>
                      <TableHead className="hidden md:table-cell">Teléfono</TableHead>
                      <TableHead className="hidden lg:table-cell">Email</TableHead>
                      <TableHead>Rol</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          {search ? 'No se encontraron resultados' : 'No hay empleados registrados'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((emp) => (
                        <TableRow key={emp.id} className={!emp.isActive ? 'opacity-50' : ''}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
                                {(emp.fullName || emp.phone).slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium">{emp.fullName || 'Sin nombre'}</p>
                                <div className="flex items-center gap-1.5">
                                  {emp.role === 'OWNER' ? (
                                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                      <Crown className="h-3 w-3" /> Propietario
                                    </p>
                                  ) : emp.roleName ? (
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Shield className="h-3 w-3" /> {emp.roleName}
                                      {emp.isActive && (
                                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                                      )}
                                    </p>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Sin rol</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <span className="text-sm">
                              {emp.documentType ? `${emp.documentType} ` : ''}{emp.cedula || '—'}
                            </span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm">{emp.phone}</TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{emp.email || '—'}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={getRoleBadgeClass(emp.roleName)}>
                              {emp.roleName || emp.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={emp.isActive ? 'default' : 'secondary'} className="gap-1">
                              {emp.isActive ? (
                                <><CheckCircle2 className="h-3 w-3" /> Activo</>
                              ) : (
                                <><XCircle className="h-3 w-3" /> Inactivo</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditEmployee(emp)} aria-label="Editar empleado" title="Editar">
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              {emp.role !== 'OWNER' && (
                                <>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openResetPassword(emp)} aria-label="Cambiar contraseña" title="Cambiar contraseña">
                                    <KeyRound className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleEmployeeActive(emp)} aria-label={emp.isActive ? 'Desactivar empleado' : 'Activar empleado'} title={emp.isActive ? 'Desactivar' : 'Activar'}>
                                    {emp.isActive ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteEmployee(emp)} aria-label="Eliminar empleado" title="Eliminar">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════ ROLES TAB ═══════════ */}
        <TabsContent value="roles" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Define qué módulos puede acceder cada rol del sistema
            </p>
            <Button onClick={() => openAddRole()} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              Crear Rol
            </Button>
          </div>

          {/* Templates */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.entries(ROLE_TEMPLATES).map(([name, template]) => {
              const alreadyExists = data?.roles.some(
                r => r.name.toLowerCase() === name.toLowerCase()
              )
              return (
                <Button
                  key={name}
                  variant="outline"
                  disabled={alreadyExists}
                  className={`h-auto py-3 flex flex-col items-center gap-2 relative ${
                    alreadyExists
                      ? 'opacity-50 cursor-not-allowed bg-muted/50 border-muted-foreground/20'
                      : 'hover:border-primary/50 hover:bg-accent/50'
                  }`}
                  onClick={() => !alreadyExists && openAddRole(name)}
                >
                  <Shield className={`h-5 w-5 ${alreadyExists ? 'text-muted-foreground' : ''}`} />
                  <div className="text-center">
                    <p className="text-sm font-medium">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      {countEnabledPermissions(template.permissions)}/{totalModules} módulos
                    </p>
                  </div>
                  {alreadyExists && (
                    <Badge
                      variant="secondary"
                      className="absolute -top-1.5 -right-1.5 text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-0"
                    >
                      <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                      Creado
                    </Badge>
                  )}
                </Button>
              )
            })}
          </div>

          <Separator />

          {/* Role cards */}
          {data && data.roles.length === 0 ? (
            <Card className="p-8 text-center">
              <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">Sin roles configurados</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Crea un rol usando las plantillas o configura uno personalizado
              </p>
              <Button onClick={() => openAddRole()} className="gap-2">
                <Plus className="h-4 w-4" />
                Crear primer rol
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {data?.roles.map((role) => (
                <Card key={role.id} className={!role.isActive ? 'opacity-60' : ''}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{
                          backgroundColor: `var(--color-role-${role.name.toLowerCase()}-bg, hsl(var(--muted)))`,
                        }}>
                          <Shield className={`h-4.5 w-4.5 ${role.isDefault ? 'text-amber-600 dark:text-amber-400' : ''}`} />
                        </div>
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            {role.name}
                            {role.isDefault && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <Crown className="h-3 w-3" /> Predeterminado
                              </Badge>
                            )}
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {role.description || 'Sin descripción'}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditRole(role)} aria-label="Editar rol" title="Editar">
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDuplicateRole(role)} aria-label="Duplicar rol" title="Duplicar">
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {role.userCount === 0 && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteRole(role)} aria-label="Eliminar rol" title="Eliminar">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    {/* Permissions summary */}
                    <div className="space-y-2">
                      {MODULE_GROUPS.map((group) => {
                        const groupPerms = group.modules.filter(m => role.permissions[m.key])
                        if (groupPerms.length === 0) return null
                        return (
                          <div key={group.label} className="flex flex-wrap gap-1">
                            <span className="text-xs font-medium text-muted-foreground mr-1">{group.label}:</span>
                            {groupPerms.map(m => (
                              <Badge key={m.key} variant="secondary" className="text-xs gap-0.5">
                                {m.icon}
                                {m.label}
                              </Badge>
                            ))}
                          </div>
                        )
                      })}
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{countEnabledPermissions(role.permissions)} de {totalModules} módulos activos</span>
                      <span>{role.userCount} usuario(s) asignados</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ═══════════ EMPLOYEE DIALOG ═══════════ */}
      <Dialog open={showEmployeeDialog} onOpenChange={setShowEmployeeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? 'Editar Empleado' : 'Agregar Empleado'}</DialogTitle>
            <DialogDescription>
              {editingEmployee
                ? 'Modifica los datos del empleado. Sus permisos se actualizarán al iniciar sesión.'
                : 'Completa los datos para crear un nuevo empleado con acceso al sistema'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <Label htmlFor="emp-docType">Tipo Doc.</Label>
                <Select value={empForm.documentType} onValueChange={v => setEmpForm(p => ({ ...p, documentType: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map(dt => (
                      <SelectItem key={dt.value} value={dt.value}>{dt.value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label htmlFor="emp-cedula">N° Documento (login) {editingEmployee ? '' : '*'}</Label>
                <Input
                  id="emp-cedula"
                  placeholder="1098765432"
                  value={empForm.cedula}
                  onChange={(e) => setEmpForm(p => ({ ...p, cedula: e.target.value }))}
                  className="mt-1"
                  disabled={!!editingEmployee}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {editingEmployee ? 'Documento no modificable' : 'Este será su usuario para iniciar sesión'}
                </p>
              </div>
            </div>
            <div>
              <Label htmlFor="emp-name">Nombre Completo *</Label>
              <Input
                id="emp-name"
                placeholder="Juan Pérez"
                value={empForm.fullName}
                onChange={(e) => setEmpForm(p => ({ ...p, fullName: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="emp-phone">Teléfono (para recuperar contraseña)</Label>
              <Input
                id="emp-phone"
                type="tel"
                placeholder="300 1234567"
                value={empForm.phone}
                onChange={(e) => setEmpForm(p => ({ ...p, phone: e.target.value }))}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Se usa para recuperar la contraseña si la olvida</p>
            </div>
            <div>
              <Label htmlFor="emp-email">Email</Label>
              <Input
                id="emp-email"
                type="email"
                placeholder="correo@ejemplo.com"
                value={empForm.email}
                onChange={(e) => setEmpForm(p => ({ ...p, email: e.target.value }))}
                className="mt-1"
              />
            </div>
            {!editingEmployee ? (
              <div>
                <Label htmlFor="emp-password">Contraseña *</Label>
                <Input
                  id="emp-password"
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={empForm.password}
                  onChange={(e) => setEmpForm(p => ({ ...p, password: e.target.value }))}
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">El empleado usará esta contraseña para iniciar sesión</p>
              </div>
            ) : null}
            <div>
              <Label>Rol (permisos de acceso)</Label>
              <Select value={empForm.roleId} onValueChange={v => setEmpForm(p => ({ ...p, roleId: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Sin rol asignado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin rol asignado (acceso limitado)</SelectItem>
                  {data?.roles.filter(r => r.isActive).map(role => (
                    <SelectItem key={role.id} value={role.id.toString()}>
                      <span className="flex items-center gap-2">
                        <Shield className="h-3.5 w-3.5" />
                        {role.name}
                        <span className="text-xs text-muted-foreground">
                          ({countEnabledPermissions(role.permissions)} módulos)
                        </span>
                        {role.isDefault && <span className="text-xs text-amber-500">(predet.)</span>}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                El rol define qué módulos puede ver el empleado al iniciar sesión
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmployeeDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={saveEmployee} disabled={createUserMutation.isPending || updateUserMutation.isPending} className="gap-2">
              {(createUserMutation.isPending || updateUserMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingEmployee ? 'Guardar Cambios' : 'Crear Empleado y Habilitar Login'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ ROLE DIALOG ═══════════ */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Editar Rol' : 'Crear Rol'}</DialogTitle>
            <DialogDescription>
              Define los permisos de acceso del rol para cada módulo del sistema
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="role-name">Nombre del Rol *</Label>
                <Input
                  id="role-name"
                  placeholder="Ej: Cajero, Mesero..."
                  value={roleForm.name}
                  onChange={(e) => setRoleForm(p => ({ ...p, name: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  checked={roleForm.isDefault}
                  onCheckedChange={v => setRoleForm(p => ({ ...p, isDefault: v }))}
                />
                <div>
                  <Label className="cursor-pointer">Rol predeterminado</Label>
                  <p className="text-xs text-muted-foreground">Se asigna automáticamente a nuevos empleados</p>
                </div>
              </div>
            </div>
            <div>
              <Label htmlFor="role-desc">Descripción</Label>
              <Textarea
                id="role-desc"
                placeholder="Describe las funciones de este rol..."
                value={roleForm.description}
                onChange={(e) => setRoleForm(p => ({ ...p, description: e.target.value }))}
                className="mt-1"
                rows={2}
              />
            </div>

            <Separator />

            {/* Permissions */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Permisos por Módulo
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    {countEnabledPermissions(roleForm.permissions)} de {totalModules} módulos activos
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => toggleAllPermissions(true)} className="text-xs gap-1 h-7">
                    <CheckCircle2 className="h-3 w-3" /> Activar todo
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => toggleAllPermissions(false)} className="text-xs gap-1 h-7">
                    <XCircle className="h-3 w-3" /> Desactivar todo
                  </Button>
                </div>
              </div>

              {MODULE_GROUPS.map((group) => (
                <div key={group.label} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {group.modules.map((mod) => (
                      <div
                        key={mod.key}
                        className="flex items-center justify-between p-2.5 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="text-muted-foreground shrink-0">{mod.icon}</div>
                          <Label className="text-sm cursor-pointer truncate">{mod.label}</Label>
                        </div>
                        <Switch
                          checked={roleForm.permissions[mod.key] === true}
                          onCheckedChange={(v) =>
                            setRoleForm(p => ({
                              ...p,
                              permissions: { ...p.permissions, [mod.key]: v },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRoleDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={saveRole} disabled={createRoleMutation.isPending || updateRoleNameMutation.isPending} className="gap-2">
              {(createRoleMutation.isPending || updateRoleNameMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingRole ? 'Guardar Cambios' : 'Crear Rol'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ RESET PASSWORD DIALOG ═══════════ */}
      <Dialog open={showResetPwdDialog} onOpenChange={setShowResetPwdDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cambiar Contraseña</DialogTitle>
            <DialogDescription>
              Establece una nueva contraseña para {resetPwdUser?.fullName || resetPwdUser?.phone || 'este empleado'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                {(resetPwdUser?.fullName || resetPwdUser?.phone || 'U').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-sm">{resetPwdUser?.fullName || 'Sin nombre'}</p>
                <p className="text-xs text-muted-foreground">{resetPwdUser?.phone}</p>
              </div>
            </div>
            <div>
              <Label htmlFor="new-password">Nueva Contraseña *</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                El empleado usará esta nueva contraseña para iniciar sesión
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetPwdDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleResetPassword} disabled={resetPasswordMutation.isPending || newPassword.length < 6} className="gap-2">
              {resetPasswordMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <KeyRound className="h-4 w-4" />
              Actualizar Contraseña
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
