'use client'

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { useComandaAddItem, useComandaUpdateItem } from '@/hooks/api/use-tables'
import { formatCurrency } from '@/lib/auth'
import { paymentMethodLabel } from '@/lib/format'
import { playAlert, playError } from '@/lib/pos-sounds'
import { toast } from 'sonner'
import type { OrderItemData } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Plus,
  Users,
  Clock,
  DollarSign,
  Search,
  ChefHat,
  CheckCircle2,
  XCircle,
  ShoppingCart,
  LogOut,
  Minus,
  Loader2,
  Trash2,
  CreditCard,
  MessageSquare,
  Pencil,
  X,
  Printer,
} from 'lucide-react'
import type { BarTable, TableSession, Product, Category, Service } from '@/hooks/use-tables-data'
import { ZONE_STYLES, COMANDA_STATUS_STYLES, formatTimeElapsed, formatTime } from '@/hooks/use-tables-data'
import { printTicket, type TicketItem } from '@/lib/print-ticket'

// ─── ComandaPanel Props ──────────────────────────────────────────────────────

interface ComandaPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedTable: BarTable | null
  session: TableSession | null
  sessionLoading: boolean
  products: Product[]
  productsLoading: boolean
  services: Service[]
  categories: Category[]
  tick: number
  // Selection state (managed by parent)
  selectedItemIds: number[]
  onToggleItemSelection: (itemId: number) => void
  onSelectAllPayable: () => void
  selectedItemsTotal: number
  hasUnpaidItems: boolean
  canServe: boolean
  canPay: boolean
  selectedPendingItems: { id: number }[]
  // Callbacks from parent
  fetchSession: (sessionId: number) => Promise<void>
  fetchProducts: (query?: string, categoryId?: string) => void
  fetchTables: () => void
  // Actions
  onOpenPayment: () => void
  onCloseSession: () => void
}

