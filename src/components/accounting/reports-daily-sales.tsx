'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BarChart3, ShoppingCart, Armchair, Monitor, Printer } from 'lucide-react'
import { printTicket, type TicketItem } from '@/lib/print-ticket'
import { receiptStoreFields } from '@/lib/receipt-store-fields'
import { useAuthStore } from '@/stores/auth-store'
import type { ReportData } from './accounting-types'
import {
  formatCurrency,
  formatTime,
  formatDateShort,
  formatDayLabel,
  PAYMENT_METHOD_LABELS,
} from './accounting-types'

interface DailySalesCardProps {
  reportData: ReportData
  currencyCode: string
}

export function DailySalesCard({ reportData, currencyCode }: DailySalesCardProps) {
  return (
    <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Ventas de los Últimos 7 Días</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {(() => {
          const maxDay = Math.max(...reportData.dailySales.map((d) => d.sales), 1)
          return reportData.dailySales.map((day) => (
            <div key={day.date} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize">{formatDayLabel(day.date)}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground">{day.orders} ord.</span>
                  <span className="text-sm font-bold tabular-nums">
                    {formatCurrency(day.sales, currencyCode)}
                  </span>
                </div>
              </div>
              <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-500"
                  style={{ width: `${(day.sales / maxDay) * 100}%` }}
                />
              </div>
            </div>
          ))
        })()}
        <Separator />
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <span className="text-sm font-medium">Utilidad Estimada</span>
          <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formatCurrency(reportData.profit, currencyCode)}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

interface SalesDetailCardProps {
  reportData: ReportData
  currencyCode: string
  storeName: string
}

export function SalesDetailCard({ reportData, currencyCode, storeName }: SalesDetailCardProps) {
  const store = useAuthStore((s) => s.store)
  return (
    <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Informe Detallado de Ventas</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          {reportData.recentOrders.length} ordenes con origen, productos y método de pago
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {reportData.recentOrders.length === 0 ? (
          <div className="flex flex-col items-center py-8">
            <ShoppingCart className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No hay ventas en este periodo</p>
          </div>
        ) : (
          <div className="max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-muted/30 transition-colors">
                  <TableHead className="w-[120px]">Fecha</TableHead>
                  <TableHead className="w-[90px]">Orden</TableHead>
                  <TableHead className="w-[100px]">Origen</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">Cliente</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead className="text-right w-[110px]">Total</TableHead>
                  <TableHead className="text-left whitespace-nowrap text-xs">Productos</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportData.recentOrders.map((order) => (
                  <TableRow className="hover:bg-muted/30 transition-colors" key={order.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">
                          {formatDateShort(order.createdAt)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatTime(order.createdAt)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {order.orderNumber}
                    </TableCell>
                    <TableCell>
                      {order.source === 'MESA' ? (
                        <Badge
                          variant="outline"
                          className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800 text-[10px] whitespace-nowrap"
                        >
                          <Armchair className="h-3 w-3 mr-1 inline" />
                          {order.tableName || 'Mesa'}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-sky-200 dark:border-sky-800 text-[10px] whitespace-nowrap"
                        >
                          <Monitor className="h-3 w-3 mr-1 inline" />
                          POS
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="truncate max-w-[80px] block" title={order.customer}>{order.customer}</span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] whitespace-nowrap ${
                          order.paymentMethod === 'CREDIT'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                            : order.paymentMethod === 'CASH'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border-violet-200 dark:border-violet-800'
                        }`}
                      >
                        {PAYMENT_METHOD_LABELS[order.paymentMethod] || order.paymentMethod}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-bold tabular-nums">
                          {formatCurrency(order.total, currencyCode)}
                        </span>
                        {order.tipAmount > 0 && (
                          <span className="text-[10px] text-pink-600 dark:text-pink-400 font-medium">
                            +Propina {formatCurrency(order.tipAmount, currencyCode)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[200px]">
                        {order.items.slice(0, 3).map((item, idx) => (
                          <div key={idx} className="text-xs text-muted-foreground truncate">
                            {item.quantity}x {item.name}
                            {item.presentationName && ` — ${item.presentationName}`}
                            <span className="text-[10px] ml-1 opacity-60">
                              ({formatCurrency(item.totalRow, currencyCode)})
                            </span>
                          </div>
                        ))}
                        {order.items.length > 3 && (
                          <p className="text-[10px] text-muted-foreground/60">
                            +{order.items.length - 3} más...
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost"
                        size="icon"
                        className="h-7 w-7 active:scale-[0.98] transition-all"
                        title="Imprimir factura"
                        onClick={() => {
                          const items: TicketItem[] = order.items.map((item) => ({
                            name: item.presentationName ? `${item.name} — ${item.presentationName}` : item.name,
                            quantity: item.quantity,
                            unitPrice: item.unitPrice,
                            total: item.totalRow,
                          }))
                          printTicket({
                            ...receiptStoreFields(store),
                            storeName,
                            orderNumber: order.orderNumber,
                            date: order.createdAt,
                            customer: order.customer || undefined,
                            tableName: order.tableName || undefined,
                            items,
                            subtotal: order.subtotal,
                            tipAmount: order.tipAmount || 0,
                            total: order.total,
                            paymentMethod: order.paymentMethod,
                            currencyCode,
                          })
                        }}
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {/* Summary footer */}
        <Separator />
        <div className="flex items-center justify-between p-4 bg-muted/30">
          <span className="text-sm font-medium text-muted-foreground">
            Total: {reportData.recentOrders.length} ordenes
          </span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Armchair className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs text-muted-foreground">Mesas:</span>
              <span className="text-sm font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                {formatCurrency(reportData.salesBySource.MESA.total, currencyCode)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Monitor className="h-3.5 w-3.5 text-sky-500" />
              <span className="text-xs text-muted-foreground">POS:</span>
              <span className="text-sm font-bold text-sky-700 dark:text-sky-400 tabular-nums">
                {formatCurrency(reportData.salesBySource.POS.total, currencyCode)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
