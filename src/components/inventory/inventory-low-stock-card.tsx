'use client'

import { AlertTriangle, PackageSearch } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { LowStockAlert } from './inventory-types'

interface InventoryLowStockCardProps {
  products: LowStockAlert[]
  isLoading: boolean
}

export function InventoryLowStockCard({ products, isLoading }: InventoryLowStockCardProps) {
  return (
    <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-amber-300/50 dark:border-amber-600/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-base">Alertas de Stock Bajo</CardTitle>
            <CardDescription>Productos que necesitan reabastecimiento</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <PackageSearch className="h-14 w-14 mb-3 opacity-40 animate-pulse" />
            <p className="text-sm">No hay alertas de stock bajo</p>
            <p className="text-xs">Todos los productos tienen stock suficiente</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800/50 dark:bg-amber-950/20"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/50">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                      {item.currentStock} uds
                    </Badge>
                    <span className="text-xs text-muted-foreground">min: {item.minStock}</span>
                    {item.category && (
                      <>
                        <span className="text-xs text-muted-foreground">&middot;</span>
                        <span className="text-xs text-muted-foreground truncate">{item.category}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
