'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { playError } from '@/lib/pos-sounds'
import { toast } from 'sonner'
import { useCreateSession, useUpdateSession } from '@/hooks/api/use-tables'
import { useTablesSync } from '@/hooks/use-tables-sync'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Plus,
  Users,
  Clock,
  DollarSign,
  Trash2,
  Wrench,
  DoorOpen,
  Loader2,
  Power,
  PowerOff,
} from 'lucide-react'
import { KPIBar } from '@/components/shared/kpi-bar'
import { formatCurrency } from '@/lib/auth'
import {
  useTablesData,
  ZONE_STYLES,
  formatTimeElapsed,
  type BarTable,
} from '@/hooks/use-tables-data'
import { OpenSessionDialog, CloseSessionDialog, AddTableDialog, DeleteTableDialog, PaymentDialog } from './table-session-dialog'
import { ComandaPanel } from './comanda-panel'

// ─── Main Component ──────────────────────────────────────────────────────────

export function TablesView() {
  const { store } = useAuthStore()

  // ── Real-time sync ──
  useTablesSync(store?.id ?? null)

  // ── Data hook ──
  const {
    tables,
    tablesLoading,
    session,
    sessionLoading,
    setSession,
    customers,
    customersLoading,
    products,
    productsLoading,
    services,
    categories,
    openCashRegisters,
    selectedCashRegisterId,
    setSelectedCashRegisterId,
    fetchTables,
    fetchSession,
    fetchCustomers,
    fetchProducts,
    fetchCategories,
    fetchServices,
    fetchOpenCashRegisters,
    togglingTableId,
    handleToggleTableActive,
    deletingTableId,
    setDeletingTableId,
    deleteTableSaving,
    handleConfirmDeleteTable,
    handleDeleteClick,
    addTableSaving,
    handleCreateTable,
  } = useTablesData()

  // ── UI state ──
  const [selectedTable, setSelectedTable] = useState<BarTable | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [addTableOpen, setAddTableOpen] = useState(false)
  const [openSessionOpen, setOpenSessionOpen] = useState(false)
  const [closeSessionOpen, setCloseSessionOpen] = useState(false)
  const [closeSessionSaving, setCloseSessionSaving] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [openSessionSaving, setOpenSessionSaving] = useState(false)

  // ── Item selection state (lifted from comanda panel) ──
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([])

  // ── Time ticker ──
  const [tick, setTick] = useState(0)
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    tickerRef.current = setInterval(() => {
      setTick((t) => t + 1)
    }, 60_000)
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current)
    }
  }, [])

  // ─── Auto-load products when sheet opens with an active session ──
  useEffect(() => {
    if (sheetOpen && session?.status === 'OPEN') {
      fetchProducts()
      fetchCategories()
      fetchServices()
    }
  }, [sheetOpen, session?.status, fetchProducts, fetchCategories, fetchServices])

  // ─── Selection Handlers ────────────────────────────────────────────────

  function toggleItemSelection(itemId: number) {
    setSelectedItemIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    )
  }

  function selectAllPayable() {
    if (!session) return
    const payable = session.comandaItems?.filter(
      (item) => item.status === 'PENDING' || item.status === 'SERVED'
    ).map((item) => item.id) ?? []
    setSelectedItemIds(payable)
  }

  // ─── Computed values ───────────────────────────────────────────────────

  const selectedItemsTotal = session?.comandaItems
    ?.filter((item) => selectedItemIds.includes(item.id))
    .reduce((sum, item) => sum + item.total, 0) ?? 0

  const computedDiscount = 0 // Discount is managed internally by PaymentDialog

  const hasUnpaidItems = session?.comandaItems?.some(
    (item) => item.status === 'PENDING' || item.status === 'SERVED'
  ) ?? false

  const pendingItems = session?.comandaItems?.filter((item) => item.status === 'PENDING') ?? []
  const selectedPendingItems = pendingItems.filter((item) => selectedItemIds.includes(item.id))
  const servedItems = session?.comandaItems?.filter((item) => item.status === 'SERVED') ?? []
  const selectedServedItems = servedItems.filter((item) => selectedItemIds.includes(item.id))

  const canServe = selectedPendingItems.length > 0
  const canPay = selectedItemIds.length > 0 && (selectedPendingItems.length > 0 || selectedServedItems.length > 0)

  const taxEstimate = useMemo(() => {
    const breakdownMap = new Map<string, { name: string; code: string; rate: number; base: number; amount: number }>()
    let totalTax = 0

    const tableItems = session?.comandaItems
      ?.filter((item) => selectedItemIds.includes(item.id)) ?? []

    tableItems.forEach(item => {
      if (!item.productId) return
      const product = products.find(p => p.id === item.productId)
      const tr = product?.taxRate
      if (!tr) return

      const totalRow = item.total
      let base = totalRow
      let tax = 0

      if (tr.code === '03' || tr.code === '04') {
        base = totalRow
        tax = 0
      } else if (tr.rateType === 'PERCENTAGE' && tr.rate > 0) {
        base = Math.round(totalRow / (1 + tr.rate / 100))
        tax = totalRow - base
      }

      totalTax += tax
      const existing = breakdownMap.get(tr.code)
      if (existing) {
        existing.base += base
        existing.amount += tax
      } else {
        breakdownMap.set(tr.code, { name: tr.name, code: tr.code, rate: tr.rate, base, amount: tax })
      }
    })

    return { breakdown: Array.from(breakdownMap.values()), totalTax }
  }, [session?.comandaItems, selectedItemIds, products])

  // ─── Handlers ──────────────────────────────────────────────────────────

  async function handleTableClick(table: BarTable) {
    if (!table.isActive) return
    if (table.activeSession) {
      setSelectedTable(table)
      setSheetOpen(true)
      setSelectedItemIds([])
      await fetchSession(table.activeSession.id)
      fetchProducts()
      fetchCategories()
      fetchServices()
    } else {
      setSelectedTable(table)
      setOpenSessionOpen(true)
      fetchCustomers()
    }
  }

  const createSessionMutation = useCreateSession()
  const updateSessionMutation = useUpdateSession()

  async function handleOpenSession(data: { guests: number; customerId: number | null; notes: string }) {
    if (!store?.id || !selectedTable) return

    setOpenSessionSaving(true)
    try {
      const body: Record<string, unknown> = {
        storeId: store.id,
        barTableId: selectedTable.id,
        guests: data.guests,
      }
      if (data.customerId) {
        body.customerId = data.customerId
      }
      if (data.notes) {
        body.notes = data.notes
      }

      await createSessionMutation.mutateAsync(body)

      toast.success(`Mesa ${selectedTable.number} abierta`)
      setOpenSessionOpen(false)
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al abrir mesa')
    } finally {
      setOpenSessionSaving(false)
    }
  }

  async function handleCloseSession() {
    if (!session) return

    const unpaidItems = session.comandaItems?.filter(
      (item) => item.status === 'PENDING' || item.status === 'SERVED'
    ) ?? []

    if (unpaidItems.length > 0) {
      toast.error('Hay items sin pagar. Por favor cobre todos los items antes de cerrar.')
      return
    }

    setCloseSessionSaving(true)
    try {
      await updateSessionMutation.mutateAsync({ id: session.id, action: 'CLOSE' })

      toast.success(`Mesa ${session.barTable.number} cerrada`)
      setCloseSessionOpen(false)
      setSheetOpen(false)
      setSession(null)
      setSelectedTable(null)
      setSelectedItemIds([])
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al cerrar mesa')
    } finally {
      setCloseSessionSaving(false)
    }
  }

  function handlePaymentSave() {
    setSelectedItemIds([])
    if (session) {
      fetchSession(session.id)
    }
    fetchTables()
    fetchOpenCashRegisters()
  }

  function handleSheetClose(open: boolean) {
    if (!open) {
      setSession(null)
      setSelectedTable(null)
      setSelectedItemIds([])
    }
    setSheetOpen(open)
  }

  // Force re-render with tick
  const _tick = tick

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <KPIBar context="tables" />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4 sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Mesas y Comandas</h2>
            <p className="text-sm text-muted-foreground">
              {tablesLoading ? 'Cargando...' : `${tables.length} mesa${tables.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <Button className="gap-2 shrink-0 active:scale-[0.98] transition-all" onClick={() => {
          setAddTableOpen(true)
        }} >
          <Plus className="h-4 w-4" />
          Agregar Mesa
        </Button>
      </div>

      {/* ── Status Summary ──────────────────────────────────────────────── */}
      {!tablesLoading && tables.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-1.5 text-sm hover:shadow-sm transition-all duration-200">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-muted-foreground">Disponibles:</span>
            <span className="font-semibold">
              {tables.filter((t) => t.isActive && !t.activeSession).length}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-1.5 text-sm hover:shadow-sm transition-all duration-200">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span className="text-muted-foreground">Ocupadas:</span>
            <span className="font-semibold">
              {tables.filter((t) => t.isActive && !!t.activeSession).length}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-1.5 text-sm hover:shadow-sm transition-all duration-200">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <span className="text-muted-foreground">Mantenimiento:</span>
            <span className="font-semibold">
              {tables.filter((t) => !t.isActive).length}
            </span>
          </div>
        </div>
      )}

      {/* ── Floor Plan Grid ─────────────────────────────────────────────── */}
      {tablesLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-16" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : tables.length === 0 ? (
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="h-16 w-16 text-muted-foreground/40 mb-4 animate-pulse" />
            <p className="text-muted-foreground font-medium">No hay mesas creadas</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Crea tu primera mesa para comenzar
            </p>
            <Button className="mt-4 gap-2 active:scale-[0.98] transition-all"
              onClick={() => setAddTableOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Crear Mesa
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              currencyCode={store?.currencyCode}
              onClick={() => handleTableClick(table)}
              onDelete={(e) => handleDeleteClick(table, e)}
              onToggleActive={(e) => handleToggleTableActive(table, e)}
              togglingTableId={togglingTableId}
            />
          ))}
        </div>
      )}

      {/* ─── DIALOGS ────────────────────────────────────────────────────── */}

      <OpenSessionDialog
        open={openSessionOpen}
        onOpenChange={setOpenSessionOpen}
        selectedTable={selectedTable}
        customers={customers}
        customersLoading={customersLoading}
        onOpenSession={handleOpenSession}
        saving={openSessionSaving}
      />

      <AddTableDialog
        open={addTableOpen}
        onOpenChange={setAddTableOpen}
        saving={addTableSaving}
        onCreate={handleCreateTable}
      />

      <PaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        session={session}
        selectedItemIds={selectedItemIds}
        selectedItemsTotal={selectedItemsTotal}
        computedDiscount={computedDiscount}
        taxEstimate={taxEstimate}
        openCashRegisters={openCashRegisters}
        selectedCashRegisterId={selectedCashRegisterId}
        setSelectedCashRegisterId={setSelectedCashRegisterId}
        onSave={handlePaymentSave}
      />

      <CloseSessionDialog
        open={closeSessionOpen}
        onOpenChange={setCloseSessionOpen}
        session={session}
        hasUnpaidItems={hasUnpaidItems}
        saving={closeSessionSaving}
        onClose={handleCloseSession}
      />

      <DeleteTableDialog
        open={!!deletingTableId}
        onOpenChange={(open) => { if (!open) setDeletingTableId(null) }}
        tables={tables}
        deletingTableId={deletingTableId}
        saving={deleteTableSaving}
        onConfirm={handleConfirmDeleteTable}
      />

      {/* ─── COMANDA PANEL (SHEET) ─────────────────────────────────────── */}

      <ComandaPanel
        open={sheetOpen}
        onOpenChange={handleSheetClose}
        selectedTable={selectedTable}
        session={session}
        sessionLoading={sessionLoading}
        products={products}
        productsLoading={productsLoading}
        services={services}
        categories={categories}
        tick={tick}
        selectedItemIds={selectedItemIds}
        onToggleItemSelection={toggleItemSelection}
        onSelectAllPayable={selectAllPayable}
        selectedItemsTotal={selectedItemsTotal}
        hasUnpaidItems={hasUnpaidItems}
        canServe={canServe}
        canPay={canPay}
        selectedPendingItems={selectedPendingItems}
        fetchSession={fetchSession}
        fetchProducts={fetchProducts}
        fetchTables={fetchTables}
        onOpenPayment={() => setPaymentOpen(true)}
        onCloseSession={() => setCloseSessionOpen(true)}
      />

      {/* tick ref for reactivity */}
      <span className="hidden">{_tick}</span>
    </div>
  )
}

// ─── Table Card Sub-Component ────────────────────────────────────────────────

function TableCard({
  table,
  currencyCode,
  onClick,
  onDelete,
  onToggleActive,
  togglingTableId,
}: {
  table: BarTable
  currencyCode?: string
  onClick: () => void
  onDelete: (e: React.MouseEvent) => void
  onToggleActive: (e: React.MouseEvent) => void
  togglingTableId: number | null
}) {
  const zoneStyle = ZONE_STYLES[table.zone] ?? ZONE_STYLES.PRINCIPAL

  const isOccupied = !!table.activeSession
  const isMaintenance = !table.isActive
  const isAvailable = table.isActive && !isOccupied

  let statusColor = 'bg-emerald-500'
  let statusLabel = 'Disponible'
  let statusTextColor = 'text-emerald-600 dark:text-emerald-400'
  let borderHover = 'hover:border-emerald-300 dark:hover:border-emerald-700'
  let cardBg = ''

  if (isOccupied) {
    statusColor = 'bg-amber-500'
    statusLabel = 'Ocupada'
    statusTextColor = 'text-amber-600 dark:text-amber-400'
    borderHover = 'hover:border-amber-300 dark:hover:border-amber-700'
    cardBg = zoneStyle.bg
  } else if (isMaintenance) {
    statusColor = 'bg-red-500'
    statusLabel = 'Mantenimiento'
    statusTextColor = 'text-red-600 dark:text-red-400'
    borderHover = 'hover:border-red-300 dark:hover:border-red-700'
  }

  return (
    <Card
      className={`
        cursor-pointer transition-all duration-200
        ${borderHover}
        ${isMaintenance ? 'opacity-60' : 'hover:shadow-md hover:-translate-y-0.5'}
        ${cardBg}
      `}
      onClick={isMaintenance ? undefined : onClick}
      role={isMaintenance ? undefined : 'button'}
      tabIndex={isMaintenance ? undefined : 0}
      onKeyDown={isMaintenance ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
    >
      <CardContent className="p-4">
        {/* Top row: Table number + Zone + Actions */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
              <span className="text-sm font-bold text-primary">
                {table.number}
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight truncate">
                {table.name || `Mesa ${table.number}`}
              </p>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 mt-0.5 ${zoneStyle.className}`}
              >
                {zoneStyle.label}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2" onClick={(e) => e.stopPropagation()}>
            <span className={`h-2.5 w-2.5 rounded-full ${statusColor} animate-pulse`} />
            {/* Toggle active button */}
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${
                table.isActive
                  ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/40'
                  : 'text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/40'
              }`}
              onClick={onToggleActive}
              disabled={!!table.activeSession || togglingTableId === table.id}
              title={table.isActive ? 'Desactivar mesa' : 'Activar mesa'}
              aria-label={table.isActive ? 'Desactivar mesa' : 'Activar mesa'}
            >
              {togglingTableId === table.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : table.isActive ? (
                <PowerOff className="h-3.5 w-3.5" />
              ) : (
                <Power className="h-3.5 w-3.5" />
              )}
            </Button>
            {/* Delete button */}
            <Button variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-red-50 dark:hover:bg-red-900/40 active:scale-[0.98] transition-all"
              onClick={onDelete}
              disabled={!!table.activeSession}
              title="Eliminar mesa"
              aria-label="Eliminar mesa"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-1.5 mb-2">
          <span className={`text-xs font-medium ${statusTextColor}`}>
            {statusLabel}
          </span>
        </div>

        {/* Capacity */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Users className="h-3.5 w-3.5" />
          <span>{table.capacity} personas</span>
        </div>

        {/* Occupied info */}
        {isOccupied && table.activeSession && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1">
                <Users className="h-3 w-3" />
                {table.activeSession.guests} {table.activeSession.guests === 1 ? 'invitado' : 'invitados'}
              </span>
              <span className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatTimeElapsed(table.activeSession.startedAt)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-amber-600 dark:text-amber-500">
                {table.activeSession._count?.comandaItems ?? 0} items
              </span>
              {table.activeSession.totalConsumed != null && table.activeSession.totalConsumed > 0 && (
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  {formatCurrency(table.activeSession.totalConsumed, currencyCode)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Maintenance indicator */}
        {isMaintenance && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-2.5 flex items-center gap-2">
            <Wrench className="h-4 w-4 text-red-500" />
            <span className="text-xs text-red-600 dark:text-red-400">Fuera de servicio</span>
          </div>
        )}

        {/* Available CTA */}
        {isAvailable && (
          <div className="flex items-center justify-center gap-1.5 mt-1">
            <DoorOpen className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs text-emerald-600 dark:text-emerald-400">Clic para abrir</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
