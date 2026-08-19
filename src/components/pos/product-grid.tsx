'use client'

import { useState } from 'react'
import { ProductImage } from '@/components/ui/product-image'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Star, PackageSearch, Layers } from 'lucide-react'
import { formatCurrency } from '@/lib/auth'
import { UNIT_OF_MEASURE_OPTIONS } from '@/lib/constants'
import type { Product } from '@/hooks/pos/use-pos-data'
import type { CartItem, Service, ProductPresentation } from '@/types'

/** "CAJ" -> "Caja". Falls back to "Unidad" only when the product's own unit is really UND/unset. */
function unitOfMeasureLabel(code: string | undefined): string {
  if (!code) return 'Unidad'
  return UNIT_OF_MEASURE_OPTIONS.find((u) => u.value === code)?.label || code
}

// ─── Props ──────────────────────────────────────────────

interface ProductGridProps {
  filteredProducts: Product[]
  filteredServices: Service[]
  isLoadingProducts: boolean
  searchQuery: string
  selectedCategory: string
  currencyCode: string
  cart: CartItem[]
  onAddToCart?: (product: Product) => void
  onAddPresentation?: (product: Product, presentation: ProductPresentation) => void
  onAddService?: (service: Service) => void
}

// ─── Component ──────────────────────────────────────────

