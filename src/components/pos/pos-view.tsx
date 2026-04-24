'use client'

import { useState, useCallback, useMemo, useRef } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Search,
  ShoppingCart,
  Star,
  Printer,
  RotateCcw,
  Clock,
  ScanBarcode,
} from 'lucide-react'
import { printTicket, type TicketItem } from '@/lib/print-ticket'
import { KPIBar } from '@/components/shared/kpi-bar'
import { playError } from '@/lib/pos-sounds'
import { useBarcodeScanner } from '@/hooks/use-barcode-scanner'
import type { OrderItemData } from '@/types'
import { usePosData } from '@/hooks/pos/use-pos-data'
import { usePosCart } from '@/hooks/pos/use-pos-cart'
import { POSReturnDialog, type POSReturnDialogRef } from '@/components/pos/pos-return-dialog'
import { POSRecentSales } from '@/components/pos/pos-recent-sales'
import { ProductGrid } from '@/components/pos/product-grid'
import { CartSidebar } from '@/components/pos/cart-sidebar'
import { PaymentDialog } from '@/components/pos/payment-dialog'

// ─── Main Component ─────────────────────────────────────

export function POSView() {
  const { store } = useAuthStore()
  const storeId = store?.id
  const currencyCode = store?.currencyCode || 'COP'

  // ─── Data hook ──────────────────────────────────────
  const {
    products,
    services,
    categories,
    customers,
    openCashRegisters,
    selectedCashRegisterId,
    setSelectedCashRegisterId,
    isLoadingProducts,
    fetchOpenCashRegisters,
    fetchRecentSales,
    recentOrders,
    loadingRecentSales,
    recentSalesSearch,
    setRecentSalesSearch,
  } = usePosData({ storeId })

  // ─── Cart hook ──────────────────────────────────────
  const cart = usePosCart({
    openCashRegisters,
    selectedCashRegisterId,
    customers,
    fetchOpenCashRegisters,
  })

  // ─── UI states ───────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // ─── Recent sales dialog state ──────────────────────
  const [showRecentSales, setShowRecentSales] = useState(false)

  // ─── Return dialog ref ──────────────────────────────
  const returnDialogRef = useRef<POSReturnDialogRef>(null)

  // ─── Barcode scanner state ──────────────────────────
  const [barcodeFlash, setBarcodeFlash] = useState<'success' | 'error' | null>(null)
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  // ─── Barcode scan handler ──────────────────────────
  const handleBarcodeScan = useCallback(
    (barcode: string) => {
      // Search products for exact barcode match (case insensitive)
      const product = products.find(
        (p) => p.barcode && p.barcode.toLowerCase() === barcode.toLowerCase()
      )
      if (product) {
        cart.addToCart(product)
        toast.success(`Escaneado: ${product.name}`)
        setBarcodeFlash('success')
      } else {
        playError()
        toast.error(`Producto no encontrado: ${barcode}`)
        setBarcodeFlash('error')
      }
      // Clear flash after 1.5s
      setTimeout(() => setBarcodeFlash(null), 1500)
    },
    [cart, products]
  )

  // ─── Barcode scanner hook ──────────────────────────
  // Enabled only when no dialog is open
  const anyDialogOpen = cart.showChargeDialog || showRecentSales
  useBarcodeScanner({ onScan: handleBarcodeScan, enabled: !anyDialogOpen })

  // ─── Dedicated barcode input handler ──────────────
  const handleBarcodeInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        const value = (e.target as HTMLInputElement).value.trim()
        if (value.length >= 4) {
          handleBarcodeScan(value)
          ;(e.target as HTMLInputElement).value = ''
        }
      }
    },
    [handleBarcodeScan]
  )

  // ─── Return success handler ────────────────────────
  const handleReturnSuccess = useCallback((returnedOrderId: number) => {
    // Clear last order if it was the returned one
    if (cart.lastOrderData?.id === returnedOrderId) {
      cart.clearLastOrder()
    }
    // Refresh recent sales if open
    if (showRecentSales) fetchRecentSales()
  }, [cart, showRecentSales, fetchRecentSales])

  // ─── Filtered products ───────────────────────────────
  const filteredProducts = useMemo(() => {
    if (selectedCategory === 'servicios') return []
    let filtered = products

    if (selectedCategory !== 'all') {
      filtered = filtered.filter((p) => p.categoryId === Number(selectedCategory))
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          (p.sku && p.sku.toLowerCase().includes(query))
      )
    }

    return filtered
  }, [products, selectedCategory, searchQuery])

  // ─── Filtered services ───────────────────────────────
  const filteredServices = useMemo(() => {
    if (selectedCategory !== 'servicios') return []
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      return services.filter((s) => s.name.toLowerCase().includes(query))
    }
    return services
  }, [services, selectedCategory, searchQuery])

  // ─── Print last order ticket ──────────────────────
  const printLastOrderTicket = useCallback(() => {
    if (!cart.lastOrderData) return
    const items: TicketItem[] = (cart.lastOrderData.orderItems || []).map((item: OrderItemData) => ({
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
      orderNumber: cart.lastInvoiceData?.invoiceNumber || cart.lastOrderData.orderNumber,
      date: cart.lastOrderData.createdAt,
      customer: cart.lastOrderData.customer?.name,
      customerNit: cart.lastInvoiceData?.customerNit,
      items,
      subtotal: cart.lastOrderData.subtotal,
      tipAmount: cart.lastOrderData.tipAmount || 0,
      total: cart.lastOrderData.total,
      taxAmount: cart.lastOrderData.taxAmount || 0,
      taxBreakdown: (cart.lastOrderData.taxBreakdown || undefined) as { name: string; code: string; rate: number; base: number; amount: number }[] | undefined,
      discountAmount: cart.lastOrderData.discountAmount || 0,
      paymentMethod: cart.lastOrderData.paymentMethod,
      currencyCode: currencyCode,
      notes: cart.lastOrderData.notes ?? undefined,
      cufe: cart.lastInvoiceData?.cufe,
      qrCodeUrl: cart.lastInvoiceData?.qrCode,
      isElectronic: !!cart.lastInvoiceData?.cufe,
      isDocEquivalente: cart.lastDocType === 'DOC_EQUIPOS' && !cart.lastInvoiceData?.cufe,
      resolutionNumber: store?.resolutionNumber || undefined,
      resolutionStart: store?.resolutionStartNumber || undefined,
      resolutionEnd: store?.resolutionEndNumber || undefined,
    })
  }, [cart.lastOrderData, cart.lastInvoiceData, cart.lastDocType, store, currencyCode])

  return (
    <div className="flex flex-col gap-3 h-full relative min-w-0 overflow-x-hidden">
      <KPIBar context="pos" />

      {/* ═══ HEADER: Barcode Input + Search + Category Tabs ═══════════ */}
      {/* Barcode scanner input + search row */}
      <div className="flex items-center gap-2">
        {/* Dedicated barcode input */}
        <div className="relative shrink-0 w-44 sm:w-52">
          <ScanBarcode
            className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-300 ${
              barcodeFlash === 'success'
                ? 'text-emerald-500'
                : barcodeFlash === 'error'
                  ? 'text-red-500'
                  : 'text-muted-foreground'
            }`}
          />
          <Input
            ref={barcodeInputRef}
            data-barcode-input
            type="text"
            placeholder="Escanear código..."
            onKeyDown={handleBarcodeInputKeyDown}
            className={`pl-9 pr-2 h-11 text-sm bg-background/80 backdrop-blur-sm transition-all duration-300 ${
              barcodeFlash === 'success'
                ? 'ring-2 ring-emerald-500/50 border-emerald-500/50'
                : barcodeFlash === 'error'
                  ? 'ring-2 ring-red-500/50 border-red-500/50'
                  : 'focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/50'
            }`}
          />
        </div>

        {/* Search bar */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar producto por nombre o SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11 text-base bg-background/80 backdrop-blur-sm focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500/50 focus-visible:shadow-[0_0_20px_rgba(16,185,129,0.12)] transition-all duration-200"
          />
          {/* Barcode scanner active indicator */}
          {!anyDialogOpen && (
            <div
              className={`absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 transition-all duration-300 ${
                barcodeFlash === 'success'
                  ? 'opacity-100'
                  : barcodeFlash === 'error'
                    ? 'opacity-100'
                    : 'opacity-50'
              }`}
            >
              <div
                className={`h-1.5 w-1.5 rounded-full transition-colors duration-300 ${
                  barcodeFlash === 'success'
                    ? 'bg-emerald-500'
                    : barcodeFlash === 'error'
                      ? 'bg-red-500'
                      : 'bg-emerald-400 animate-pulse'
                }`}
              />
              <span className="text-[11px] text-muted-foreground hidden sm:inline whitespace-nowrap">
                Escáner activo
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Category tabs - wrap so all categories are visible */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className={`shrink-0 h-8 transition-all duration-200 ${selectedCategory === 'all' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15 shadow-sm shadow-emerald-500/10' : 'hover:bg-muted/80'}`}
          onClick={() => setSelectedCategory('all')}
        >
          Todos
        </Button>
        {categories.map((cat) => (
          <Button
            key={cat.id}
            variant="outline"
            size="sm"
            className={`shrink-0 h-8 transition-all duration-200 ${selectedCategory === String(cat.id) ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15 shadow-sm shadow-emerald-500/10' : 'hover:bg-muted/80'}`}
            onClick={() => setSelectedCategory(String(cat.id))}
          >
            {cat.name}
          </Button>
        ))}
        {services.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className={`shrink-0 h-8 gap-1 transition-all duration-200 ${selectedCategory === 'servicios' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15 shadow-sm shadow-emerald-500/10' : 'hover:bg-muted/80'}`}
            onClick={() => setSelectedCategory('servicios')}
          >
            <Star className="h-3.5 w-3.5" />
            Servicios
          </Button>
        )}
      </div>

      {/* ═══ PRODUCT GRID ═════════════════════════════ */}
      <ProductGrid
        filteredProducts={filteredProducts}
        filteredServices={filteredServices}
        isLoadingProducts={isLoadingProducts}
        searchQuery={searchQuery}
        selectedCategory={selectedCategory}
        currencyCode={currencyCode}
        cart={cart.cart}
        onAddToCart={cart.addToCart}
        onAddService={(service) => cart.addServiceToCart(service as any)}
      />

      {/* ═══ FLOATING CART FAB ═══════════════════════ */}
      {cart.cartItemCount > 0 && (
        <button
          onClick={() => cart.setCartSheetOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 h-14 px-5 rounded-full bg-emerald-600 hover:bg-emerald-700 hover:shadow-2xl hover:shadow-emerald-600/40 active:scale-95 text-white font-bold shadow-xl shadow-emerald-600/30 transition-all duration-200 lg:bottom-8 lg:right-8"
        >
          <ShoppingCart className="h-5 w-5" />
          <span className="text-sm">{cart.cartItemCount}</span>
          <span className="text-sm">— {formatCurrency(cart.total, currencyCode)}</span>
        </button>
      )}

      {/* ═══ LAST ORDER INFO (when no cart) ═══════════ */}
      {cart.cartItemCount === 0 && cart.lastOrderNumber && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <p className="text-sm text-center text-muted-foreground">
            Última venta: <span className="font-semibold">{cart.lastOrderNumber}</span>
          </p>
          {cart.lastOrderData && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs gap-1"
                onClick={printLastOrderTicket}
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Imprimir</span>
                {cart.lastInvoiceData?.cufe && <Badge variant="outline" className="text-[9px] px-1 py-0 text-primary border-primary/30">FE</Badge>}
                {cart.lastDocType === 'DOC_EQUIPOS' && !cart.lastInvoiceData?.cufe && <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300">Doc.Equi</Badge>}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs gap-1 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => returnDialogRef.current?.openReturnDialog(cart.lastOrderData!.id)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Devolver</span>
              </Button>
            </>
          )}
        </div>
      )}

      {/* ═══ RECENT SALES + RETURN FAB (when no cart) ═══ */}
      {cart.cartItemCount === 0 && (
        <div className="flex items-center justify-center pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5"
            onClick={() => {
              setShowRecentSales(true)
              fetchRecentSales()
            }}
          >
            <Clock className="h-3.5 w-3.5" />
            Ventas recientes / Devoluciones
          </Button>
        </div>
      )}

      {/* ═══ CART SHEET ═══════════════════════════════ */}
      <CartSidebar
        cart={cart.cart}
        cartItemCount={cart.cartItemCount}
        subtotal={cart.subtotal}
        taxEstimate={cart.taxEstimate}
        discountAmount={cart.discountAmount}
        total={cart.total}
        updateQuantity={cart.updateQuantity}
        removeFromCart={cart.removeFromCart}
        updateItemNotes={cart.updateItemNotes}
        clearCart={cart.clearCart}
        discountType={cart.discountType}
        setDiscountType={cart.setDiscountType}
        discountValue={cart.discountValue}
        setDiscountValue={cart.setDiscountValue}
        discountReason={cart.discountReason}
        setDiscountReason={cart.setDiscountReason}
        showDiscountInput={cart.showDiscountInput}
        setShowDiscountInput={cart.setShowDiscountInput}
        tipAmount={cart.tipAmount}
        setTipAmount={cart.setTipAmount}
        showTipInput={cart.showTipInput}
        setShowTipInput={cart.setShowTipInput}
        selectedCustomer={cart.selectedCustomer}
        setSelectedCustomer={cart.setSelectedCustomer}
        notes={cart.notes}
        setNotes={cart.setNotes}
        paymentMethod={cart.paymentMethod}
        setPaymentMethod={cart.setPaymentMethod}
        transferRef={cart.transferRef}
        setTransferRef={cart.setTransferRef}
        cartSheetOpen={cart.cartSheetOpen}
        setCartSheetOpen={cart.setCartSheetOpen}
        setShowChargeDialog={cart.setShowChargeDialog}
        lastOrderNumber={cart.lastOrderNumber}
        lastOrderData={cart.lastOrderData}
        lastInvoiceData={cart.lastInvoiceData}
        lastDocType={cart.lastDocType}
        customers={customers}
        openCashRegisters={openCashRegisters}
        selectedCashRegisterId={selectedCashRegisterId}
        setSelectedCashRegisterId={setSelectedCashRegisterId}
        currencyCode={currencyCode}
        printLastOrderTicket={printLastOrderTicket}
        returnDialogRef={returnDialogRef}
      />

      {/* ═══ CHARGE CONFIRMATION DIALOG ═══════════════ */}
      <PaymentDialog
        open={cart.showChargeDialog}
        onOpenChange={cart.setShowChargeDialog}
        cartItemCount={cart.cartItemCount}
        cart={cart.cart}
        subtotal={cart.subtotal}
        taxEstimate={cart.taxEstimate}
        discountAmount={cart.discountAmount}
        discountType={cart.discountType}
        discountValue={cart.discountValue}
        discountReason={cart.discountReason}
        tipAmount={cart.tipAmount}
        total={cart.total}
        paymentMethod={cart.paymentMethod}
        selectedCustomer={cart.selectedCustomer}
        hasStoreNit={cart.hasStoreNit}
        isEInvEnabled={cart.isEInvEnabled}
        posInvoiceMode={cart.posInvoiceMode}
        setPosInvoiceMode={cart.setPosInvoiceMode}
        creatingInvoice={cart.creatingInvoice}
        invoiceCustomerNit={cart.invoiceCustomerNit}
        setInvoiceCustomerNit={cart.setInvoiceCustomerNit}
        invoiceCustomerName={cart.invoiceCustomerName}
        setInvoiceCustomerName={cart.setInvoiceCustomerName}
        invoiceCustomerEmail={cart.invoiceCustomerEmail}
        setInvoiceCustomerEmail={cart.setInvoiceCustomerEmail}
        storeName={store?.name}
        storeNit={store?.nit}
        resolutionNumber={store?.resolutionNumber}
        invoicePrefix={store?.invoicePrefix}
        customers={customers}
        currencyCode={currencyCode}
        isSubmitting={cart.isSubmitting}
        handleSubmitOrder={cart.handleSubmitOrder}
      />

      {/* ═══ RETURN DIALOG ═════════════════════════════ */}
      <POSReturnDialog
        ref={returnDialogRef}
        storeId={storeId}
        onReturnSuccess={handleReturnSuccess}
      />

      {/* ═══ RECENT SALES DIALOG ════════════════════════ */}
      <POSRecentSales
        open={showRecentSales}
        onClose={setShowRecentSales}
        recentOrders={recentOrders}
        loading={loadingRecentSales}
        search={recentSalesSearch}
        onSearchChange={setRecentSalesSearch}
        returnDialogRef={returnDialogRef}
        currencyCode={currencyCode}
      />
    </div>
  )
}
