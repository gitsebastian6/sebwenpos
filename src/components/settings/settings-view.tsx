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
    <div className="space-y-6">
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
        <TabsList className="w-full flex overflow-x-auto gap-1 md:inline-grid md:grid-cols-5 md:w-auto md:gap-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <TabsTrigger value="business" className="gap-0 shrink-0 md:gap-2 md:shrink">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline text-xs whitespace-nowrap">Negocio</span>
          </TabsTrigger>
          <TabsTrigger value="personal" className="gap-0 shrink-0 md:gap-2 md:shrink">
            <User className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline text-xs whitespace-nowrap">Personal</span>
          </TabsTrigger>
          <TabsTrigger value="invoice" className="gap-0 shrink-0 md:gap-2 md:shrink">
            <Receipt className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline text-xs whitespace-nowrap">Facturación</span>
          </TabsTrigger>
          <TabsTrigger value="subscription" className="gap-0 shrink-0 md:gap-2 md:shrink">
            <CreditCard className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline text-xs whitespace-nowrap">Suscripción</span>
          </TabsTrigger>
          <TabsTrigger value="taxes" className="gap-0 shrink-0 md:gap-2 md:shrink">
            <Percent className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline text-xs whitespace-nowrap">IVA</span>
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
