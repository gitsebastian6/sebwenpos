'use client'

import { ProductImage } from '@/components/ui/product-image'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Star, PackageSearch } from 'lucide-react'
import { formatCurrency } from '@/lib/auth'
import type { Product } from '@/hooks/pos/use-pos-data'
import type { CartItem, Service } from '@/types'

// ─── Props ──────────────────────────────────────────────

interface ProductGridProps {
  filteredProducts: Product[]
  filteredServices: Service[]
  isLoadingProducts: boolean
  searchQuery: string
  selectedCategory: string
  currencyCode: string
  cart: CartItem[]
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
              <ServiceCard key={service.id} service={service} currencyCode={currencyCode} cart={cart} />
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
            <ProductCard key={product.id} product={product} currencyCode={currencyCode} cart={cart} />
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
}

function ProductCard({ product, currencyCode, cart }: ProductCardProps) {
  const isOutOfStock = product.currentStock <= 0
  const cartItem = cart.find((item) => item.productId === product.id)
  const inCart = !!cartItem

  return (
    <Card
      className={`
        cursor-pointer transition-all duration-200 select-none overflow-hidden border-border/50
        hover:shadow-md hover:border-primary/20 active:scale-[0.97]
        ${isOutOfStock ? 'opacity-50 grayscale cursor-not-allowed' : ''}
        ${inCart ? 'ring-2 ring-emerald-500 ring-offset-1 dark:ring-offset-background shadow-emerald-500/10 dark:shadow-emerald-900/20' : ''}
      `}
      onClick={() => !isOutOfStock && undefined}
    >
      <CardContent className="p-0">
        {/* Image area — 4:3 aspect ratio for better density */}
        <div className="relative w-full aspect-[4/3] bg-muted">
          <ProductImage
            src={product.imgUrl}
            alt={product.name}
            categoryName={product.category?.name}
            className="w-full h-full object-cover"
            fallbackClassName="w-full h-full bg-muted flex items-center justify-center"
            iconClassName="h-10 w-10 text-muted-foreground/30"
          />

          {/* Cart quantity badge — top right */}
          {inCart && !isOutOfStock && (
            <div className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs font-bold shadow-md">
              {cartItem!.quantity}
            </div>
          )}

          {/* Stock badge — bottom right (only when low or out) */}
          {isOutOfStock && (
            <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
              <Badge variant="secondary" className="text-xs px-2 py-0.5 font-medium">Agotado</Badge>
            </div>
          )}
          {!isOutOfStock && product.currentStock <= 5 && (
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
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Service Card ───────────────────────────────────────

interface ServiceCardProps {
  service: Service
  currencyCode: string
  cart: CartItem[]
}

function ServiceCard({ service, currencyCode, cart }: ServiceCardProps) {
  const cartItem = cart.find((item) => item.serviceId === service.id)
  const inCart = !!cartItem

  return (
    <Card
      className={`
        cursor-pointer transition-all duration-200 select-none overflow-hidden border-border/50
        hover:shadow-md hover:border-primary/20 active:scale-[0.97]
        ${inCart ? 'ring-2 ring-violet-500 ring-offset-1 dark:ring-offset-background shadow-violet-500/10 dark:shadow-violet-900/20' : ''}
      `}
      onClick={() => undefined}
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
