'use client'

import { useCreateInvoice, useCreateOrder } from '@/hooks/api/use-pos'
import { DIAN_CONSUMIDOR_FINAL_NIT, getUnitOfMeasureLabel } from '@/lib/constants'
import { floorQty, isFractionalUnit, roundQty } from '@/lib/format'
import { useOffline } from '@/lib/offline/offline-provider'
import { enqueuePendingOrder } from '@/lib/offline/sync'
import { playCartAdd, playError, playSaleSuccess } from '@/lib/pos-sounds'
import { clearPosCartDraft, loadPosCartDraft, savePosCartDraft } from '@/lib/pos-cart-draft'
import { useAuthStore } from '@/stores/auth-store'
import type { CartItem, CustomerSummary, InvoiceMode, LastInvoiceData, LastOrderData, PaymentMethod, ProductPresentation, Service, PaymentSplit } from '@/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { OpenCashRegister, Product } from './use-pos-data'

// ─── Types ──────────────────────────────────────────────

export type DiscountType = 'NONE' | 'PERCENTAGE' | 'FIXED'

// ─── Hook deps ─────────────────────────────────────────

interface UsePosCartDeps {
  products: Product[]
  openCashRegisters: OpenCashRegister[]
  selectedCashRegisterId: string
  customers: CustomerSummary[]
  fetchOpenCashRegisters: () => void | Promise<void>
}

// ─── Cart line helpers ──────────────────────────────────
// A product can be in the cart as multiple simultaneous lines — its base
// "Unidad" plus up to 2 presentations (Six-pack, Caja x24) — all drawing
// from the SAME shared stock pool (in base units). These helpers keep that
// pool honest across every mutation.

function isSameLine(item: CartItem, productId: number, presentationId: number | null) {
  return item.productId === productId && (item.presentationId ?? null) === presentationId
}

/** Recompute each product-line's `maxStock` as "how many more of THIS line's
 * unit could be added without the combined base-unit usage of every line of
 * this same product exceeding currentStock" — keeps +/- buttons and
 * add-to-cart honest when a product has several simultaneous presentation lines. */
const UNLIMITED_STOCK = 999999

function recomputeMaxStock(items: CartItem[], products: Product[]): CartItem[] {
  const productsById = new Map(products.map((p) => [p.id, p]))
  const baseUnitsByProduct = new Map<number, number>()
  for (const item of items) {
    if (item.isService || !item.productId) continue
    const used = item.quantity * (item.unitsPerPack || 1)
    baseUnitsByProduct.set(item.productId, (baseUnitsByProduct.get(item.productId) ?? 0) + used)
  }
  return items.map((item) => {
    if (item.isService || !item.productId) return item
    const product = productsById.get(item.productId)
    if (product && product.trackInventory === false) return { ...item, maxStock: UNLIMITED_STOCK }
    const currentStock = product?.currentStock ?? 0
    const unitsPerPack = item.unitsPerPack || 1
    const ownUsage = item.quantity * unitsPerPack
    const otherUsage = (baseUnitsByProduct.get(item.productId) ?? 0) - ownUsage
    const remaining = Math.max(0, currentStock - otherUsage)
    // maxStock es en unidades de ESTA línea. Líneas fraccionables (KG/L/M)
    // conservan 3 decimales (0.5 KG); líneas discretas se redondean a entero
    // (no tiene sentido vender 0.104 "Cajas x24").
    const lineMax = remaining / unitsPerPack
    const maxStock = isFractionalUnit(item.unitLabel) ? floorQty(lineMax) : Math.floor(floorQty(lineMax))
    return { ...item, maxStock }
  })
}

// ─── Hook ──────────────────────────────────────────────

