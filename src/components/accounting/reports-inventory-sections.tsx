'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import { HandCoins, PackageX, AlertTriangle, Scale, BookOpen, RotateCcw } from 'lucide-react'
import type { LedgerAccount, ReportData } from './accounting-types'
import {
  formatCurrency,
  formatBalance,
  getBalanceColor,
} from './accounting-types'

interface CuentasPorCobrarCardProps {
  reportData: ReportData
  currencyCode: string
  onResetDebts: () => void
}

export function CuentasPorCobrarCard({ reportData, currencyCode, onResetDebts }: CuentasPorCobrarCardProps) {
  return (
    <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HandCoins className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-base">Cuentas por Cobrar</CardTitle>
              <CardDescription className="text-xs">
                {reportData.customerDebts.length} cliente{reportData.customerDebts.length !== 1 ? 's' : ''} con deuda
              </CardDescription>
            </div>
          </div>
          <Button variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/50 active:scale-[0.98] transition-all"
            onClick={onResetDebts}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Resetear Saldos
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {reportData.customerDebts.length === 0 ? (
          <div className="flex flex-col items-center py-8">
            <HandCoins className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No hay deudas pendientes</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-muted/30 transition-colors">
                  <TableHead>Cliente</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">Teléfono</TableHead>
                  <TableHead className="text-right w-32">Deuda</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportData.customerDebts.map((c) => (
                  <TableRow className="hover:bg-muted/30 transition-colors" key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.phone || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className="text-xs font-bold text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700"
                      >
                        {formatCurrency(c.totalDebt, currencyCode)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface InventorySectionProps {
  reportData: ReportData
  currencyCode: string
}

export function LowStockProductsCard({ reportData, currencyCode }: InventorySectionProps) {
  return (
    <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <PackageX className="h-5 w-5 text-red-500" />
          <CardTitle className="text-base">Productos con Stock Bajo</CardTitle>
        </div>
        <CardDescription>
          {reportData.lowStockProducts.length} producto{reportData.lowStockProducts.length !== 1 ? 's' : ''} con stock ≤ 5 unidades
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {reportData.lowStockProducts.length === 0 ? (
          <div className="flex flex-col items-center py-8">
            <PackageX className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Todo el inventario está en buen nivel</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-muted/30 transition-colors">
                  <TableHead>Producto</TableHead>
                  <TableHead className="whitespace-nowrap text-xs">Categoría</TableHead>
                  <TableHead className="text-center w-20">Stock</TableHead>
                  <TableHead className="text-center w-16 text-xs">Mín.</TableHead>
                  <TableHead className="text-right w-28">Precio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportData.lowStockProducts.map((p) => (
                  <TableRow className="hover:bg-muted/30 transition-colors" key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.category?.name || '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={`text-xs font-bold ${
                          p.currentStock === 0
                            ? 'text-red-700 dark:text-red-400 border-red-300 dark:border-red-700'
                            : 'text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700'
                        }`}
                      >
                        {p.currentStock === 0 ? (
                          <span className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            0
                          </span>
                        ) : (
                          p.currentStock
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {p.minStock}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatCurrency(p.salePrice, currencyCode)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface ValuedInventoryCardProps {
  reportData: ReportData
  currencyCode: string
}

export function ValuedInventoryCard({ reportData, currencyCode }: ValuedInventoryCardProps) {
  return (
    <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Inventario Valorizado</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 rounded-lg bg-muted/50 space-y-2">
          <p className="text-xs text-muted-foreground">Valor al Costo</p>
          <p className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatCurrency(reportData.inventory.totalCostValue, currencyCode)}
          </p>
        </div>
        <div className="p-4 rounded-lg bg-muted/50 space-y-2">
          <p className="text-xs text-muted-foreground">Valor al Público (Retail)</p>
          <p className="text-xl font-bold tabular-nums text-teal-700 dark:text-teal-400">
            {formatCurrency(reportData.inventory.totalRetailValue, currencyCode)}
          </p>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Margen estimado</span>
          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formatCurrency(
              reportData.inventory.totalRetailValue - reportData.inventory.totalCostValue,
              currencyCode
            )}
          </span>
        </div>
        {reportData.inventory.lowStockCount > 0 && (
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">
              {reportData.inventory.lowStockCount} producto{reportData.inventory.lowStockCount !== 1 ? 's' : ''} con stock bajo
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

interface BalanceCuentasCardProps {
  reportData: ReportData
  currencyCode: string
  accounts: LedgerAccount[]
}

export function BalanceCuentasCard({ reportData, currencyCode, accounts }: BalanceCuentasCardProps) {
  return (
    <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Balance de Cuentas</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[300px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-muted/30 transition-colors">
                <TableHead>Cuenta</TableHead>
                <TableHead className="text-right w-28">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(reportData.accountBalances).map(([name, balance]) => {
                const acc = accounts.find((a) => a.name === name)
                const type = acc?.type || ''
                return (
                  <TableRow className="hover:bg-muted/30 transition-colors" key={name}>
                    <TableCell className="text-sm font-medium">{name}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`text-sm font-bold tabular-nums ${getBalanceColor(balance, type)}`}
                      >
                        {formatBalance(balance, type, currencyCode)}
                      </span>
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
