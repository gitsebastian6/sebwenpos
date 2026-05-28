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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Save, Store, MapPin, Phone, CreditCard, Globe, MessageCircle, ExternalLink } from 'lucide-react'
import { Switch } from '@/components/ui/switch'

export function BusinessSettingsTab() {
  const { store, updateStore } = useAuthStore()

  const [storeName, setStoreName] = useState(store?.name || '')
  const [storeAddress, setStoreAddress] = useState(store?.address || '')
  const [storePhone, setStorePhone] = useState(store?.phone || '')
  const [storeCurrency, setStoreCurrency] = useState(store?.currencyCode || 'COP')

  // Tienda Virtual
  const [storeSlug, setStoreSlug] = useState((store as any)?.storeSlug || '')
  const [storeDescription, setStoreDescription] = useState((store as any)?.storeDescription || '')
  const [storeWhatsapp, setStoreWhatsapp] = useState((store as any)?.storeWhatsapp || '')
  const [storeActive, setStoreActive] = useState((store as any)?.storeActive || false)

  const hasChanges =
    storeName !== (store?.name || '') ||
    storeAddress !== (store?.address || '') ||
    storePhone !== (store?.phone || '') ||
    storeCurrency !== (store?.currencyCode || 'COP') ||
    storeSlug !== ((store as any)?.storeSlug || '') ||
    storeDescription !== ((store as any)?.storeDescription || '') ||
    storeWhatsapp !== ((store as any)?.storeWhatsapp || '') ||
    storeActive !== ((store as any)?.storeActive || false)

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
          storeSlug: storeSlug || null,
          storeDescription: storeDescription || null,
          storeWhatsapp: storeWhatsapp || null,
          storeActive,
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
          <Select value={storeCurrency} onValueChange={setStoreCurrency}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar moneda" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="COP">COP - Peso Colombiano</SelectItem>
              <SelectItem value="MXN">MXN - Peso Mexicano</SelectItem>
              <SelectItem value="USD">USD - Dólar Americano</SelectItem>
              <SelectItem value="EUR">EUR - Euro</SelectItem>
              <SelectItem value="ARS">ARS - Peso Argentino</SelectItem>
              <SelectItem value="PEN">PEN - Sol Peruano</SelectItem>
              <SelectItem value="CLP">CLP - Peso Chileno</SelectItem>
              <SelectItem value="VEB">VEB - Bolívar</SelectItem>
              <SelectItem value="BRL">BRL - Real Brasileño</SelectItem>
            </SelectContent>
          </Select>
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

    {/* ─── Tienda Virtual ─── */}
    <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Tienda Virtual
        </CardTitle>
        <CardDescription>
          Activa tu tienda en línea para que tus clientes hagan pedidos por WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border/50 p-4">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Tienda Virtual Activa</Label>
            <p className="text-xs text-muted-foreground">
              Tus clientes pueden ver tus productos y pedir por WhatsApp
            </p>
          </div>
          <Switch
            checked={storeActive}
            onCheckedChange={setStoreActive}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="store-slug">
            <span className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              URL de tu tienda
            </span>
          </Label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground whitespace-nowrap">/tienda/</span>
            <Input
              id="store-slug"
              value={storeSlug}
              onChange={(e) => setStoreSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="mi-tienda"
              className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Solo letras minúsculas, números y guiones. Ej: mi-negocio
          </p>
          {storeSlug && (
            <a
              href={`/tienda/${storeSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Ver tienda virtual
            </a>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="store-whatsapp-virtual">
            <span className="flex items-center gap-1.5">
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp para pedidos
            </span>
          </Label>
          <Input
            id="store-whatsapp-virtual"
            value={storeWhatsapp}
            onChange={(e) => setStoreWhatsapp(e.target.value)}
            placeholder="3001234567"
            className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
          />
          <p className="text-xs text-muted-foreground">
            Número de WhatsApp donde llegan los pedidos de la tienda virtual
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="store-description-virtual">Descripción de la tienda</Label>
          <Input
            id="store-description-virtual"
            value={storeDescription}
            onChange={(e) => setStoreDescription(e.target.value)}
            placeholder="Ej: Los mejores productos de la zona, entrega a domicilio"
            className="focus-visible:ring-primary/20 focus-visible:border-primary/40"
            maxLength={500}
          />
        </div>
      </CardContent>
    </Card>
  )
}
