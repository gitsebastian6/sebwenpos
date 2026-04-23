'use client'

import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card'
import { DollarSign, ShoppingCart, Heart, Users } from 'lucide-react'
import type { ReportData } from './accounting-types'
import { formatCurrency } from './accounting-types'

interface ReportsKpiCardsProps {
  reportData: ReportData
  currencyCode: string
}

export function ReportsKpiCards({ reportData, currencyCode }: ReportsKpiCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Ventas */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-teal-500" />
        <CardHeader className="pb-0">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-teal-100 dark:bg-teal-950 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            </div>
            <CardDescription className="text-xs">Total Ventas</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-teal-700 dark:text-teal-400 tabular-nums">
            {formatCurrency(reportData.sales.total, currencyCode)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {reportData.sales.orderCount} órdenes · Ticket prom: {formatCurrency(reportData.sales.avgTicket, currencyCode)}
          </p>
        </CardContent>
      </Card>

      {/* Contado vs Fiado */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
        <CardHeader className="pb-0">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center">
              <ShoppingCart className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <CardDescription className="text-xs">Contado vs Fiado</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {formatCurrency(reportData.sales.completed, currencyCode)}
          </p>
          <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
            Fiado: {formatCurrency(reportData.sales.credit, currencyCode)}
          </p>
        </CardContent>
      </Card>

      {/* Propinas */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-pink-500" />
        <CardHeader className="pb-0">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-pink-100 dark:bg-pink-950 flex items-center justify-center">
              <Heart className="h-4 w-4 text-pink-600 dark:text-pink-400" />
            </div>
            <CardDescription className="text-xs">Propinas</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-pink-700 dark:text-pink-400 tabular-nums">
            {formatCurrency(reportData.sales.tips, currencyCode)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {reportData.sales.tipsOrderCount} órdenes con propina
          </p>
        </CardContent>
      </Card>

      {/* Mesas Abiertas */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
        <CardHeader className="pb-0">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
              <Users className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <CardDescription className="text-xs">Mesas Abiertas</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 tabular-nums">
            {reportData.openTables.count}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Consumo: {formatCurrency(reportData.openTables.consumption, currencyCode)}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