export function ProductGrid({
  filteredProducts,
  filteredServices,
  isLoadingProducts,
  searchQuery,
  selectedCategory,
  currencyCode,
  cart,
  onAddToCart,
  onAddPresentation,
  onAddService,
}: ProductGridProps) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      {isLoadingProducts ? (
        <LoadingSkeleton />
      ) : selectedCategory === 'servicios' ? (
        filteredServices.length === 0 ? (
          <EmptyState
            message={searchQuery ? 'No se encontraron servicios' : 'No hay servicios activos'}
          />
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
            {filteredServices.map((service) => (
              <ServiceCard key={service.id} service={service} currencyCode={currencyCode} cart={cart} onAddService={onAddService} />
            ))}
          </div>
        )
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          message={searchQuery ? 'No se encontraron productos' : 'No hay productos activos'}
        />
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} currencyCode={currencyCode} cart={cart} onAddToCart={onAddToCart} onAddPresentation={onAddPresentation} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Product Card ───────────────────────────────────────

interface ProductCardProps {
  product: Product
  currencyCode: string
  cart: CartItem[]
  onAddToCart?: (product: Product) => void
  onAddPresentation?: (product: Product, presentation: ProductPresentation) => void
}

function ProductCard({ product, currencyCode, cart, onAddToCart, onAddPresentation }: ProductCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const isOutOfStock = product.trackInventory !== false && product.currentStock <= 0
  // Sum every line of this product in the cart (Unidad + any presentations) —
  // a product can now be in the cart as several simultaneous lines.
  const cartQuantity = cart
    .filter((item) => item.productId === product.id)
    .reduce((sum, item) => sum + item.quantity, 0)
  const inCart = cartQuantity > 0
  const activePresentations = (product.presentations || []).filter((p) => p.isActive)
  const hasPresentations = activePresentations.length > 0

  const cardBody = (
    <CardContent className="p-0">
      {/* Image area — 4:3 aspect ratio for better density */}
      <div className="relative w-full aspect-[4/3] bg-muted">
        <ProductImage
          src={product.imgUrl}
          alt={product.name}
          categoryName={product.category?.name}
          categoryIcon={product.category?.icon}
          className="w-full h-full object-cover"
          fallbackClassName="w-full h-full bg-muted flex items-center justify-center"
          iconClassName="h-10 w-10 text-muted-foreground/30"
        />

        {/* Presentations indicator — top left */}
        {hasPresentations && !isOutOfStock && (
          <Badge
            variant="secondary"
            className="absolute top-1.5 left-1.5 h-5 px-1.5 gap-0.5 text-[10px] bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300"
            title={`${activePresentations.length} presentación${activePresentations.length > 1 ? 'es' : ''} disponible${activePresentations.length > 1 ? 's' : ''}`}
          >
            <Layers className="h-2.5 w-2.5" />
          </Badge>
        )}

        {/* Cart quantity badge — top right */}
        {inCart && !isOutOfStock && (
          <div className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold shadow-md">
            {cartQuantity}
          </div>
        )}

        {/* Stock badge — bottom right (only when low or out) */}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
            <Badge variant="secondary" className="text-xs px-2 py-0.5 font-medium">Agotado</Badge>
          </div>
        )}
        {!isOutOfStock && product.trackInventory !== false && product.currentStock <= 5 && (
          <div className="absolute bottom-1.5 right-1.5">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/70 dark:text-amber-300">
              {product.currentStock}
            </Badge>
          </div>
        )}
      </div>

      {/* Product info — below image */}
      <div className="p-2 sm:p-2.5 space-y-0.5">
        <p className="text-xs sm:text-sm font-medium leading-snug line-clamp-2">
          {product.name}
        </p>
        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
          {formatCurrency(product.salePrice, currencyCode)}
          {product.unitLabel && product.unitLabel !== 'UND' && (
            <span className="ml-1 text-[10px] font-medium text-muted-foreground align-middle">/ {unitOfMeasureLabel(product.unitLabel)}</span>
          )}
        </p>
      </div>
    </CardContent>
  )

  const cardClassName = `
    cursor-pointer transition-all duration-200 select-none overflow-hidden border-border/50
    hover:shadow-md hover:border-primary/20 active:scale-[0.97]
    ${isOutOfStock ? 'opacity-50 grayscale cursor-not-allowed' : ''}
    ${inCart ? 'ring-2 ring-emerald-500 ring-offset-1 dark:ring-offset-background shadow-emerald-500/10 dark:shadow-emerald-900/20' : ''}
  `

  // Out of stock, or no presentations to choose from: same direct-add behavior as before.
  if (isOutOfStock || !hasPresentations) {
    return (
      <Card className={cardClassName} onClick={() => !isOutOfStock && onAddToCart?.(product)}>
        {cardBody}
      </Card>
    )
  }

  // Has active presentations: clicking opens a small picker (Unidad + each presentation).
  return (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger asChild>
        <Card className={cardClassName}>{cardBody}</Card>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" align="start">
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground truncate">{product.name}</p>
        <button
          type="button"
          className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors"
          onClick={() => { onAddToCart?.(product); setPickerOpen(false) }}
        >
          <span>{unitOfMeasureLabel(product.unitLabel)}</span>
          <span className="font-medium tabular-nums">{formatCurrency(product.salePrice, currencyCode)}</span>
        </button>
        {activePresentations.map((presentation) => (
          <button
            key={presentation.id}
            type="button"
            className="w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm hover:bg-muted transition-colors"
            onClick={() => { onAddPresentation?.(product, presentation); setPickerOpen(false) }}
          >
            <span className="truncate" title={presentation.name}>{unitOfMeasureLabel(presentation.unitLabel)}</span>
            <span className="font-medium tabular-nums shrink-0 ml-2">{formatCurrency(presentation.salePrice, currencyCode)}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

// ─── Service Card ───────────────────────────────────────

interface ServiceCardProps {
  service: Service
  currencyCode: string
  cart: CartItem[]
  onAddService?: (service: Service) => void
}

function ServiceCard({ service, currencyCode, cart, onAddService }: ServiceCardProps) {
  const cartItem = cart.find((item) => item.serviceId === service.id)
  const inCart = !!cartItem

  return (
    <Card
      className={`
        cursor-pointer transition-all duration-200 select-none overflow-hidden border-border/50
        hover:shadow-md hover:border-primary/20 active:scale-[0.97]
        ${inCart ? 'ring-2 ring-violet-500 ring-offset-1 dark:ring-offset-background shadow-violet-500/10 dark:shadow-violet-900/20' : ''}
      `}
      onClick={() => onAddService?.(service)}
    >
      <CardContent className="p-0">
        {/* Image area — violet themed icon */}
        <div className="relative w-full aspect-[4/3] bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950/40 dark:to-violet-950/20 flex items-center justify-center">
          <Star className="h-10 w-10 text-violet-300 dark:text-violet-700" />

          {/* Svc badge — top left */}
          <Badge variant="secondary" className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0 bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">
            Svc
          </Badge>

          {/* Cart quantity badge — top right */}
          {inCart && (
            <div className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-violet-500 text-white flex items-center justify-center text-xs font-bold shadow-md">
              {cartItem!.quantity}
            </div>
          )}
        </div>

        {/* Service info — below icon */}
        <div className="p-2 sm:p-2.5 space-y-0.5">
          <p className="text-xs sm:text-sm font-medium leading-snug line-clamp-2">
            {service.name}
          </p>
          <p className="text-sm font-bold text-violet-600 dark:text-violet-400">
            {formatCurrency(service.price, currencyCode)}
            <span className="text-xs font-normal text-muted-foreground ml-0.5">/{service.unit}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Loading Skeleton ───────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl">
          <Skeleton className="w-full aspect-[4/3] rounded-none" />
          <div className="p-2 sm:p-2.5 space-y-1.5">
            <Skeleton className="h-3.5 w-3/4 rounded" />
            <Skeleton className="h-3.5 w-1/2 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Empty State ────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
      <PackageSearch className="h-16 w-16 opacity-20 animate-[pulse_3s_ease-in-out_infinite]" />
      <p className="text-sm font-medium">{message}</p>
      <p className="text-xs opacity-60">Intenta con otra categoría o término de búsqueda</p>
    </div>
  )
}
