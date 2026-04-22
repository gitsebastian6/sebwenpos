'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { BookOpen, Wallet, Eye } from 'lucide-react'
import type { LedgerAccount } from './accounting-types'
import {
  ACCOUNT_TYPE_LABELS,
  getAccountTypeColor,
  getBalanceColor,
  formatBalance,
} from './accounting-types'

interface AccountsTabProps {
  accounts: LedgerAccount[]
  isLoadingAccounts: boolean
  currencyCode: string
  onRefresh: () => void
  onViewMovements: (accountId: number) => void
}

export function AccountsTab({
  accounts,
  isLoadingAccounts,
  currencyCode,
  onRefresh,
  onViewMovements,
}: AccountsTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Catálogo de Cuentas</h2>
          <p className="text-sm text-muted-foreground">
            {accounts.length} cuenta{accounts.length !== 1 ? 's' : ''} registrada{accounts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button variant="outline"
          size="sm"
          onClick={onRefresh}
          className="gap-1.5 active:scale-[0.98] transition-all"
        >
          <Wallet className="h-3.5 w-3.5" />
          Actualizar
        </Button>
      </div>

      {isLoadingAccounts ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-16 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-7 w-24 mb-4" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <BookOpen className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              No hay cuentas contables registradas
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Las cuentas se crearán automáticamente al realizar ventas
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <Card
              key={account.id}
              className="group transition-shadow hover:shadow-md"
            >
              <CardHeader className="pb-0">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base font-bold leading-tight truncate">
                    {account.name}
                  </CardTitle>
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-[10px] ${getAccountTypeColor(account.type)}`}
                  >
                    {ACCOUNT_TYPE_LABELS[account.type] || account.type}
                  </Badge>
                </div>
                {account.isDefault && (
                  <CardDescription className="mt-1">
                    Cuenta principal
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Saldo actual</p>
                  <p className={`text-xl font-bold tracking-tight ${getBalanceColor(account.balance, account.type)}`}>
                    {formatBalance(account.balance, account.type, currencyCode)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {account.entryCount} movimiento{account.entryCount !== 1 ? 's' : ''}
                  </p>
                </div>
                <Separator />
                <Button variant="outline"
                  size="sm"
                  className="w-full gap-1.5 text-xs active:scale-[0.98] transition-all"
                  onClick={() => onViewMovements(account.id)}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Ver Movimientos
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
