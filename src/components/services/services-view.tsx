'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { formatCurrency } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Phone,
  Zap,
  Droplets,
  CircleDollarSign,
  MoreHorizontal,
  Receipt,
  Loader2,
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// ─── Types ───────────────────────────────────────────────────────

type Provider = 'TELCEL' | 'ATT' | 'MOVISTAR' | 'CFE' | 'AGUA' | 'OTROS'
type TransactionType = 'TOPUP' | 'BILL_PAYMENT'
type ServiceStatus = 'SUCCESS' | 'FAILED' | 'PENDING'

interface ServiceTransaction {
  id: number
  provider: Provider
  transactionType: TransactionType
  amount: number
  commissionEarned: number
  status: ServiceStatus
  externalId: string | null
  createdAt: string
}

// ─── Constants ───────────────────────────────────────────────────

const PROVIDER_CONFIG: Record<Provider, { label: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  TELCEL: {
    label: 'Recarga Telcel',
    icon: <Phone className="h-6 w-6" />,
    color: 'text-rose-600 dark:text-rose-400',
    bgColor: 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/50',
  },
  ATT: {
    label: 'Recarga AT&T',
    icon: <Phone className="h-6 w-6" />,
    color: 'text-sky-600 dark:text-sky-400',
    bgColor: 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800/50',
  },
  MOVISTAR: {
    label: 'Recarga Movistar',
    icon: <Phone className="h-6 w-6" />,
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50',
  },
  CFE: {
    label: 'Pago CFE',
    icon: <Zap className="h-6 w-6" />,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50',
  },
  AGUA: {
    label: 'Pago de Agua',
    icon: <Droplets className="h-6 w-6" />,
    color: 'text-cyan-600 dark:text-cyan-400',
    bgColor: 'bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800/50',
  },
  OTROS: {
    label: 'Otro Servicio',
    icon: <MoreHorizontal className="h-6 w-6" />,
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800/50',
  },
}

const PROVIDER_SELECT_OPTIONS: { value: Provider; label: string }[] = [
  { value: 'TELCEL', label: 'Telcel' },
  { value: 'ATT', label: 'AT&T' },
  { value: 'MOVISTAR', label: 'Movistar' },
  { value: 'CFE', label: 'CFE' },
  { value: 'AGUA', label: 'Agua' },
  { value: 'OTROS', label: 'Otros' },
]

const TRANSACTION_TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: 'TOPUP', label: 'Recarga (Tiempo Aire)' },
  { value: 'BILL_PAYMENT', label: 'Pago de Servicio' },
]

