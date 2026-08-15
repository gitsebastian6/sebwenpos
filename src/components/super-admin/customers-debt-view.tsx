'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Users, Search, Building2, CircleDollarSign, AlertTriangle, Wallet } from 'lucide-react'
import { formatCOP, formatDate } from './helpers'
import { useSuperAdminCustomers } from '@/hooks/api/use-super-admin'

export function CustomersDebtView() {
  const [search, setSearch] = useState('')
  const { data, isLoading } = useSuperAdminCustomers({ search: search.trim() || undefined })

  const customers = data?.customers ?? []
  const stats = data?.stats ?? { totalCustomers: 0, totalDebt: 0, customersWithDebt: 0, avgDebt: 0, storesCount: 0 }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="rounded-xl border-border/50 bg-muted/20 p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Users className="h-3 w-3" />Clientes</div>
          <p className="text-2xl font-bold">{stats.totalCustomers}</p>
        </Card>
        <Card className="rounded-xl border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 mb-1"><CircleDollarSign className="h-3 w-3" />Deuda Total</div>
          <p className="text-2xl font-bold font-mono text-red-600 dark:text-red-400">{formatCOP(stats.totalDebt)}</p>
        </Card>
        <Card className="rounded-xl border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mb-1"><AlertTriangle className="h-3 w-3" />Con Deuda</div>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.customersWithDebt}</p>
        </Card>
        <Card className="rounded-xl border-border/50 bg-muted/20 p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Wallet className="h-3 w-3" />Deuda Promedio</div>
          <p className="text-2xl font-bold font-mono">{formatCOP(stats.avgDebt)}</p>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, teléfono, email o NIT..."
            className="pl-8 h-9 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {stats.storesCount} tienda{stats.storesCount !== 1 ? 's' : ''} en total
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : customers.length === 0 ? (
        <Card className="rounded-xl border-border/50 border-dashed">
          <CardContent className="py-12 text-center">
            <div className="h-16 w-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {search ? 'Sin resultados para esta búsqueda' : 'Sin clientes registrados'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-xl border-border/50">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Cliente</TableHead>
                    <TableHead className="min-w-[160px]">Tienda</TableHead>
                    <TableHead className="min-w-[160px]">Contacto</TableHead>
                    <TableHead className="min-w-[120px]">NIT/Documento</TableHead>
                    <TableHead className="text-right min-w-[120px]">Deuda</TableHead>
                    <TableHead className="min-w-[100px]">Desde</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.map((c) => (
                    <TableRow key={c.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium text-sm">{c.name}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Building2 className="h-3 w-3" />{c.store.name}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground space-y-0.5">
                          {c.phone && <p>{c.phone}</p>}
                          {c.email && <p className="truncate max-w-[160px]">{c.email}</p>}
                          {!c.phone && !c.email && '—'}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs font-mono">{c.nit || '—'}</TableCell>
                      <TableCell className="text-right">
                        {c.totalDebt > 0 ? (
                          <Badge className="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/20 font-mono">
                            {formatCOP(c.totalDebt)}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground font-mono">$0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
