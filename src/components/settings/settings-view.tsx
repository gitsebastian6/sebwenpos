'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Building2, User, Receipt, CreditCard, Percent, Store } from 'lucide-react'
import { BusinessSettingsTab } from '@/components/settings/business-settings-tab'
import { PersonalSettingsTab } from '@/components/settings/personal-settings-tab'
import { InvoiceSettingsTab } from '@/components/settings/invoice-settings-tab'
import { SubscriptionPaymentPanel } from '@/components/settings/subscription-payment-panel'
import { TaxRatesPanel } from '@/components/settings/tax-rates-panel'

export function SettingsView() {
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
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
          <TabsTrigger value="business" className="gap-2">
            <Building2 className="h-4 w-4" />
            <span className="text-xs">Negocio</span>
          </TabsTrigger>
          <TabsTrigger value="personal" className="gap-2">
            <User className="h-4 w-4" />
            <span className="text-xs">Personal</span>
          </TabsTrigger>
          <TabsTrigger value="invoice" className="gap-2">
            <Receipt className="h-4 w-4" />
            <span className="text-xs">Facturación</span>
          </TabsTrigger>
          <TabsTrigger value="subscription" className="gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="text-xs">Suscripción</span>
          </TabsTrigger>
          <TabsTrigger value="taxes" className="gap-2">
            <Percent className="h-4 w-4" />
            <span className="text-xs">IVA</span>
          </TabsTrigger>
        </TabsList>

        {/* ═══ TAB: NEGOCIO ═══ */}
        <TabsContent value="business" className="space-y-6">
          <BusinessSettingsTab />
        </TabsContent>

        {/* ═══ TAB: PERSONAL ═══ */}
        <TabsContent value="personal" className="space-y-6">
          <PersonalSettingsTab />
        </TabsContent>

        {/* ═══ TAB: FACTURACIÓN ═══ */}
        <TabsContent value="invoice" className="space-y-6">
          <InvoiceSettingsTab />
        </TabsContent>

        {/* ═══ TAB: SUSCRIPCIÓN Y PAGO ═══ */}
        <TabsContent value="subscription" className="space-y-6">
          <SubscriptionPaymentPanel />
        </TabsContent>

        {/* ═══ TAB: IMPUESTOS ═══ */}
        <TabsContent value="taxes" className="space-y-6">
          <TaxRatesPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
