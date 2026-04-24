'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Wallet, BarChart3, TrendingUp, Armchair, Monitor } from 'lucide-react'
import type { ReportData } from './accounting-types'
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_COLORS,
  CATEGORY_COLORS,
  formatCurrency,
} from './accounting-types'

interface ReportsSalesSectionsProps {
  reportData: ReportData
  currencyCode: string
}

export function SalesByPaymentCard({ reportData, currencyCode }: ReportsSalesSectionsProps) {
  return (
    <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Ventas por Método de Pago</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.keys(reportData.salesByPayment).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin datos</p>
        ) : (
          (() => {
            const methods = reportData.salesByPayment
            const maxPayment = Math.max(...Object.values(methods).map((m) => m.total), 1)
            return Object.entries(methods)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([method, data]) => (
                <div key={method} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-full ${PAYMENT_METHOD_COLORS[method] || 'bg-gray-400'}`} />
                      <span className="text-sm font-medium">
                        {PAYMENT_METHOD_LABELS[method] || method}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        ({data.count})
                      </span>
                    </div>
                    <span className="text-sm font-bold tabular-nums">
                      {formatCurrency(data.total, currencyCode)}
                    </span>
                  </div>
                  <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${PAYMENT_METHOD_COLORS[method] || 'bg-gray-400'}`}
                      style={{ width: `${(data.total / maxPayment) * 100}%` }}
                    />
                  </div>
                </div>
              ))
          })()
        )}
      </CardContent>
    </Card>
  )
}

export function SalesByCategoryCard({ reportData, currencyCode }: ReportsSalesSectionsProps) {
  return (
    <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Ventas por Categoría</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {Object.keys(reportData.salesByCategory).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Sin datos</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto">
            {Object.entries(reportData.salesByCategory)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([cat, data], idx) => {
                const totalAllSales = Object.values(reportData.salesByCategory).reduce(
                  (s, d) => s + d.total,
                  0
                )
                const pct = totalAllSales > 0 ? ((data.total / totalAllSales) * 100).toFixed(1) : '0'
                return (
                  <div
                    key={cat}
                    className={`p-3 rounded-lg border ${CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}`}
                  >
                    <p className="text-xs font-semibold truncate">{cat}</p>
                    <p className="text-sm font-bold tabular-nums mt-1">
                      {formatCurrency(data.total, currencyCode)}
                    </p>
                    <p className="text-[10px] opacity-70 mt-0.5">
                      {data.quantity} uds · {pct}%
                    </p>
                  </div>
                )
              })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function TopProductsCard({ reportData, currencyCode }: ReportsSalesSectionsProps) {
  return (
    <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Top 10 Productos</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[300px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-muted/30 transition-colors">
                <TableHead className="w-10">#</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right w-16">Uds</TableHead>
                <TableHead className="text-right w-28">Ingreso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reportData.topProducts.slice(0, 10).map((product, idx) => {
                const maxProductTotal = reportData.topProducts[0]?.total || 1
                return (
                  <TableRow className="hover:bg-muted/30 transition-colors" key={product.productId}>
                    <TableCell className="text-xs font-bold text-muted-foreground">
                      {idx + 1}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <span className="text-sm font-medium truncate block max-w-[150px]">
                          {product.name}
                        </span>
                        <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-500 rounded-full transition-all duration-500"
                            style={{ width: `${(product.total / maxProductTotal) * 100}%` }}
                          />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {product.quantity}
                    </TableCell>
                    <TableCell className="text-right text-sm font-bold tabular-nums text-teal-700 dark:text-teal-400">
                      {formatCurrency(product.total, currencyCode)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

export function SalesBySourceCard({ reportData, currencyCode }: ReportsSalesSectionsProps) {
  return (
    <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Ventas por Origen</CardTitle>
        </div>
        <CardDescription>¿De dónde salen las ventas?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(() => {
          const src = reportData.salesBySource
          const totalAll = (src.MESA.total || 0) + (src.POS.total || 0) || 1
          return (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Armchair className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-sm font-semibold">Mesas</span>
                  </div>
                  <p className="text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                    {formatCurrency(src.MESA.total, currencyCode)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {src.MESA.count} ventas · {totalAll > 0 ? ((src.MESA.total / totalAll) * 100).toFixed(0) : 0}%
                  </p>
                  <div className="h-2 w-full bg-amber-100 dark:bg-amber-900 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all duration-500"
                      style={{ width: `${(src.MESA.total / totalAll) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="p-4 rounded-lg border bg-sky-50/50 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Monitor className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                    <span className="text-sm font-semibold">Punto de Venta</span>
                  </div>
                  <p className="text-xl font-bold tabular-nums text-sky-700 dark:text-sky-400">
                    {formatCurrency(src.POS.total, currencyCode)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {src.POS.count} ventas · {totalAll > 0 ? ((src.POS.total / totalAll) * 100).toFixed(0) : 0}%
                  </p>
                  <div className="h-2 w-full bg-sky-100 dark:bg-sky-900 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-sky-500 rounded-full transition-all duration-500"
                      style={{ width: `${(src.POS.total / totalAll) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </>
          )
        })()}
      </CardContent>
    </Card>
  )
}
