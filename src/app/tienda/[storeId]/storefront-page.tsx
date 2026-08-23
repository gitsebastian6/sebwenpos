'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ProductImage } from '@/components/ui/product-image'
import { getUnitOfMeasureLabel as unitLabelText } from '@/lib/constants'
import { parseQtyInput, qtyStepFor, roundQty, formatQty, clampQty } from '@/lib/format'
import {
  Store, Phone, MapPin, ShoppingCart, MessageCircle,
  Plus, Minus, Trash2, Search, X, ArrowRight, Loader2,
} from 'lucide-react'

interface Presentation {
  id: number
  name: string
  unitLabel: string
  unitsPerPack: number
  salePrice: number
  barcode: string | null
  sku: string | null
}

interface Product {
  id: number
  name: string
  salePrice: number
  unitLabel: string
  description: string | null
  imgUrl: string | null
  sku: string | null
  presentations?: Presentation[]
}

interface Category {
  id: number
  name: string
  icon: string | null
  products: Product[]
}

interface StoreInfo {
  id: number
  name: string
  phone: string | null
  address: string | null
  cityName: string | null
  currencyCode: string
}

interface CartItem {
  key: string
  productId: number
  presentationId: number | null
  unitLabel?: string
  name: string
  presentationLabel: string | null
  price: number
  imgUrl: string | null
  quantity: number
}