export function usePosCart(deps: UsePosCartDeps) {
  const { store } = useAuthStore()
  const storeId = store?.id

  // ─── Borrador de venta en curso (sobrevive recargas / evicción de la PWA) ──
  const [initialDraft] = useState(() => loadPosCartDraft(storeId))

  // ─── Cart state ──────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>(() => initialDraft?.cart ?? [])
  const [selectedCustomer, setSelectedCustomer] = useState<string>(() => initialDraft?.selectedCustomer ?? 'none')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() => initialDraft?.paymentMethod ?? 'CASH')
  const [notes, setNotes] = useState(() => initialDraft?.notes ?? '')
  const [tipAmount, setTipAmount] = useState<number>(() => initialDraft?.tipAmount ?? 0)
  const [showTipInput, setShowTipInput] = useState(() => (initialDraft?.tipAmount ?? 0) > 0)
  const [transferRef, setTransferRef] = useState(() => initialDraft?.transferRef ?? '')

  // ─── Split-tender (multiple payment methods for one sale) ───────────
  // Empty → single-method flow. Non-empty → paymentMethod resolves to 'MIXED'
  // and every row is a payment allocation (amount + per-method reference).
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>(() => initialDraft?.paymentSplits ?? [])

  // ─── Discount states ─────────────────────────────────
  const [discountType, setDiscountType] = useState<DiscountType>(() => initialDraft?.discountType ?? 'NONE')
  const [discountValue, setDiscountValue] = useState<number>(() => initialDraft?.discountValue ?? 0)
  const [discountReason, setDiscountReason] = useState(() => initialDraft?.discountReason ?? '')
  const [showDiscountInput, setShowDiscountInput] = useState(() => (initialDraft?.discountType ?? 'NONE') !== 'NONE')

  // ─── UI states ───────────────────────────────────────
  const [showChargeDialog, setShowChargeDialog] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [cartSheetOpen, setCartSheetOpen] = useState(false)

  // ─── Invoice mode ────────────────────────────────────
  const isEInvEnabled = !!store?.invoiceEnabled && !!store?.nit
  const hasStoreNit = !!store?.nit
  const [posInvoiceMode, setPosInvoiceMode] = useState<InvoiceMode>(() => initialDraft?.posInvoiceMode ?? 'TIRILLA')
  const [lastInvoiceData, setLastInvoiceData] = useState<LastInvoiceData | null>(null)
  const [lastDocType, setLastDocType] = useState<'TIRILLA' | 'DOC_EQUIPOS' | 'ELECTRONICA'>('TIRILLA')
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [invoiceCustomerNit, setInvoiceCustomerNit] = useState('')
  const [invoiceCustomerName, setInvoiceCustomerName] = useState('')
  const [invoiceCustomerEmail, setInvoiceCustomerEmail] = useState('')

  // ─── Last order ──────────────────────────────────────
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null)
  const [lastOrderData, setLastOrderData] = useState<LastOrderData | null>(null)

  // ─── TanStack Query Mutations ────────────────────────

  const createOrderMutation = useCreateOrder()
  const createInvoiceMutation = useCreateInvoice()
  const { isOnline } = useOffline()

  // ─── Persistencia del borrador ───────────────────────
  // Snapshot vivo del borrador (leído por el autosave y por el flush).
  const draftRef = useRef({
    cart, selectedCustomer, paymentMethod, notes, tipAmount, transferRef,
    paymentSplits, discountType, discountValue, discountReason, posInvoiceMode,
  })
  draftRef.current = {
    cart, selectedCustomer, paymentMethod, notes, tipAmount, transferRef,
    paymentSplits, discountType, discountValue, discountReason, posInvoiceMode,
  }

  // Reconciliar el borrador restaurado contra el catálogo actual: quitar líneas
  // de productos que ya no existen. Corre una sola vez, al llegar el catálogo.
  const didReconcileDraft = useRef(false)
  useEffect(() => {
    if (didReconcileDraft.current) return
    if (!initialDraft || initialDraft.cart.length === 0) { didReconcileDraft.current = true; return }
    if (deps.products.length === 0) return
    didReconcileDraft.current = true
    setCart((prev) => {
      const valid = prev.filter(
        (l) => l.isService || (l.productId != null && deps.products.some((p) => p.id === l.productId))
      )
      if (valid.length !== prev.length) {
        toast.info('Se quitaron líneas del pedido guardado (productos ya no disponibles).')
      }
      return valid.length === prev.length ? prev : valid
    })
  }, [deps.products, initialDraft])

  // Autosave con debounce.
  useEffect(() => {
    if (!storeId) return
    const t = setTimeout(() => savePosCartDraft(storeId, draftRef.current), 400)
    return () => clearTimeout(t)
  }, [storeId, cart, selectedCustomer, paymentMethod, notes, tipAmount, transferRef, paymentSplits, discountType, discountValue, discountReason, posInvoiceMode])

  // Flush inmediato al ir a segundo plano / cerrar — el momento en que el SO
  // suele descartar la PWA.
  useEffect(() => {
    if (!storeId) return
    const flush = () => savePosCartDraft(storeId, draftRef.current)
    const onVis = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [storeId])

  // ─── Cart operations ─────────────────────────────────
  const addToCart = useCallback(
    (product: Product) => {
      const wasEmpty = cart.length === 0
      let didAdd = false
      setCart((prev) => {
        const existing = prev.find((item) => isSameLine(item, product.id, null))
        const otherUsage = prev
          .filter((item) => !item.isService && item.productId === product.id && item !== existing)
          .reduce((sum, item) => sum + item.quantity * (item.unitsPerPack || 1), 0)
        const wouldUse = (existing ? existing.quantity + 1 : 1) + otherUsage
        // roundQty evita 0.1+0.2=0.30000000000000004 en la comparación
        if (product.trackInventory !== false && roundQty(wouldUse) > roundQty(product.currentStock)) {
          toast.warning(existing ? `Stock insuficiente para "${product.name}"` : `Sin stock para "${product.name}"`)
          return prev
        }
        didAdd = true
        const next = existing
          ? prev.map((item) => (item === existing ? { ...item, quantity: roundQty(item.quantity + 1) } : item))
          : [
              ...prev,
              {
                productId: product.id,
                serviceId: null,
                presentationId: null,
                presentationName: null,
                unitLabel: product.unitLabel,
                unitsPerPack: 1,
                name: product.name,
                salePrice: product.salePrice,
                quantity: 1,
                maxStock: product.trackInventory === false ? UNLIMITED_STOCK : floorQty(product.currentStock),
                isService: false,
                taxRate: product.taxRate || undefined,
              },
            ]
        return recomputeMaxStock(next, deps.products)
      })
      if (didAdd) {
        playCartAdd()
      }
      // Auto-open cart sheet when first product is added
      if (wasEmpty) {
        setCartSheetOpen(true)
      }
    },
    [cart.length, deps.products]
  )

  const addPresentationToCart = useCallback(
    (product: Product, presentation: ProductPresentation) => {
      const wasEmpty = cart.length === 0
      let didAdd = false
      setCart((prev) => {
        const existing = prev.find((item) => isSameLine(item, product.id, presentation.id))
        const otherUsage = prev
          .filter((item) => !item.isService && item.productId === product.id && item !== existing)
          .reduce((sum, item) => sum + item.quantity * (item.unitsPerPack || 1), 0)
        const wouldUseUnits = ((existing ? existing.quantity + 1 : 1) * presentation.unitsPerPack) + otherUsage
        if (product.trackInventory !== false && roundQty(wouldUseUnits) > roundQty(product.currentStock)) {
          toast.warning(`Stock insuficiente para "${product.name} — ${getUnitOfMeasureLabel(presentation.unitLabel)}"`)
          return prev
        }
        didAdd = true
        const next = existing
          ? prev.map((item) => (item === existing ? { ...item, quantity: roundQty(item.quantity + 1) } : item))
          : [
              ...prev,
              {
                productId: product.id,
                serviceId: null,
                presentationId: presentation.id,
                presentationName: getUnitOfMeasureLabel(presentation.unitLabel),
                unitLabel: presentation.unitLabel,
                unitsPerPack: presentation.unitsPerPack,
                name: product.name,
                salePrice: presentation.salePrice,
                quantity: 1,
                maxStock: product.trackInventory === false ? UNLIMITED_STOCK : floorQty(product.currentStock / presentation.unitsPerPack),
                isService: false,
                taxRate: product.taxRate || undefined,
              },
            ]
        return recomputeMaxStock(next, deps.products)
      })
      if (didAdd) {
        playCartAdd()
      }
      if (wasEmpty) {
        setCartSheetOpen(true)
      }
    },
    [cart.length, deps.products]
  )

  const addServiceToCart = useCallback(
    (service: Service) => {
      const wasEmpty = cart.length === 0
      let didAdd = false
      setCart((prev) => {
        const existing = prev.find((item) => item.serviceId === service.id)
        if (existing) {
          didAdd = true
          return prev.map((item) =>
            item.serviceId === service.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          )
        }
        didAdd = true
        return [
          ...prev,
          {
            productId: null,
            serviceId: service.id,
            name: service.name,
            salePrice: service.price,
            quantity: 1,
            maxStock: 999999,
            isService: true,
          },
        ]
      })
      if (didAdd) {
        playCartAdd()
      }
      if (wasEmpty) {
        setCartSheetOpen(true)
      }
    },
    [cart.length]
  )

  const updateQuantity = useCallback(
    (itemId: number, delta: number, isService: boolean, presentationId: number | null = null) => {
      setCart((prev) => {
        const next = prev
          .map((item) => {
            const match = isService
              ? item.serviceId === itemId
              : isSameLine(item, itemId, presentationId)
            if (!match) return item
            const newQty = roundQty(item.quantity + delta)
            if (newQty <= 0) return null
            if (!item.isService && newQty > item.maxStock) {
              toast.warning('Stock insuficiente')
              return item
            }
            return { ...item, quantity: newQty }
          })
          .filter(Boolean) as CartItem[]
        return recomputeMaxStock(next, deps.products)
      })
    },
    [deps.products]
  )

  /**
   * Setea la cantidad EXACTA de una línea (usado por el input editable del
   * POS). Normaliza coma decimal y redondea a QTY_PRECISION. Si supera el
   * stock disponible (maxStock), se ajusta y advierte.
   */
  const setQuantity = useCallback(
    (itemId: number, value: number, isService: boolean, presentationId: number | null = null) => {
      setCart((prev) => {
        const next = prev
          .map((item) => {
            const match = isService
              ? item.serviceId === itemId
              : isSameLine(item, itemId, presentationId)
            if (!match) return item
            const newQty = roundQty(value)
            if (newQty <= 0) return null
            // No dejar pasar el stock disponible (maxStock) para productos con tracking
            if (!item.isService && newQty > item.maxStock) {
              toast.warning(`Stock insuficiente (máx. ${item.maxStock})`)
              return { ...item, quantity: item.maxStock }
            }
            return { ...item, quantity: newQty }
          })
          .filter(Boolean) as CartItem[]
        return recomputeMaxStock(next, deps.products)
      })
    },
    [deps.products]
  )

  const removeFromCart = useCallback((itemId: number, isService: boolean, presentationId: number | null = null) => {
    setCart((prev) => {
      const next = prev.filter((item) =>
        isService ? item.serviceId !== itemId : !isSameLine(item, itemId, presentationId)
      )
      return recomputeMaxStock(next, deps.products)
    })
  }, [deps.products])

  // ─── Update per-item notes ───────────────────────────
  const updateItemNotes = useCallback((itemId: number, isService: boolean, itemNotes: string, presentationId: number | null = null) => {
    setCart((prev) =>
      prev.map((item) => {
        const match = isService ? item.serviceId === itemId : isSameLine(item, itemId, presentationId)
        if (!match) return item
        return { ...item, notes: itemNotes.trim() || undefined }
      })
    )
  }, [])

  const clearCart = useCallback(() => {
    setCart([])
    setNotes('')
    setSelectedCustomer('none')
    setLastOrderNumber(null)
    setLastOrderData(null)
    setTipAmount(0)
    setShowTipInput(false)
    setTransferRef('')
    setPaymentSplits([])
    setDiscountType('NONE')
    setDiscountValue(0)
    setDiscountReason('')
    setShowDiscountInput(false)
    setCartSheetOpen(false)
    setInvoiceCustomerNit('')
    setInvoiceCustomerName('')
    setInvoiceCustomerEmail('')
    clearPosCartDraft(storeId)
  }, [storeId])

  const clearLastOrder = useCallback(() => {
    setLastOrderNumber(null)
    setLastOrderData(null)
  }, [])

  // ─── Cart calculations ───────────────────────────────
  const cartItemCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart])
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.salePrice * item.quantity, 0), [cart])

  // Estimated tax breakdown (prices in Colombia are tax-inclusive)
  const taxEstimate = useMemo(() => {
    const breakdown: Record<string, { name: string; code: string; base: number; rate: number; amount: number }> = {}
    let totalTax = 0
    for (const item of cart) {
      const tr = item.taxRate
      if (!tr || tr.rate === 0 || tr.rateType !== 'PERCENTAGE') continue
      const totalRow = item.salePrice * item.quantity
      const base = Math.round(totalRow / (1 + tr.rate / 100))
      const tax = totalRow - base
      if (breakdown[tr.code]) {
        breakdown[tr.code].base += base
        breakdown[tr.code].amount += tax
      } else {
        breakdown[tr.code] = { name: tr.name, code: tr.code, base, rate: tr.rate, amount: tax }
      }
      totalTax += tax
    }
    return { breakdown: Object.values(breakdown), totalTax }
  }, [cart])

  const discountAmount = useMemo(() => {
    if (discountType === 'PERCENTAGE') {
      return Math.round(subtotal * discountValue / 100)
    }
    if (discountType === 'FIXED') {
      return Math.min(discountValue, subtotal)
    }
    return 0
  }, [discountType, discountValue, subtotal])

  const total = useMemo(() => subtotal - discountAmount + tipAmount, [subtotal, discountAmount, tipAmount])

  // ─── Split-tender operations ─────────────────────────
  const allocatedSum = useMemo(
    () => roundQty(paymentSplits.reduce((sum, p) => sum + p.amount, 0)),
    [paymentSplits]
  )

  const addPaymentSplit = useCallback(() => {
    setPaymentSplits((prev) => {
      const used = prev.reduce((sum, p) => sum + p.amount, 0)
      const remaining = Math.max(0, roundQty(total - used))
      if (remaining <= 0) return prev
      const id = `split-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      const method: PaymentMethod = prev.length === 0 ? 'CASH' : prev[prev.length - 1].method
      return [...prev, { id, method, amount: remaining, reference: '' }]
    })
  }, [total])

  const removePaymentSplit = useCallback((id: string) => {
    setPaymentSplits((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const updatePaymentSplit = useCallback(
    (id: string, patch: Partial<Omit<PaymentSplit, 'id'>>) => {
      setPaymentSplits((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
    },
    []
  )

  // ─── Submit order ────────────────────────────────────
  const handleSubmitOrder = async () => {
    if (!storeId || cart.length === 0) return

    // Block if no cash register is open — backend also validates, but catch early on frontend
    if (deps.openCashRegisters.length === 0) {
      toast.error('Debes abrir la caja antes de registrar una venta. Ve a Contabilidad → Caja.')
      playError()
      setShowChargeDialog(false)
      return
    }

    const isSplit = paymentSplits.length > 0

    // Fiado requires a customer
    if (paymentMethod === 'FIADO' && selectedCustomer === 'none') {
      toast.error('Para vender fiado debes seleccionar un cliente')
      playError()
      setShowChargeDialog(false)
      return
    }

    // Transfer/Nequi/Daviplata require reference number (single-method path only)
    if (!isSplit && ['TRANSFER', 'NEQUI', 'DAVIPLATA'].includes(paymentMethod) && !transferRef.trim()) {
      toast.error(`Ingresa el número de ${paymentMethod === 'TRANSFER' ? 'transferencia' : paymentMethod === 'NEQUI' ? 'Nequi' : 'Daviplata'}`)
      playError()
      setShowChargeDialog(false)
      return
    }

    // Split-tender: multiple payment methods for a single sale
    if (isSplit) {
      if (roundQty(allocatedSum) !== roundQty(total)) {
        toast.error('La suma de los pagos debe ser igual al total')
        playError()
        return
      }
      for (const split of paymentSplits) {
        if (split.amount <= 0) {
          toast.error('Todos los pagos deben tener un monto mayor a 0')
          playError()
          return
        }
        if (['TRANSFER', 'NEQUI', 'DAVIPLATA', 'WOMPI'].includes(split.method) && !split.reference?.trim()) {
          toast.error(`Ingresa la referencia para ${split.method}`)
          playError()
          return
        }
      }
    }

    setIsSubmitting(true)

    const resolvedPaymentMethod = isSplit ? 'MIXED' : paymentMethod

    // Transfer/Nequi/Daviplata: append reference to notes (single-method path)
    const isTransferMethod = !isSplit && ['TRANSFER', 'NEQUI', 'DAVIPLATA'].includes(paymentMethod)
    const transferNote = isTransferMethod && transferRef.trim() ? `Ref: ${transferRef.trim()}` : ''

    try {
      const payload = {
        storeId,
        customerId: selectedCustomer !== 'none' ? Number(selectedCustomer) : null,
        cashRegisterId: deps.selectedCashRegisterId !== 'auto' ? Number(deps.selectedCashRegisterId) : undefined,
        paymentMethod: resolvedPaymentMethod,
        tipAmount: resolvedPaymentMethod !== 'FIADO' ? tipAmount : 0,
        discountType,
        discountAmount,
        discountReason: discountReason.trim() || undefined,
        notes: [
          notes.trim(),
          transferNote,
        ].filter(Boolean).join(' | ') || undefined,
        items: cart.map((item) => ({
          ...(item.isService ? { serviceId: item.serviceId } : { productId: item.productId }),
          ...(item.presentationId ? { presentationId: item.presentationId } : {}),
          quantity: item.quantity,
          notes: item.notes || undefined,
        })),
        ...(isSplit
          ? {
              paymentSplits: paymentSplits.map(({ id, method, amount, reference }) => ({ method, amount, reference })),
            }
          : {}),
      }

      let order: any
      let wasOffline = false

      if (isOnline) {
        // ── Online: submit directly to server ──
        order = await createOrderMutation.mutateAsync(payload)
      } else {
        // ── Offline: enqueue in IndexedDB for later sync ──
        const tempNumber = await enqueuePendingOrder(storeId, payload)
        wasOffline = true
        order = {
          orderNumber: tempNumber,
          id: null,
          status: 'PENDING_SYNC',
          offline: true,
        }
      }

      playSaleSuccess()

      if (wasOffline) {
        toast.success('¡Venta registrada offline!', {
          description: `Se sincronizará cuando vuelva la conexión`,
          duration: 5000,
        })
      } else {
        toast.success('¡Venta registrada!', {
          description: `Orden ${order.orderNumber}`,
        })
      }

      // Refresh open cash registers after sale
      deps.fetchOpenCashRegisters()

      setLastOrderNumber(order.orderNumber)
      setLastOrderData(
        paymentSplits.length > 0
          ? { ...order, paymentSplits: paymentSplits.map(({ id, method, amount, reference }) => ({ method, amount, reference })) }
          : order
      )
      setLastDocType(posInvoiceMode)
      clearPosCartDraft(storeId)
      setCart([])
      setNotes('')
      setTipAmount(0)
      setShowTipInput(false)
      setTransferRef('')
      setPaymentSplits([])
      setDiscountType('NONE')
      setDiscountValue(0)
      setDiscountReason('')
      setShowDiscountInput(false)
      setCartSheetOpen(false)

      // ── Auto-create electronic invoice if selected (only when online) ──
      if (!wasOffline && posInvoiceMode === 'ELECTRONICA' && isEInvEnabled && order.id) {
        try {
          setCreatingInvoice(true)
          // Determine NIT: manual input > selected customer > consumidor final
          const finalNit = invoiceCustomerNit.trim()
            ? invoiceCustomerNit.trim().replace(/[^0-9]/g, '')
            : (selectedCustomer !== 'none'
                ? (deps.customers.find(c => String(c.id) === selectedCustomer)?.nit?.replace(/[^0-9]/g, '') || DIAN_CONSUMIDOR_FINAL_NIT)
                : DIAN_CONSUMIDOR_FINAL_NIT)
          const finalName = invoiceCustomerName.trim()
            || (selectedCustomer !== 'none'
              ? deps.customers.find(c => String(c.id) === selectedCustomer)?.name
              : undefined)
          const finalEmail = invoiceCustomerEmail.trim() || undefined

          const invBody: { orderId: number; testMode: boolean; customerNit: string; customerName: string; autoSend: boolean; customerEmail?: string } = {
            orderId: order.id,
            testMode: store?.invoiceTestMode ?? true,
            customerNit: finalNit,
            customerName: finalName || 'Consumidor Final',
            autoSend: true,
          }
          if (finalEmail) invBody.customerEmail = finalEmail

          const invoiceData = await createInvoiceMutation.mutateAsync(invBody)
          setLastInvoiceData(invoiceData)
          toast.success(`Factura electrónica ${invoiceData.invoiceNumber} generada`, {
            description: 'CUFE generado correctamente',
            duration: 5000,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Error al generar factura electrónica'
          toast.error(`Error al generar factura: ${msg}`, { duration: 6000 })
        } finally {
          setCreatingInvoice(false)
        }
      }
    } catch (err) {
      playError()
      toast.error(err instanceof Error ? err.message : 'Error al registrar la venta')
    } finally {
      setIsSubmitting(false)
      setShowChargeDialog(false)
    }
  }

  return {
    // Cart state
    cart,
    cartItemCount,
    subtotal,
    taxEstimate,
    discountAmount,
    total,

    // Cart operations
    addToCart,
    addPresentationToCart,
    addServiceToCart,
    updateQuantity,
    setQuantity,
    removeFromCart,
    updateItemNotes,
    clearCart,

    // Discount state
    discountType, setDiscountType,
    discountValue, setDiscountValue,
    discountReason, setDiscountReason,
    showDiscountInput, setShowDiscountInput,

    // Tip
    tipAmount, setTipAmount,
    showTipInput, setShowTipInput,

    // Customer, notes, payment
    selectedCustomer, setSelectedCustomer,
    notes, setNotes,
    paymentMethod, setPaymentMethod,
    transferRef, setTransferRef,
    paymentSplits, setPaymentSplits,
    addPaymentSplit, removePaymentSplit, updatePaymentSplit, allocatedSum,

    // UI state
    cartSheetOpen, setCartSheetOpen,
    showChargeDialog, setShowChargeDialog,
    isSubmitting,

    // Invoice state
    isEInvEnabled,
    hasStoreNit,
    posInvoiceMode, setPosInvoiceMode,
    creatingInvoice,
    invoiceCustomerNit, setInvoiceCustomerNit,
    invoiceCustomerName, setInvoiceCustomerName,
    invoiceCustomerEmail, setInvoiceCustomerEmail,

    // Last order
    lastOrderNumber, lastOrderData,
    lastInvoiceData, lastDocType,
    clearLastOrder,

    // Submit
    handleSubmitOrder,
  }
}
