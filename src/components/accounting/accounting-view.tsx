'use client'

import { useState, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useAccounts } from '@/hooks/api/use-ledger'
import {
  Wallet,
  ArrowRightLeft,
  BarChart3,
  FileText,
  BookOpen,
  Receipt,
} from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { KPIBar } from '@/components/shared/kpi-bar'
import type { LedgerAccount } from './accounting-types'
import { AccountsTab } from './accounts-tab'
import { MovementsTab } from './movements-tab'
import { SummaryTab } from './summary-tab'
import { ReportsTab } from './reports-tab'
import { CashRegisterTab } from './cash-register-tab'
import { ExpensesTab } from './expenses-tab'
import { useQueryClient } from '@tanstack/react-query'

// ─── Component ───────────────────────────────────────────────────────────────

export function AccountingView() {
  const store = useAuthStore((s) => s.store)
  const currencyCode = store?.currencyCode || 'COP'
  const [activeTab, setActiveTab] = useState('cuentas')

  // ─── Shared state ───────────────────────────────────────────────────────
  const [movementsFilterAccount, setMovementsFilterAccount] = useState<number | null>(null)

  // Track if movements tab has consumed the filter to avoid infinite re-triggers
  const movementsFilterConsumed = useRef(false)

  // ─── TanStack Query hooks ──────────────────────────────────────────────
  const { data: accounts = [], isLoading: isLoadingAccounts, refetch: fetchAccounts } = useAccounts(store?.id)
  const queryClient = useQueryClient()

  const handleAccountsChanged = () => {
    queryClient.invalidateQueries({ queryKey: ['accounts'] })
    fetchAccounts()
  }

  // ─── Cross-tab navigation ────────────────────────────────────────────────

  function handleViewMovements(accountId: number) {
    movementsFilterConsumed.current = false
    setMovementsFilterAccount(accountId)
    setActiveTab('movimientos')
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <KPIBar context="accounting" />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6 lg:w-[768px]">
          <TabsTrigger value="cuentas" className="gap-1.5">
            <BookOpen className="h-4 w-4 hidden sm:block" />
            Cuentas
          </TabsTrigger>
          <TabsTrigger value="movimientos" className="gap-1.5">
            <ArrowRightLeft className="h-4 w-4 hidden sm:block" />
            Movimientos
          </TabsTrigger>
          <TabsTrigger value="resumen" className="gap-1.5">
            <BarChart3 className="h-4 w-4 hidden sm:block" />
            Resumen
          </TabsTrigger>
          <TabsTrigger value="informes" className="gap-1.5">
            <FileText className="h-4 w-4 hidden sm:block" />
            Informes
          </TabsTrigger>
          <TabsTrigger value="caja" className="gap-1.5">
            <Wallet className="h-4 w-4 hidden sm:block" />
            Caja
          </TabsTrigger>
          <TabsTrigger value="gastos" className="gap-1.5">
            <Receipt className="h-4 w-4 hidden sm:block" />
            Gastos
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Cuentas */}
        <TabsContent value="cuentas">
          <AccountsTab
            accounts={accounts as any}
            isLoadingAccounts={isLoadingAccounts}
            currencyCode={currencyCode}
            onRefresh={fetchAccounts}
            onViewMovements={handleViewMovements}
          />
        </TabsContent>

        {/* Tab 2: Movimientos */}
        <TabsContent value="movimientos">
          <MovementsTab
            accounts={accounts as any}
            currencyCode={currencyCode}
            initialAccountId={movementsFilterAccount}
          />
        </TabsContent>

        {/* Tab 3: Resumen */}
        <TabsContent value="resumen">
          <SummaryTab
            accounts={accounts as any}
            currencyCode={currencyCode}
          />
        </TabsContent>

        {/* Tab 4: Informes */}
        <TabsContent value="informes">
          <ReportsTab
            accounts={accounts as any}
            currencyCode={currencyCode}
            onAccountsChanged={handleAccountsChanged}
          />
        </TabsContent>

        {/* Tab 5: Caja */}
        <TabsContent value="caja">
          <CashRegisterTab
            currencyCode={currencyCode}
          />
        </TabsContent>

        {/* Tab 6: Gastos */}
        <TabsContent value="gastos">
          <ExpensesTab
            currencyCode={currencyCode}
            onAccountsChanged={handleAccountsChanged}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
