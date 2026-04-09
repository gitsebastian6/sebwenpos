'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Store,
  User,
  Receipt,
  Shield,
  Loader2,
  Save,
  Building2,
  Phone,
  MapPin,
  FileText,
  CreditCard,
  BadgeCheck,
} from 'lucide-react'

export function SettingsView() {
  const { user, store, updateStore, updateUser } = useAuthStore()

  // ── Store form state ──
  const [storeName, setStoreName] = useState(store?.name || '')
  const [storeLegalName, setStoreLegalName] = useState(store?.legalName || '')
  const [storeNIT, setStoreNIT] = useState(store?.nit || '')
  const [storeAddress, setStoreAddress] = useState(store?.address || '')
  const [storePhone, setStorePhone] = useState(store?.phone || '')
  const [storeCurrency, setStoreCurrency] = useState(store?.currencyCode || 'COP')
  const [storeSaving, setStoreSaving] = useState(false)

  // ── User form state ──
  const [userFullName, setUserFullName] = useState(user?.fullName || '')
  const [userEmail, setUserEmail] = useState(user?.email || '')
  const [userCedula, setUserCedula] = useState(user?.cedula || '')
  const [userSaving, setUserSaving] = useState(false)

  // ── Save store ──
  async function handleSaveStore() {
    if (!store?.id) return
    setStoreSaving(true)
    try {
      const res = await fetch(`/api/stores?storeId=${store.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: storeName,
          legalName: storeLegalName || null,
          nit: storeNIT || null,
          address: storeAddress || null,
          phone: storePhone || null,
          currencyCode: storeCurrency,
        }),
      })
      if (!res.ok) throw new Error('Error al guardar')
      const data = await res.json()
      updateStore(data)
      toast.success('Datos del negocio actualizados')
    } catch {
      toast.error('Error al guardar los datos del negocio')
    } finally {
      setStoreSaving(false)
    }
  }

  // ── Save user ──
  async function handleSaveUser() {
    if (!user?.id) return
    setUserSaving(true)
    try {
      const res = await fetch(`/api/users?userId=${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: userFullName,
          email: userEmail || null,
          cedula: userCedula || null,
        }),
      })
      if (!res.ok) throw new Error('Error al guardar')
      const data = await res.json()
      updateUser(data)
      toast.success('Datos personales actualizados')
    } catch {
      toast.error('Error al guardar datos personales')
    } finally {
      setUserSaving(false)
    }
  }

  const hasStoreChanges =
    storeName !== (store?.name || '') ||
    storeLegalName !== (store?.legalName || '') ||
    storeNIT !== (store?.nit || '') ||
    storeAddress !== (store?.address || '') ||
    storePhone !== (store?.phone || '') ||
    storeCurrency !== (store?.currencyCode || 'COP')

  const hasUserChanges =
    userFullName !== (user?.fullName || '') ||
    userEmail !== (user?.email || '') ||
    userCedula !== (user?.cedula || '')

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Store className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Configuración</h2>
          <p className="text-sm text-muted-foreground">Administra tu negocio y preferencias</p>
        </div>
      </div>

      <Tabs defaultValue="business" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
          <TabsTrigger value="business" className="gap-2">
            <Building2 className="h-4 w-4 hidden sm:inline-block" />
            Negocio
          </TabsTrigger>
          <TabsTrigger value="personal" className="gap-2">
            <User className="h-4 w-4 hidden sm:inline-block" />
            Personal
          </TabsTrigger>
          <TabsTrigger value="invoice" className="gap-2">
            <Receipt className="h-4 w-4 hidden sm:inline-block" />
            Facturación
          </TabsTrigger>
        </TabsList>

        {/* ═══ TAB: NEGOCIO ═══ */}
        <TabsContent value="business" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Información del Negocio
              </CardTitle>
              <CardDescription>
                Datos que se muestran en la aplicación y en los tickets de venta
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="store-name">
                  Nombre del Negocio <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Store className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="store-name"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="pl-9"
                    placeholder="Ej: Bar La Terraza"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="store-address">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    Dirección
                  </span>
                </Label>
                <Input
                  id="store-address"
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  placeholder="Ej: Cra 15 #82-34, Bogotá"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="store-phone">
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    Teléfono del Negocio
                  </span>
                </Label>
                <Input
                  id="store-phone"
                  value={storePhone}
                  onChange={(e) => setStorePhone(e.target.value)}
                  placeholder="Ej: 601-3456789"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="store-currency">
                  <span className="flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5" />
                    Moneda
                  </span>
                </Label>
                <select
                  id="store-currency"
                  value={storeCurrency}
                  onChange={(e) => setStoreCurrency(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="COP">COP - Peso Colombiano</option>
                  <option value="MXN">MXN - Peso Mexicano</option>
                  <option value="USD">USD - Dólar Americano</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="ARS">ARS - Peso Argentino</option>
                  <option value="PEN">PEN - Sol Peruano</option>
                  <option value="CLP">CLP - Peso Chileno</option>
                  <option value="VEB">VEB - Bolívar</option>
                  <option value="BRL">BRL - Real Brasileño</option>
                </select>
              </div>

              <Button
                onClick={handleSaveStore}
                disabled={storeSaving || !hasStoreChanges || !storeName.trim()}
                className="w-full gap-2"
              >
                {storeSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar Cambios
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: PERSONAL ═══ */}
        <TabsContent value="personal" className="space-y-6">
          <Card>
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
              <div className="rounded-lg border p-3 bg-muted/30 mb-2">
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
                />
                <p className="text-xs text-muted-foreground">
                  Número de documento de identidad del propietario o responsable
                </p>
              </div>

              <Separator />

              <div className="rounded-lg border p-3 bg-muted/30">
                <div className="flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Rol:</span>
                  <span className="font-medium">{user?.role === 'OWNER' ? 'Propietario' : 'Empleado'}</span>
                </div>
              </div>

              <Button
                onClick={handleSaveUser}
                disabled={userSaving || !hasUserChanges || !userFullName.trim()}
                className="w-full gap-2"
              >
                {userSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar Cambios
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: FACTURACIÓN ═══ */}
        <TabsContent value="invoice" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Datos de Facturación
              </CardTitle>
              <CardDescription>
                Información que aparece en las facturas y tickets impresos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="legal-name">
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" />
                    Razón Social / Nombre Legal
                  </span>
                </Label>
                <Input
                  id="legal-name"
                  value={storeLegalName}
                  onChange={(e) => setStoreLegalName(e.target.value)}
                  placeholder="Ej: Terraza S.A.S."
                />
                <p className="text-xs text-muted-foreground">
                  Nombre legal del negocio registrado (diferente al nombre comercial si aplica)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="store-nit">
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    NIT
                  </span>
                </Label>
                <Input
                  id="store-nit"
                  value={storeNIT}
                  onChange={(e) => setStoreNIT(e.target.value)}
                  placeholder="Ej: 900.123.456-7"
                />
                <p className="text-xs text-muted-foreground">
                  Número de Identificación Tributaria para facturación
                </p>
              </div>

              <Separator />

              {/* Preview de como se vería en el ticket */}
              <div>
                <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  Vista previa del encabezado de factura
                </p>
                <div className="border-2 border-dashed rounded-lg p-4 bg-muted/20 font-mono text-xs space-y-1">
                  <div className="text-center">
                    <p className="font-bold text-sm uppercase tracking-wider">
                      {storeName || 'Nombre del Negocio'}
                    </p>
                    {storeLegalName && (
                      <p className="text-[10px] text-muted-foreground">{storeLegalName}</p>
                    )}
                  </div>
                  {storeNIT && <p className="text-center">NIT: {storeNIT}</p>}
                  {storeAddress && <p className="text-center">{storeAddress}</p>}
                  {storePhone && <p className="text-center">Tel: {storePhone}</p>}
                  {!storeNIT && !storeAddress && !storePhone && (
                    <p className="text-center text-muted-foreground italic">
                      Configura los datos de facturación para ver la vista previa
                    </p>
                  )}
                </div>
              </div>

              <Button
                onClick={handleSaveStore}
                disabled={storeSaving || !hasStoreChanges}
                className="w-full gap-2"
              >
                {storeSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar Datos de Facturación
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