const STATUS_BADGE_VARIANTS: Record<ServiceStatus, { variant: 'default' | 'destructive' | 'outline'; className: string; label: string }> = {
  SUCCESS: { variant: 'outline', className: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400', label: 'Éxito' },
  FAILED: { variant: 'destructive', className: '', label: 'Fallido' },
  PENDING: { variant: 'outline', className: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400', label: 'Pendiente' },
}

const STATUS_ICONS: Record<ServiceStatus, React.ReactNode> = {
  SUCCESS: <CheckCircle2 className="h-3.5 w-3.5" />,
  FAILED: <XCircle className="h-3.5 w-3.5" />,
  PENDING: <Clock className="h-3.5 w-3.5" />,
}

// ─── Component ───────────────────────────────────────────────────

export function ServicesView() {
  const { store } = useAuthStore()
  const storeId = store?.id
  const currencyCode = store?.currencyCode || 'MXN'

  // Data state
  const [transactions, setTransactions] = useState<ServiceTransaction[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Form state
  const [formProvider, setFormProvider] = useState<Provider | ''>('')
  const [formTransactionType, setFormTransactionType] = useState<TransactionType | ''>('')
  const [formExternalId, setFormExternalId] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // ─── Fetch ────────────────────────────────────────────────

  const fetchTransactions = useCallback(async () => {
    if (!storeId) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/services?storeId=${storeId}`)
      if (!res.ok) throw new Error('Error al cargar transacciones')
      const data = await res.json()
      setTransactions(data)
    } catch {
      toast.error('Error al cargar transacciones')
    } finally {
      setIsLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  // ─── Handlers ─────────────────────────────────────────────

  function handleQuickAction(provider: Provider) {
    setFormProvider(provider)
    // Auto-set transaction type based on provider
    if (provider === 'CFE' || provider === 'AGUA' || provider === 'OTROS') {
      setFormTransactionType('BILL_PAYMENT')
    } else {
      setFormTransactionType('TOPUP')
    }
  }

  async function handleSubmitService() {
    if (!storeId || !formProvider || !formTransactionType || !formAmount) {
      toast.error('Completa todos los campos requeridos')
      return
    }

    const amountInPesos = parseFloat(formAmount)
    if (isNaN(amountInPesos) || amountInPesos <= 0) {
      toast.error('Ingresa un monto válido mayor a 0')
      return
    }

    // Convert pesos to cents
    const amountInCents = Math.round(amountInPesos * 100)

    setIsSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        storeId,
        provider: formProvider,
        transactionType: formTransactionType,
        amount: amountInCents,
      }
      if (formExternalId.trim()) {
        body.externalId = formExternalId.trim()
      }

      const res = await fetch('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al procesar servicio')
      }
      toast.success('Servicio procesado exitosamente')
      // Reset form
      setFormProvider('')
      setFormTransactionType('')
      setFormExternalId('')
      setFormAmount('')
      fetchTransactions()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al procesar servicio')
    } finally {
      setIsSubmitting(false)
    }
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    return format(d, "d MMM yyyy, HH:mm", { locale: es })
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-1">Acciones Rápidas</h2>
        <p className="text-sm text-muted-foreground mb-4">Selecciona un servicio para procesar</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(Object.entries(PROVIDER_CONFIG) as [Provider, typeof PROVIDER_CONFIG[Provider]][]).map(
            ([key, config]) => (
              <Card
                key={key}
                className={`cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] active:scale-[0.98] border ${config.bgColor} ${formProvider === key ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
                onClick={() => handleQuickAction(key)}
              >
                <CardContent className="flex flex-col items-center justify-center gap-2 pt-6">
                  <div className={config.color}>{config.icon}</div>
                  <span className="text-xs font-medium text-center leading-tight">
                    {config.label}
                  </span>
                </CardContent>
              </Card>
            )
          )}
        </div>
      </div>

      <Separator />

      {/* Main Section: Form + Transactions */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: Service Form */}
        <div className="lg:col-span-2">
          <Card className="sticky top-6">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Receipt className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Procesar Servicio</CardTitle>
                  <CardDescription>Nueva transacción de servicio</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Provider */}
              <div className="space-y-2">
                <Label htmlFor="svc-provider">Proveedor *</Label>
                <Select
                  value={formProvider}
                  onValueChange={(v) => {
                    setFormProvider(v as Provider)
                    // Auto-set transaction type
                    if (['CFE', 'AGUA', 'OTROS'].includes(v)) {
                      setFormTransactionType('BILL_PAYMENT')
                    } else {
                      setFormTransactionType('TOPUP')
                    }
                  }}
                >
                  <SelectTrigger id="svc-provider">
                    <SelectValue placeholder="Selecciona proveedor" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_SELECT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Transaction Type */}
              <div className="space-y-2">
                <Label htmlFor="svc-type">Tipo de Transacción *</Label>
                <Select
                  value={formTransactionType}
                  onValueChange={(v) => setFormTransactionType(v as TransactionType)}
                >
                  <SelectTrigger id="svc-type">
                    <SelectValue placeholder="Selecciona tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSACTION_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Phone / Account Number */}
              <div className="space-y-2">
                <Label htmlFor="svc-external-id">
                  {formTransactionType === 'TOPUP' ? 'Número Telefónico' : 'Número de Cuenta'}
                </Label>
                <Input
                  id="svc-external-id"
                  type="tel"
                  placeholder={formTransactionType === 'TOPUP' ? 'Ej: 5512345678' : 'Ej: 123456789012'}
                  value={formExternalId}
                  onChange={(e) => setFormExternalId(e.target.value)}
                />
              </div>

              {/* Amount */}
              <div className="space-y-2">
                <Label htmlFor="svc-amount">Monto (MXN) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="svc-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    className="pl-7"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                  />
                </div>
                {formAmount && !isNaN(parseFloat(formAmount)) && parseFloat(formAmount) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Monto: {formatCurrency(Math.round(parseFloat(formAmount) * 100), currencyCode)}
                  </p>
                )}
              </div>

              {/* Submit */}
              <Button
                className="w-full"
                onClick={handleSubmitService}
                disabled={
                  isSubmitting || !formProvider || !formTransactionType || !formAmount
                }
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 mr-2" />
                    Procesar Servicio
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right: Recent Transactions */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <CircleDollarSign className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Transacciones Recientes</CardTitle>
                  <CardDescription>Historial de servicios procesados</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Receipt className="h-10 w-10 mb-2 opacity-40" />
                  <p className="text-sm">No hay transacciones</p>
                  <p className="text-xs">Los servicios procesados aparecerán aquí</p>
                </div>
              ) : (
                <div className="max-h-[520px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px]">Fecha</TableHead>
                        <TableHead>Proveedor</TableHead>
                        <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead className="hidden sm:table-cell text-right">Comisión</TableHead>
                        <TableHead className="text-right">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((tx) => {
                        const statusConfig = STATUS_BADGE_VARIANTS[tx.status]
                        return (
                          <TableRow key={tx.id}>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {formatDate(tx.createdAt)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className={PROVIDER_CONFIG[tx.provider as Provider]?.color || ''}>
                                  {PROVIDER_CONFIG[tx.provider as Provider]?.icon || <CircleDollarSign className="h-4 w-4" />}
                                </div>
                                <span className="text-sm font-medium">
                                  {PROVIDER_CONFIG[tx.provider as Provider]?.label || tx.provider}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <Badge variant="outline" className="text-xs">
                                {tx.transactionType === 'TOPUP' ? 'Recarga' : 'Pago'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              {formatCurrency(tx.amount, currencyCode)}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell text-right text-sm text-emerald-600 dark:text-emerald-400">
                              +{formatCurrency(tx.commissionEarned, currencyCode)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge
                                variant={statusConfig.variant}
                                className={`gap-1 text-[10px] ${statusConfig.className}`}
                              >
                                {STATUS_ICONS[tx.status]}
                                {statusConfig.label}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
