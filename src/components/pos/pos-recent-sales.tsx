'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Search, ShoppingCart, RotateCcw, Clock, Printer } from 'lucide-react'
import { formatCurrency } from '@/lib/auth'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { RecentOrder } from '@/hooks/pos/use-pos-data'
import type { POSReturnDialogRef } from './pos-return-dialog'

// ─── Types ──────────────────────────────────────────────

interface POSRecentSalesProps {
  open: boolean
  onClose: (open: boolean) => void
  recentOrders: RecentOrder[]
  loading: boolean
  search: string
  onSearchChange: (value: string) => void
  returnDialogRef: React.RefObject<POSReturnDialogRef | null>
  currencyCode: string
  onPrintOrder: (orderId: number) => void
}

// ─── Component ─────────────────────────────────────────

export function POSRecentSales({
  open,
  onClose,
  recentOrders,
  loading,
  search,
  onSearchChange,
  returnDialogRef,
  currencyCode,
  onPrintOrder,
}: POSRecentSalesProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Ventas Recientes del Día
          </DialogTitle>
          <DialogDescription>
            Busca y devuelve ventas realizadas hoy desde el Punto de Venta
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por número de orden, cliente o producto..."
            className="pl-9 bg-background/80 backdrop-blur-sm focus-visible:shadow-[0_0_15px_rgba(16,185,129,0.1)] transition-all duration-200"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="space-y-3 py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        ) : recentOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ShoppingCart className="mb-3 h-14 w-14 text-muted-foreground/25 animate-[pulse_3s_ease-in-out_infinite]" />
            <p className="text-muted-foreground font-medium text-sm">
              No hay ventas completadas hoy
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Las ventas del día aparecerán aquí
            </p>
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto space-y-2">
            {recentOrders
              .filter((order) => {
                if (!search.trim()) return true
                const q = search.toLowerCase().trim()
                return (
                  order.orderNumber.toLowerCase().includes(q) ||
                  (order.customerName || '').toLowerCase().includes(q) ||
                  order.orderItems.some((item) =>
                    item.productName.toLowerCase().includes(q)
                  )
                )
              })
              .map((order) => (
                <div
                  key={order.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">
                        {order.orderNumber}
                      </span>
                      {order.customerName && (
                        <span className="text-xs text-muted-foreground truncate">
                          — {order.customerName}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 break-words">
                      {format(new Date(order.createdAt), 'HH:mm', { locale: es })}
                      {' · '}
                      {order.orderItems.length} producto{order.orderItems.length !== 1 ? 's' : ''}
                      {order.orderItems.length <= 3
                        ? ` (${order.orderItems.map((i) => i.productName).join(', ')})`
                        : ` (${order.orderItems.slice(0, 3).map((i) => i.productName).join(', ')}...)`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-sm">
                      {formatCurrency(order.total, currencyCode)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 shrink-0"
                    onClick={() => onPrintOrder(order.id)}
                    title="Imprimir factura"
                    aria-label="Imprimir factura"
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-xs shrink-0 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                    onClick={() => returnDialogRef.current?.openReturnDialog(order.id)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