export default function StorefrontPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = useParams<{ storeId: string }>()
  const [store, setStore] = useState<StoreInfo | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [showCart, setShowCart] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadStore() {
      try {
        const res = await fetch(`/api/public/store/${storeId}`)
        if (!res.ok) throw new Error('Tienda no encontrada')
        const data = await res.json()
        setStore(data.store)
        setCategories(data.categories)
      } catch (err) {
        setError('No pudimos cargar esta tienda')
      } finally {
        setLoading(false)
      }
    }
    loadStore()
  }, [storeId])

  function addToCart(product: Product, presentation: Presentation | null) {
    const key = `${product.id}-${presentation?.id ?? 'base'}`
    const price = presentation ? presentation.salePrice : product.salePrice
    setCart(prev => {
      const existing = prev.find(item => item.key === key)
      if (existing) {
        return prev.map(item =>
          item.key === key ? { ...item, quantity: item.quantity + 1 } : item
        )
      }
      const baseLabel = product.unitLabel !== 'UND' ? unitLabelText(product.unitLabel) : null
      const presentationLabel = presentation
        ? `${unitLabelText(presentation.unitLabel)} ×${presentation.unitsPerPack}`
        : baseLabel
      return [...prev, {
        key,
        productId: product.id,
        presentationId: presentation?.id ?? null,
        unitLabel: presentation ? presentation.unitLabel : product.unitLabel,
        name: product.name,
        presentationLabel,
        price,
        imgUrl: product.imgUrl,
        quantity: 1,
      }]
    })
  }

  function updateQuantity(key: string, delta: number) {
    setCart(prev =>
      prev
        .map(item => item.key === key ? { ...item, quantity: roundQty(item.quantity + delta) } : item)
        .filter(item => roundQty(item.quantity) > 0)
    )
  }

  function setCartQty(key: string, value: number) {
    setCart(prev =>
      prev
        .map(item => item.key === key ? { ...item, quantity: clampQty(value, 0.001) } : item)
    )
  }

  function removeFromCart(key: string) {
    setCart(prev => prev.filter(item => item.key !== key))
  }

  function formatPrice(price: number) {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: store?.currencyCode || 'COP',
      minimumFractionDigits: 0,
    }).format(price)
  }

  function getCartTotal() {
    return cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  }

  function getCartCount() {
    return cart.reduce((sum, item) => sum + item.quantity, 0)
  }

  function sendWhatsAppOrder() {
    if (!store?.phone || cart.length === 0) return

    let message = `🛒 *Pedido de Tienda Virtual*\n\n`
    message += `📋 *${store.name}*\n\n`

    cart.forEach(item => {
      const label = item.presentationLabel ? ` (${item.presentationLabel})` : ''
      message += `• ${item.name}${label} x${formatQty(item.quantity)} — ${formatPrice(item.price * item.quantity)}\n`
    })

    message += `\n💰 *Total: ${formatPrice(getCartTotal())}*`
    message += `\n\n_Pedido enviado desde la tienda virtual de Sebwen_`

    const phone = store.phone.replace(/\D/g, '')
    const encodedMessage = encodeURIComponent(message)
    window.open(`https://wa.me/57${phone}?text=${encodedMessage}`, '_blank')
  }

  // Filter products by search and category
  const filteredCategories = categories
    .filter(cat => !selectedCategory || cat.id === selectedCategory)
    .map(cat => ({
      ...cat,
      products: cat.products.filter(p =>
        !search || p.name.toLowerCase().includes(search.toLowerCase())
      ),
    }))
    .filter(cat => cat.products.length > 0)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
      </div>
    )
  }

  if (error || !store) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-400">
        <div className="text-center">
          <Store className="h-12 w-12 mx-auto text-zinc-700 mb-3" />
          <p className="text-lg">{error || 'Tienda no encontrada'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/60">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="Sebwen" width={28} height={28} className="object-contain" />
            <span className="font-bold text-sm text-zinc-200">{store.name}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Cart button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCart(!showCart)}
              className="relative border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-1.5"
            >
              <ShoppingCart className="h-4 w-4" />
              {getCartCount() > 0 && (
                <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center bg-emerald-500 text-white text-[10px] font-bold rounded-full">
                  {getCartCount()}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Store info bar */}
      <div className="border-b border-zinc-800/40 bg-zinc-900/30">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-4 text-xs text-zinc-500">
          {store.phone && (
            <a href={`tel:+57${store.phone.replace(/\D/g, '')}`} className="flex items-center gap-1.5 hover:text-emerald-400 transition-colors">
              <Phone className="h-3.5 w-3.5" />
              {store.phone}
            </a>
          )}
          {store.address && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {store.address}{store.cityName ? `, ${store.cityName}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
          <Input
            placeholder="Buscar productos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-10 rounded-xl border-zinc-800 bg-zinc-900/50 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Category pills */}
      <div className="max-w-3xl mx-auto px-4 pt-3 pb-1">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          <Button
            variant={selectedCategory === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(null)}
            className={`rounded-full text-xs shrink-0 ${
              selectedCategory === null
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Todo
          </Button>
          {categories.map(cat => (
            <Button
              key={cat.id}
              variant={selectedCategory === cat.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(cat.id)}
              className={`rounded-full text-xs shrink-0 ${
                selectedCategory === cat.id
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {cat.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Product grid */}
      <main className="max-w-3xl mx-auto px-4 pb-24">
        {filteredCategories.length === 0 ? (
          <div className="text-center py-16 text-zinc-600">
            <Search className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
            <p>No encontramos productos{search ? ` para "${search}"` : ''}</p>
          </div>
        ) : (
          filteredCategories.map(category => (
            <div key={category.id} className="mb-6">
              <h2 className="text-sm font-semibold text-zinc-400 mb-3">{category.name}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {category.products.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    category={category}
                    cart={cart}
                    formatPrice={formatPrice}
                    onAdd={addToCart}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </main>

      {/* Cart panel (floating bottom) */}
      {cart.length > 0 && !showCart && (
        <div className="fixed bottom-0 left-0 right-0 z-20 p-4">
          <div className="max-w-3xl mx-auto">
            <Button
              onClick={() => setShowCart(true)}
              className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-3 shadow-xl shadow-emerald-600/30"
            >
              <ShoppingCart className="h-5 w-5" />
              <span>{getCartCount()} producto{getCartCount() !== 1 ? 's' : ''}</span>
              <span className="mx-1">·</span>
              <span>{formatPrice(getCartTotal())}</span>
              <ArrowRight className="h-4 w-4 ml-auto" />
            </Button>
          </div>
        </div>
      )}

      {/* Full cart drawer */}
      {showCart && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCart(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 rounded-t-2xl max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-zinc-900 p-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-emerald-400" />
                Tu Pedido
              </h2>
              <button onClick={() => setShowCart(false)} className="text-zinc-500 hover:text-zinc-200">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {cart.map(item => (
                <div key={item.key} className="flex items-center gap-3 py-2 border-b border-zinc-800/40">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">
                      {item.name}
                      {item.presentationLabel && (
                        <span className="text-zinc-500 font-normal"> · {item.presentationLabel}</span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500">{formatPrice(item.price)} c/u</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(item.key, -qtyStepFor(item.unitLabel))}
                      className="h-7 w-7 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700"
                      disabled={item.quantity <= qtyStepFor(item.unitLabel)}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <Input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={item.quantity}
                      onChange={(e) => setCartQty(item.key, parseQtyInput(e.target.value))}
                      className="w-14 h-7 bg-zinc-800 border-zinc-700 text-center text-sm font-semibold text-zinc-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      aria-label="Cantidad"
                    />
                    <button
                      onClick={() => updateQuantity(item.key, qtyStepFor(item.unitLabel))}
                      className="h-7 w-7 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => removeFromCart(item.key)}
                      className="h-7 w-7 rounded-full flex items-center justify-center text-zinc-600 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-800 p-4 space-y-3">
              <div className="flex items-center justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-emerald-400">{formatPrice(getCartTotal())}</span>
              </div>
              <Button
                onClick={sendWhatsAppOrder}
                className="w-full h-12 rounded-xl gap-2 bg-[#25D366] hover:bg-[#20bd5a] text-white font-semibold text-base shadow-lg transition-all active:scale-[0.98]"
              >
                <MessageCircle className="h-5 w-5" />
                Pedir por WhatsApp
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
              <p className="text-[11px] text-zinc-600 text-center">
                Se abrirá WhatsApp con tu pedido listo para enviar
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProductCard({
  product,
  category,
  cart,
  formatPrice,
  onAdd,
}: {
  product: Product
  category: Category
  cart: CartItem[]
  formatPrice: (price: number) => string
  onAdd: (product: Product, presentation: Presentation | null) => void
}) {
  const presentations = product.presentations ?? []
  const hasPresentations = presentations.length > 0
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const selectedPresentation = selectedId
    ? presentations.find(p => p.id === selectedId) ?? null
    : null
  const price = selectedPresentation ? selectedPresentation.salePrice : product.salePrice
  const key = `${product.id}-${selectedPresentation?.id ?? 'base'}`
  const inCart = cart.find(item => item.key === key)

  return (
    <Card className="bg-zinc-900/50 border-zinc-800/60 hover:border-zinc-700 transition-colors">
      <CardContent className="p-3">
        <div
          className="aspect-square rounded-lg bg-zinc-800 mb-2 overflow-hidden relative cursor-pointer"
          onClick={() => onAdd(product, selectedPresentation)}
        >
          <ProductImage
            src={product.imgUrl}
            alt={product.name}
            categoryName={category.name}
            categoryIcon={category.icon}
            className="absolute inset-0 w-full h-full object-cover"
            fallbackClassName="absolute inset-0 w-full h-full flex items-center justify-center bg-zinc-800"
            iconClassName="h-8 w-8 text-zinc-600"
          />
        </div>
        <h3
          className="text-sm font-medium text-zinc-200 line-clamp-2 min-h-[2.5rem] cursor-pointer"
          onClick={() => onAdd(product, selectedPresentation)}
        >
          {product.name}
        </h3>

        {hasPresentations && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedId(null) }}
              title={unitLabelText(product.unitLabel)}
              className={`max-w-full truncate whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${
                selectedId === null
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {unitLabelText(product.unitLabel)}
            </button>
            {presentations.map(p => (
              <button
                key={p.id}
                onClick={(e) => { e.stopPropagation(); setSelectedId(p.id) }}
                title={p.name}
                className={`max-w-full truncate whitespace-nowrap text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${
                  selectedId === p.id
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {unitLabelText(p.unitLabel)} ×{p.unitsPerPack}
              </button>
            ))}
          </div>
        )}

        <div
          className="flex items-center justify-between mt-1.5 cursor-pointer"
          onClick={() => onAdd(product, selectedPresentation)}
        >
          <span className="text-sm font-bold text-emerald-400">
            {formatPrice(price)}
          </span>
          {inCart ? (
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-[10px]">
              x{inCart.quantity}
            </Badge>
          ) : (
            <Plus className="h-4 w-4 text-zinc-600" />
          )}
        </div>
      </CardContent>
    </Card>
  )
}