export function ComandaPanel({
  open,
  onOpenChange,
  selectedTable,
  session,
  sessionLoading,
  products,
  productsLoading,
  services,
  categories,
  tick,
  selectedItemIds,
  onToggleItemSelection,
  onSelectAllPayable,
  selectedItemsTotal,
  hasUnpaidItems,
  canServe,
  canPay,
  selectedPendingItems,
  fetchProducts,
  onOpenPayment,
  onCloseSession,
}: ComandaPanelProps) {
  const { store } = useAuthStore()

  // ── TanStack Query mutations ──
  const comandaAddItem = useComandaAddItem()
  const comandaUpdateItem = useComandaUpdateItem()

  // ── Comanda notes editing ──
  const [notesPopoverItemId, setNotesPopoverItemId] = useState<number | null>(null)
  const [notesEditText, setNotesEditText] = useState<string>('')
  const [savingNotes, setSavingNotes] = useState(false)

  // ── Comanda actions ──
  const [servingItemIds, setServingItemIds] = useState<number[]>([])
  const [updatingQtyItemId, setUpdatingQtyItemId] = useState<number | null>(null)

  // ── Add items to comanda ──
  const [productSearch, setProductSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [addingItem, setAddingItem] = useState<number | null>(null)
  const [pendingItemNotes, setPendingItemNotes] = useState<string>('')

  // ── Payment / print data ──
  const [lastPaymentData, setLastPaymentData] = useState<any>(null)
  const [lastInvoiceData, setLastInvoiceData] = useState<any>(null)
  const [lastDocType, setLastDocType] = useState<'TIRILLA' | 'DOC_EQUIPOS' | 'ELECTRONICA'>('TIRILLA')

  // Force re-render with tick
  const _tick = tick

  // ─── Handlers ──────────────────────────────────────────────────────────

  async function handleAddItem(productId: number | null, serviceId?: number | null) {
    if (!session) {
      toast.error('No hay sesión activa')
      return
    }
    if (!store?.id) {
      toast.error('No se pudo identificar la tienda')
      return
    }
    if (!productId && !serviceId) return
    if (session.storeId !== store.id) {
      toast.error('Error de sesión. Por favor recarga la página.')
      return
    }
    const itemId = productId ?? serviceId ?? null
    setAddingItem(itemId)
    try {
      const itemPayload: Record<string, unknown> = {
        ...(productId ? { productId } : { serviceId }),
        quantity: 1,
      }
      if (pendingItemNotes.trim()) {
        itemPayload.notes = pendingItemNotes.trim()
      }

      await comandaAddItem.mutateAsync({
        sessionId: session.id,
        storeId: store.id,
        items: [itemPayload],
      })

      playAlert()
      toast.success('Item agregado a la comanda')
      setPendingItemNotes('')
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al agregar item')
    } finally {
      setAddingItem(null)
    }
  }

  async function handleUpdateItemNotes(itemId: number, notes: string) {
    if (!session) return
    setSavingNotes(true)
    try {
      await comandaUpdateItem.mutateAsync({
        sessionId: session.id,
        itemIds: [itemId],
        notes,
      })
      toast.success('Nota actualizada')
      setNotesPopoverItemId(null)
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al actualizar nota')
    } finally {
      setSavingNotes(false)
    }
  }

  async function handleMarkServed(itemIds: number[]) {
    if (!session || itemIds.length === 0) return
    setServingItemIds(itemIds)
    try {
      await comandaUpdateItem.mutateAsync({
        sessionId: session.id,
        itemIds,
        status: 'SERVED',
      })

      toast.success(`${itemIds.length} item${itemIds.length > 1 ? 's' : ''} marcado${itemIds.length > 1 ? 's' : ''} como servido`)
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al marcar como servido')
    } finally {
      setServingItemIds([])
    }
  }

  async function handleCancelItem(itemIds: number[]) {
    if (!session || itemIds.length === 0) return
    setServingItemIds(itemIds)
    try {
      await comandaUpdateItem.mutateAsync({
        sessionId: session.id,
        itemIds,
        status: 'CANCELLED',
      })
      toast.success(`${itemIds.length} item${itemIds.length > 1 ? 's' : ''} cancelado${itemIds.length > 1 ? 's' : ''}`)
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al cancelar item')
    } finally {
      setServingItemIds([])
    }
  }

  async function handleUpdateItemQuantity(itemId: number, newQuantity: number) {
    if (!session || newQuantity < 1) return
    setUpdatingQtyItemId(itemId)
    try {
      await comandaUpdateItem.mutateAsync({
        sessionId: session.id,
        itemIds: [itemId],
        quantity: newQuantity,
      })
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al actualizar cantidad')
    } finally {
      setUpdatingQtyItemId(null)
    }
  }

  function handleOpenPayment() {
    if (selectedItemIds.length === 0) {
      toast.error('Selecciona items para cobrar')
      return
    }
    onOpenPayment()
  }

  // Handle sheet close — reset local state
  function handleSheetChange(open: boolean) {
    if (!open) {
      setProductSearch('')
      setCategoryFilter('all')
      setPendingItemNotes('')
      setLastPaymentData(null)
      setLastInvoiceData(null)
    }
    onOpenChange(open)
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={handleSheetChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-hidden flex flex-col p-0"
      >
        {selectedTable && (
          <>
            <SheetHeader className="p-4 pb-2 border-b shrink-0">
              <div className="flex items-center justify-between pr-6">
                <div className="flex items-center gap-3">
                  <SheetTitle className="text-lg font-semibold">
                    Mesa {selectedTable.number}
                    {selectedTable.name && (
                      <span className="text-muted-foreground font-normal ml-2">
                        — {selectedTable.name}
                      </span>
                    )}
                  </SheetTitle>
                  <Badge variant="outline" className={ZONE_STYLES[selectedTable.zone]?.className}>
                    {ZONE_STYLES[selectedTable.zone]?.label ?? selectedTable.zone}
                  </Badge>
                </div>
              </div>
              {session && (
                <SheetDescription className="mt-1">
                  <span className="inline-flex items-center gap-1.5 mr-4">
                    <Clock className="h-3.5 w-3.5" />
                    {formatTime(session.startedAt)}
                    {' · '}
                    {formatTimeElapsed(session.startedAt)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 mr-4">
                    <Users className="h-3.5 w-3.5" />
                    {session.guests} {session.guests === 1 ? 'invitado' : 'invitados'}
                  </span>
                  {session.customer && (
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      {session.customer.name}
                    </span>
                  )}
                </SheetDescription>
              )}
            </SheetHeader>

            {/* Sheet Body */}
            <div className="flex-1 overflow-y-auto">
              {sessionLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-md" />
                  ))}
                </div>
              ) : session ? (
                <div className="space-y-4 p-4">
                  {/* ── Quick Actions ──────────────────────────────── */}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs active:scale-[0.98] transition-all"
                      onClick={onSelectAllPayable}
                      disabled={!hasUnpaidItems}
                    >
                      Seleccionar todo
                    </Button>
                    <Button size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/30 active:scale-[0.98] transition-all"
                      onClick={() => handleMarkServed(selectedPendingItems.map((i) => i.id))}
                      disabled={!canServe || servingItemIds.length > 0}
                    >
                      {servingItemIds.length > 0 ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ChefHat className="h-3.5 w-3.5" />
                      )}
                      Marcar Servido{selectedPendingItems.length > 1 ? 's' : ''}
                    </Button>
                    <Button size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30 active:scale-[0.98] transition-all"
                      onClick={() => handleCancelItem(selectedItemIds)}
                      disabled={selectedItemIds.length === 0 || servingItemIds.length > 0}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Cancelar ({selectedItemIds.length})
                    </Button>
                    <Button size="sm"
                      className="gap-1.5 text-xs active:scale-[0.98] transition-all"
                      onClick={handleOpenPayment}
                      disabled={!canPay}
                    >
                      <DollarSign className="h-3.5 w-3.5" />
                      Cobrar ({selectedItemIds.length})
                    </Button>
                    <Button size="sm"
                      variant="outline"
                      className="gap-1.5 text-xs border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30 active:scale-[0.98] transition-all"
                      onClick={onCloseSession}
                      disabled={hasUnpaidItems}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Cerrar Mesa
                    </Button>
                  </div>

                  {/* ── Comanda Items ──────────────────────────────── */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4" />
                      Comanda
                      {session.comandaItems && session.comandaItems.length > 0 && (
                        <Badge variant="secondary" className="ml-1">
                          {session.comandaItems.length}
                        </Badge>
                      )}
                    </h3>

                    {session.comandaItems && session.comandaItems.length > 0 ? (
                      <div className="space-y-1.5">
                        {session.comandaItems.map((item) => {
                          const isPaidOrCancelled = item.status === 'PAID' || item.status === 'CANCELLED'
                          const isServing = servingItemIds.includes(item.id)
                          const statusStyle = COMANDA_STATUS_STYLES[item.status] ?? COMANDA_STATUS_STYLES.CANCELLED
                          return (
                            <div
                              key={item.id}
                              className={`
                                flex items-center gap-2 rounded-lg border p-2.5 transition-colors cursor-pointer
                                ${isPaidOrCancelled ? 'opacity-50' : 'hover:bg-muted/50 active:bg-muted/70'}
                                ${selectedItemIds.includes(item.id) ? 'border-primary/50 bg-primary/5' : ''}
                              `}
                              onClick={!isPaidOrCancelled ? () => onToggleItemSelection(item.id) : undefined}
                            >
                              {!isPaidOrCancelled && (
                                <Checkbox
                                  checked={selectedItemIds.includes(item.id)}
                                  onCheckedChange={() => onToggleItemSelection(item.id)}
                                  className="shrink-0"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                    {!isPaidOrCancelled ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            if (item.quantity > 1) handleUpdateItemQuantity(item.id, item.quantity - 1)
                                          }}
                                          disabled={item.quantity <= 1 || updatingQtyItemId !== null}
                                          className="h-5 w-5 rounded border border-border flex items-center justify-center text-xs hover:bg-muted transition-colors disabled:opacity-30 shrink-0"
                                        >
                                          <Minus className="h-3 w-3" />
                                        </button>
                                        <span
                                          className="text-sm font-semibold tabular-nums min-w-[1.5rem] text-center"
                                        >
                                          {item.quantity}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            handleUpdateItemQuantity(item.id, item.quantity + 1)
                                          }}
                                          disabled={updatingQtyItemId !== null}
                                          className="h-5 w-5 rounded border border-border flex items-center justify-center text-xs hover:bg-muted transition-colors disabled:opacity-30 shrink-0"
                                        >
                                          <Plus className="h-3 w-3" />
                                        </button>
                                      </>
                                    ) : (
                                      <span className="text-sm font-medium tabular-nums">{item.quantity}x</span>
                                    )}
                                    <span
                                      className={`text-sm font-medium truncate ${
                                        isPaidOrCancelled ? 'line-through text-muted-foreground' : ''
                                      }`}
                                    >
                                      {item.productName}
                                    </span>
                                </div>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] px-1.5 py-0 shrink-0 ${statusStyle.className}`}
                                >
                                  {statusStyle.label}
                                </Badge>
                                {item.notes && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800 shrink-0 max-w-[140px] truncate" title={item.notes}>
                                    <MessageSquare className="h-2.5 w-2.5 shrink-0" />
                                    {item.notes}
                                  </span>
                                )}
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {formatCurrency(item.unitPrice, store?.currencyCode)} c/u
                                {' · '}
                                {formatCurrency(item.total, store?.currencyCode)}
                                {isServing && (
                                  <span className="inline-flex items-center gap-1 ml-2 text-amber-600 dark:text-amber-400">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Sirviendo...
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Notes edit button */}
                            {(item.status === 'PENDING' || item.status === 'SERVED') && (
                              <Popover
                                open={notesPopoverItemId === item.id}
                                onOpenChange={(open) => {
                                  if (!open) setNotesPopoverItemId(null)
                                }}
                              >
                                <PopoverTrigger asChild>
                                  <span
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setNotesPopoverItemId(item.id)
                                      setNotesEditText(item.notes || '')
                                    }}
                                  >
                                    <Button variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted active:scale-[0.98] transition-all"
                                      title={item.notes ? 'Editar nota' : 'Agregar nota'}
                                    >
                                      {item.notes ? (
                                        <MessageSquare className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                      ) : (
                                        <Pencil className="h-3 w-3" />
                                      )}
                                    </Button>
                                  </span>
                                </PopoverTrigger>
                                <PopoverContent className="w-72 p-3" align="end" side="left">
                                  <div className="space-y-2">
                                    <Label className="text-xs font-medium">
                                      Notas para: {item.productName}
                                    </Label>
                                    <Textarea
                                      value={notesEditText}
                                      onChange={(e) => setNotesEditText(e.target.value)}
                                      placeholder="Ej: sin hielo, extra picante..."
                                      rows={2}
                                      className="text-sm resize-none"
                                      autoFocus
                                    />
                                    <div className="flex items-center justify-end gap-2">
                                      <Button size="sm"
                                        variant="outline"
                                        className="h-7 text-xs active:scale-[0.98] transition-all"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          setNotesPopoverItemId(null)
                                        }}
                                      >
                                        Cancelar
                                      </Button>
                                      <Button size="sm"
                                        className="h-7 text-xs gap-1 active:scale-[0.98] transition-all"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleUpdateItemNotes(item.id, notesEditText)
                                        }}
                                        disabled={savingNotes}
                                      >
                                        {savingNotes && <Loader2 className="h-3 w-3 animate-spin" />}
                                        Guardar
                                      </Button>
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                            {item.status === 'PENDING' && (
                              <Button variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 text-amber-600 hover:text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40 active:scale-[0.98] transition-all"
                                onClick={() => handleMarkServed([item.id])}
                                disabled={servingItemIds.length > 0}
                                title="Marcar como servido"
                              >
                                {servingItemIds.includes(item.id) ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            )}
                            {(item.status === 'PENDING' || item.status === 'SERVED') && (
                              <Button variant="ghost"
                                size="icon"
                                className="h-7 w-7 shrink-0 text-red-500 hover:text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/40 active:scale-[0.98] transition-all"
                                onClick={() => handleCancelItem([item.id])}
                                disabled={servingItemIds.length > 0}
                                title="Cancelar item"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {item.status === 'CANCELLED' && (
                              <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                          </div>
                        )
                      })}

                      {/* Totals */}
                      <div className="rounded-lg border bg-muted/30 p-3 mt-2 space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Total consumido</span>
                          <span className="font-medium">
                            {formatCurrency(
                              session.comandaItems.reduce((sum, item) => sum + item.total, 0),
                              store?.currencyCode
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Total pagado</span>
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(
                              session.comandaItems
                                .filter((i) => i.status === 'PAID')
                                .reduce((sum, item) => sum + item.total, 0),
                              store?.currencyCode
                            )}
                          </span>
                        </div>
                        <Separator className="my-1" />
                        <div className="flex justify-between text-sm font-semibold">
                          <span>Saldo pendiente</span>
                          <span className={
                            session.comandaItems
                              .filter((i) => i.status === 'PENDING' || i.status === 'SERVED')
                              .reduce((sum, item) => sum + item.total, 0) > 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }>
                            {formatCurrency(
                              session.comandaItems
                                .filter((i) => i.status === 'PENDING' || i.status === 'SERVED')
                                .reduce((sum, item) => sum + item.total, 0),
                              store?.currencyCode
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <ShoppingCart className="h-8 w-8 text-muted-foreground/40 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        La comanda está vacía
                      </p>
                    </div>
                  )}
                </div>

                {/* ── Session Orders ──────────────────────────────── */}
                {session.orders && session.orders.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Pagos Realizados
                    </h3>
                    <div className="space-y-1.5">
                      {session.orders.map((order) => (
                        <div
                          key={order.id}
                          className="flex items-center justify-between rounded-lg border p-2.5 text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {order.orderNumber}
                            </Badge>
                            <span className="text-muted-foreground text-xs">
                              {paymentMethodLabel(order.paymentMethod)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {formatCurrency(order.total, store?.currencyCode)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Print last ticket button */}
                    {lastPaymentData && (
                      <Button variant="outline"
                        size="sm"
                        className="mt-2 w-full gap-2 active:scale-[0.98] transition-all"
                        onClick={() => {
                          const items: TicketItem[] = (lastPaymentData.orderItems || []).map((item: OrderItemData) => ({
                            name: item.productName,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            total: item.totalRow,
                            isService: item.isService,
                          }))
                          printTicket({
                            storeName: store?.name || '',
                            storeNIT: store?.nit || undefined,
                            storeAddress: store?.address || undefined,
                            storePhone: store?.phone || undefined,
                            storeRegime: 'RESPONSABLE',
                            invoiceResolution: store?.resolutionNumber || undefined,
                            invoicePrefix: store?.invoicePrefix || undefined,
                            orderNumber: lastPaymentData.orderNumber,
                            date: lastPaymentData.createdAt,
                            customer: lastPaymentData.customer?.name || session.customer?.name,
                            tableName: session.barTable ? `Mesa ${session.barTable.number}${session.barTable.name ? ` - ${session.barTable.name}` : ''}` : undefined,
                            items,
                            subtotal: lastPaymentData.subtotal,
                            tipAmount: lastPaymentData.tipAmount || 0,
                            total: lastPaymentData.total,
                            discountAmount: lastPaymentData.discountAmount || 0,
                            taxAmount: lastPaymentData.taxAmount || 0,
                            taxBreakdown: lastPaymentData.taxBreakdown || undefined,
                            paymentMethod: lastPaymentData.paymentMethod,
                            isElectronic: !!lastInvoiceData?.cufe,
                            isDocEquivalente: lastDocType === 'DOC_EQUIPOS' && !lastInvoiceData?.cufe,
                            cufe: lastInvoiceData?.cufe || undefined,
                            qrCodeUrl: lastInvoiceData?.qrCodeUrl || undefined,
                            customerNit: lastInvoiceData?.customerNit || undefined,
                            resolutionNumber: store?.resolutionNumber || undefined,
                            resolutionStart: store?.resolutionStartNumber ?? undefined,
                            resolutionEnd: store?.resolutionEndNumber ?? undefined,
                            currencyCode: store?.currencyCode || 'COP',
                          })
                        }}
                      >
                        <Printer className="h-4 w-4" />
                        Imprimir Último Ticket
                        {lastInvoiceData?.cufe && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">FE</Badge>
                        )}
                        {lastDocType === 'DOC_EQUIPOS' && !lastInvoiceData?.cufe && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-600">Doc.Equi</Badge>
                        )}
                      </Button>
                    )}
                  </div>
                )}

                {/* ── Notes ──────────────────────────────────────── */}
                {session.notes && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">Notas</h3>
                    <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                      {session.notes}
                    </p>
                  </div>
                )}

                {/* ── Add Items to Comanda ────────────────────────── */}
                <div>
                  <Separator className="mb-4" />
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2 text-primary">
                    <Plus className="h-4 w-4" />
                    Agregar a la Comanda
                  </h3>

                  {/* Pending item notes input */}
                  <div className="mb-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      <Label className="text-xs text-muted-foreground">Notas para el próximo item (opcional)</Label>
                      {pendingItemNotes && (
                        <Button type="button"
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground ml-auto active:scale-[0.98] transition-all"
                          onClick={() => setPendingItemNotes('')}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <Input
                      value={pendingItemNotes}
                      onChange={(e) => setPendingItemNotes(e.target.value)}
                      placeholder="Ej: sin hielo, extra picante..."
                      className="h-8 text-sm"
                    />
                  </div>

                  {/* Category filter */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center mb-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Buscar producto..."
                        className="pl-9 h-10 focus-visible:ring-primary/20 focus-visible:border-primary/40"
                        value={productSearch}
                        onChange={(e) => {
                          setProductSearch(e.target.value)
                          fetchProducts(e.target.value, categoryFilter)
                        }}
                      />
                    </div>
                    <Select
                      value={categoryFilter}
                      onValueChange={(val) => {
                        setCategoryFilter(val)
                        fetchProducts(productSearch, val)
                      }}
                    >
                      <SelectTrigger className="w-full sm:w-44 focus-visible:ring-primary/20 focus-visible:border-primary/40">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las categorías</SelectItem>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={String(cat.id)}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Product list + Services list */}
                  {productsLoading ? (
                    <div className="space-y-2">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full rounded-md" />
                      ))}
                    </div>
                  ) : products.length === 0 && services.length === 0 && !productSearch ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No se encontraron productos ni servicios
                    </p>
                  ) : (
                    <ScrollArea className="max-h-64">
                      <div className="space-y-1.5">
                        {products.map((product) => (
                          <div
                            key={`p-${product.id}`}
                            className="flex items-center justify-between rounded-lg border p-2.5 hover:bg-muted/50 active:bg-muted/70 transition-colors cursor-pointer"
                            onClick={() => handleAddItem(product.id, null)}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{product.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {product.category?.name ?? 'Sin categoría'}
                                {' · '}
                                {formatCurrency(product.salePrice, store?.currencyCode)}
                              </p>
                            </div>
                            <div className="shrink-0 ml-2">
                              {addingItem === product.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              ) : (
                                <Plus className="h-4 w-4 text-primary" />
                              )}
                            </div>
                          </div>
                        ))}

                        {/* Services section */}
                        {services.length > 0 && (
                          <>
                            {services
                              .filter((s) => !productSearch || s.name.toLowerCase().includes(productSearch.toLowerCase()))
                              .map((service) => (
                                <div
                                  key={`s-${service.id}`}
                                  className="flex items-center justify-between rounded-lg border p-2.5 hover:bg-violet-50 dark:hover:bg-violet-950/20 active:bg-violet-100 dark:active:bg-violet-950/40 transition-colors border-violet-200/50 dark:border-violet-800/50 cursor-pointer"
                                  onClick={() => handleAddItem(null, service.id)}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-sm font-medium truncate">{service.name}</p>
                                      <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0 bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">
                                        Svc
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {formatCurrency(service.price, store?.currencyCode)}
                                      {' · por '}
                                      {service.unit}
                                    </p>
                                  </div>
                                  <div className="shrink-0 ml-2">
                                    {addingItem === service.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                                    ) : (
                                      <Plus className="h-4 w-4 text-violet-600" />
                                    )}
                                  </div>
                                </div>
                              ))}
                          </>
                        )}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}
    </SheetContent>
    </Sheet>
  )
}
