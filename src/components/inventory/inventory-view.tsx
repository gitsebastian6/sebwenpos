'use client'

import { useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { KPIBar } from '@/components/shared/kpi-bar'
import { useInventory } from '@/hooks/api/use-inventory'
import { useProducts } from '@/hooks/api/use-products'
import * as XLSX from 'xlsx'
import type { Product, LowStockAlert, InventoryMovement, ActionType } from './inventory-types'
import { MOVEMENT_TYPE_LABELS } from './inventory-types'
import { InventoryActionCards } from './inventory-action-cards'
import { InventoryLowStockCard } from './inventory-low-stock-card'
import { InventoryProductTable } from './inventory-product-table'
import { InventoryMovementsSection } from './inventory-movements-section'
import { InventoryActionDialog } from './inventory-action-dialog'
import { InventoryResetDialog } from './inventory-reset-dialog'

// ─── Component ───────────────────────────────────────────────────

export function InventoryView() {
  const { store } = useAuthStore()
  const storeId = store?.id

  // Search & filter for product list
  const [productSearch, setProductSearch] = useState('')

  // Filter state for movements
  const [filterType, setFilterType] = useState<string>('ALL')
  const [filterProduct, setFilterProduct] = useState<string>('ALL')

  // ─── Action Dialog State ────────────────────────────
  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [actionType, setActionType] = useState<ActionType>('loss')
  const [actionDialogKey, setActionDialogKey] = useState(0)

  // Reset stock state
  const [showResetDialog, setShowResetDialog] = useState(false)

  // ─── Query hooks ──────────────────────────────────────
  const { data: movements = [], isLoading: isLoadingMovements } = useInventory(storeId, {
    type: filterType,
    productId: filterProduct,
  })

  const { data: productsResponse, isLoading: isLoadingProducts } = useProducts(storeId, { limit: 500 })
  const products = (productsResponse?.data ?? []) as Product[]

  // ─── Computed ────────────────────────────────────────

  const lowStockProducts = useMemo<LowStockAlert[]>(() => {
    return products
      .filter((p) => p.currentStock <= p.minStock)
      .map((p) => ({
        id: p.id, name: p.name, currentStock: p.currentStock,
        minStock: p.minStock, salePrice: p.salePrice,
        category: p.category?.name ?? null,
      }))
  }, [products])

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products
    const q = productSearch.toLowerCase().trim()
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.category?.name && p.category.name.toLowerCase().includes(q))
    )
  }, [products, productSearch])

  // ─── Helpers ─────────────────────────────────────────

  function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    return format(d, "d MMM yyyy, HH:mm", { locale: es })
  }

  function openActionDialog(type: ActionType) {
    setActionType(type)
    setActionDialogKey((k) => k + 1)
    setActionDialogOpen(true)
  }

  function handleExportMovementsExcel() {
    if (movements.length === 0) {
      toast.error('No hay movimientos para exportar')
      return
    }
    const rows = movements.map((m, i) => ({
      '#': i + 1,
      'Fecha': format(new Date(m.createdAt), 'yyyy-MM-dd HH:mm:ss'),
      'Producto': m.productName,
      'Presentación': m.presentationName || '',
      'Tipo': MOVEMENT_TYPE_LABELS[m.movementType] || m.movementType,
      'Cantidad': m.quantity,
      'Notas': m.notes || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 5 }, { wch: 20 }, { wch: 30 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 30 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos')
    const fileName = `Movimientos_${format(new Date(), 'yyyy-MM-dd')}.xlsx`
    XLSX.writeFile(wb, fileName)
    toast.success(`Archivo ${fileName} descargado`)
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <KPIBar context="inventory" />

      <InventoryActionCards onAction={openActionDialog} />

      <Separator />

      <InventoryLowStockCard products={lowStockProducts} isLoading={isLoadingProducts} />

      <Separator />

      <InventoryProductTable
        products={products}
        filteredProducts={filteredProducts}
        isLoading={isLoadingProducts}
        search={productSearch}
        onSearchChange={setProductSearch}
        onResetStock={() => setShowResetDialog(true)}
        currencyCode={store?.currencyCode}
      />

      <Separator />

      <InventoryMovementsSection
        movements={movements}
        isLoading={isLoadingMovements}
        products={products}
        filterType={filterType}
        filterProduct={filterProduct}
        onFilterTypeChange={setFilterType}
        onFilterProductChange={setFilterProduct}
        onExportExcel={handleExportMovementsExcel}
        formatDate={formatDate}
      />

      {/* Action Dialog — key forces full remount for clean state reset */}
      <InventoryActionDialog
        key={actionDialogKey}
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        actionType={actionType}
        storeId={storeId}
        products={products}
        currencyCode={store?.currencyCode}
      />

      {/* Reset Stock Dialog — key forces remount for clean resetNote state */}
      <InventoryResetDialog
        key={`reset-${showResetDialog}`}
        open={showResetDialog}
        onOpenChange={setShowResetDialog}
        storeId={storeId}
      />
    </div>
  )
}
