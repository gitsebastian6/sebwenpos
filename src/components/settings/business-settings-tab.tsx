'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { useUpdateStore } from '@/hooks/api/use-settings'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Loader2, Save, Store, MapPin, Phone, CreditCard } from 'lucide-react'

export function BusinessSettingsTab() {
  const { store, updateStore } = useAuthStore()

  const [storeName, setStoreName] = useState(store?.name || '')
  const [storeAddress, setStoreAddress] = useState(store?.address || '')
  const [storePhone, setStorePhone] = useState(store?.phone || '')
  const [storeCurrency, setStoreCurrency] = useState(store?.currencyCode || 'COP')
  const hasChanges =
    storeName !== (store?.name || '') ||
    storeAddress !== (store?.address || '') ||
    storePhone !== (store?.phone || '') ||
    storeCurrency !== (store?.currencyCode || 'COP')

  const updateStoreMutation = useUpdateStore()
  const saving = updateStoreMutation.isPending

  async function handleSave() {
    if (!store?.id) return
    try {
      const data = await updateStoreMutation.mutateAsync({
        storeId: store.id,
        data: {
          name: storeName,
          legalName: store?.legalName || null,
          nit: store?.nit || null,
          address: storeAddress || null,
          phone: storePhone || null,
          currencyCode: storeCurrency,
        },
      })
      updateStore(data)
      toast.success('Datos del negocio actualizados')
    } catch {
      toast.error('Error al guardar los datos del negocio')
    }
  }

  return (
    <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Store className="h-4 w-4" />
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
              className="pl-9 focus-visible:ring-primary/20 focus-visible:border-primary/40"
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
            className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
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
            className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
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
          onClick={handleSave}
          disabled={saving || !hasChanges || !storeName.trim()}
          className="w-full gap-2 active:scale-[0.98] transition-all"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar Cambios
        </Button>
      </CardContent>
    </Card>
  )
}
