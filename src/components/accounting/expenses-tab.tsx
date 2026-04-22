'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Receipt, TrendingDown, CalendarDays, DollarSign, Loader2, Pencil, Trash2 } from 'lucide-react'
import type { Expense } from './accounting-types'
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_CATEGORY_COLORS,
  formatCurrency,
  formatDateShort,
} from './accounting-types'

interface ExpensesTabProps {
  currencyCode: string
  onAccountsChanged: () => void
}

export function ExpensesTab({ currencyCode, onAccountsChanged }: ExpensesTabProps) {
  const store = useAuthStore((s) => s.store)

  // ─── State ──────────────────────────────────────────────────────────
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(false)
  const [expenseFilterFrom, setExpenseFilterFrom] = useState('')
  const [expenseFilterTo, setExpenseFilterTo] = useState('')
  const [expenseFilterCategory, setExpenseFilterCategory] = useState<string>('')
  const [showExpenseDialog, setShowExpenseDialog] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [deleteExpenseId, setDeleteExpenseId] = useState<number | null>(null)
  const [isSavingExpense, setIsSavingExpense] = useState(false)
  const [expenseFormCategory, setExpenseFormCategory] = useState('OTRO')
  const [expenseFormDescription, setExpenseFormDescription] = useState('')
  const [expenseFormAmount, setExpenseFormAmount] = useState('')
  const [expenseFormDate, setExpenseFormDate] = useState('')
  const [expenseFormNotes, setExpenseFormNotes] = useState('')

  // ─── Fetch ──────────────────────────────────────────────────────────

  const fetchExpenses = useCallback(async () => {
    if (!store?.id) return
    setIsLoadingExpenses(true)
    try {
      let url = `/api/expenses?storeId=${store.id}`
      if (expenseFilterFrom) url += `&from=${expenseFilterFrom}`
      if (expenseFilterTo) url += `&to=${expenseFilterTo}`
      if (expenseFilterCategory) url += `&category=${expenseFilterCategory}`
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setExpenses(data.expenses || [])
      }
    } catch { /* silent */ } finally {
      setIsLoadingExpenses(false)
    }
  }, [store?.id, expenseFilterFrom, expenseFilterTo, expenseFilterCategory])

  useEffect(() => {
    fetchExpenses()
  }, [fetchExpenses])

  // ─── Handlers ───────────────────────────────────────────────────────

  function openCreateExpenseDialog() {
    setEditingExpense(null)
    setExpenseFormCategory('OTRO')
    setExpenseFormDescription('')
    setExpenseFormAmount('')
    setExpenseFormDate(new Date().toISOString().split('T')[0])
    setExpenseFormNotes('')
    setShowExpenseDialog(true)
  }

  function openEditExpenseDialog(expense: Expense) {
    setEditingExpense(expense)
    setExpenseFormCategory(expense.category)
    setExpenseFormDescription(expense.description)
    setExpenseFormAmount(String(expense.amount))
    setExpenseFormDate(new Date(expense.date).toISOString().split('T')[0])
    setExpenseFormNotes(expense.notes || '')
    setShowExpenseDialog(true)
  }

  async function handleSaveExpense() {
    if (!store?.id) return
    const amount = parseInt(expenseFormAmount)
    if (!expenseFormDescription.trim() || isNaN(amount) || amount <= 0) {
      toast.error('Ingresa descripción y monto válido')
      return
    }
    setIsSavingExpense(true)
    try {
      const payload = {
        storeId: store.id,
        category: expenseFormCategory,
        description: expenseFormDescription.trim(),
        amount,
        date: new Date(expenseFormDate + 'T12:00:00').toISOString(),
        notes: expenseFormNotes.trim() || undefined,
      }

      let res: Response
      if (editingExpense) {
        res = await fetch(`/api/expenses/${editingExpense.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch('/api/expenses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (res.ok) {
        toast.success(editingExpense ? 'Gasto actualizado' : 'Gasto registrado')
        setShowExpenseDialog(false)
        fetchExpenses()
        onAccountsChanged()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al guardar gasto')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setIsSavingExpense(false)
    }
  }

  async function handleDeleteExpense() {
    if (!deleteExpenseId) return
    setIsSavingExpense(true)
    try {
      const res = await fetch(`/api/expenses/${deleteExpenseId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Gasto eliminado')
        setDeleteExpenseId(null)
        fetchExpenses()
        onAccountsChanged()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al eliminar')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setIsSavingExpense(false)
    }
  }

  // ─── Stats ──────────────────────────────────────────────────────────
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const todayStr = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split('T')[0]

  const totalGastosMes = expenses
    .filter((e) => new Date(e.date) >= monthStart)
    .reduce((sum, e) => sum + e.amount, 0)

  const gastosHoy = expenses
    .filter((e) => {
      const d = new Date(e.date)
      return d.toISOString().split('T')[0] === todayStr
    })
    .reduce((sum, e) => sum + e.amount, 0)

  const categoryTotals: Record<string, number> = {}
  expenses
    .filter((e) => new Date(e.date) >= monthStart)
    .forEach((e) => {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount
    })
  const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]
  const topCategoryLabel = topCategory ? EXPENSE_CATEGORY_LABELS[topCategory[0]] || topCategory[0] : 'N/A'

  // ─── Render ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Gastos Operacionales</h2>
          <p className="text-sm text-muted-foreground">
            {expenses.length} gasto{expenses.length !== 1 ? 's' : ''} registrado{expenses.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button className="gap-1.5 active:scale-[0.98] transition-all" onClick={openCreateExpenseDialog} size="sm">
          <Receipt className="h-3.5 w-3.5" />
          Registrar Gasto
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-red-100 dark:bg-red-950 flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Gastos del Mes</p>
                <p className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">
                  {formatCurrency(totalGastosMes, currencyCode)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-950 flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Gastos Hoy</p>
                <p className="text-lg font-bold tabular-nums">
                  {formatCurrency(gastosHoy, currencyCode)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-100 dark:bg-violet-950 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Categoría Principal</p>
                <p className="text-lg font-bold">{topCategoryLabel}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="w-full sm:w-auto">
              <Label className="text-xs text-muted-foreground mb-1.5 block">Desde</Label>
              <Input type="date" value={expenseFilterFrom} onChange={(e) => setExpenseFilterFrom(e.target.value)} className="h-9" />
            </div>
            <div className="w-full sm:w-auto">
              <Label className="text-xs text-muted-foreground mb-1.5 block">Hasta</Label>
              <Input type="date" value={expenseFilterTo} onChange={(e) => setExpenseFilterTo(e.target.value)} className="h-9" />
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant={expenseFilterCategory === '' ? 'default' : 'outline'} size="sm" onClick={() => setExpenseFilterCategory('')} className="h-9">Todas</Button>
              <Button variant={expenseFilterCategory === 'ARRIENDO' ? 'default' : 'outline'} size="sm" onClick={() => setExpenseFilterCategory(expenseFilterCategory === 'ARRIENDO' ? '' : 'ARRIENDO')} className="h-9">Arriendo</Button>
              <Button variant={expenseFilterCategory === 'NOMINA' ? 'default' : 'outline'} size="sm" onClick={() => setExpenseFilterCategory(expenseFilterCategory === 'NOMINA' ? '' : 'NOMINA')} className="h-9">Nómina</Button>
              <Button variant={expenseFilterCategory === 'SERVICIOS' ? 'default' : 'outline'} size="sm" onClick={() => setExpenseFilterCategory(expenseFilterCategory === 'SERVICIOS' ? '' : 'SERVICIOS')} className="h-9">Servicios</Button>
              <Button variant={expenseFilterCategory === 'IMPUESTOS' ? 'default' : 'outline'} size="sm" onClick={() => setExpenseFilterCategory(expenseFilterCategory === 'IMPUESTOS' ? '' : 'IMPUESTOS')} className="h-9">Impuestos</Button>
            </div>
            {(expenseFilterFrom || expenseFilterTo || expenseFilterCategory) && (
              <Button variant="ghost" size="sm" onClick={() => { setExpenseFilterFrom(''); setExpenseFilterTo(''); setExpenseFilterCategory('') }} className="h-9">Limpiar</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Expenses list */}
      {isLoadingExpenses ? (
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
          <CardContent className="p-4">
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-6 w-20" />
                  <Skeleton className="h-6 w-32 flex-1" />
                  <Skeleton className="h-6 w-24" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : expenses.length === 0 ? (
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Receipt className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">No hay gastos registrados</p>
            <p className="text-muted-foreground text-xs mt-1">Los gastos registrados aparecerán aquí</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl border-border/50">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-muted/30 transition-colors">
                  <TableHead className="w-[80px] text-xs whitespace-nowrap">Fecha</TableHead>
                  <TableHead className="w-[100px] text-xs whitespace-nowrap">Categoría</TableHead>
                  <TableHead className="text-xs whitespace-nowrap">Descripción</TableHead>
                  <TableHead className="text-right w-[110px] text-xs whitespace-nowrap">Monto</TableHead>
                  <TableHead className="w-[80px] text-center text-xs">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow className="hover:bg-muted/30 transition-colors" key={expense.id}>
                    <TableCell className="text-xs tabular-nums whitespace-nowrap">
                      {formatDateShort(expense.date)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${EXPENSE_CATEGORY_COLORS[expense.category] || 'bg-secondary text-secondary-foreground border-border'}`}>
                        {EXPENSE_CATEGORY_LABELS[expense.category] || expense.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-xs font-medium truncate max-w-[140px]" title={expense.description}>{expense.description}</p>
                        {expense.notes && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[140px]" title={expense.notes}>{expense.notes}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs font-bold tabular-nums text-red-600 dark:text-red-400 whitespace-nowrap">
                      -{formatCurrency(expense.amount, currencyCode)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 active:scale-[0.98] transition-all"
                          onClick={() => openEditExpenseDialog(expense)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700 active:scale-[0.98] transition-all"
                          onClick={() => setDeleteExpenseId(expense.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ─── Dialog: Create/Edit Expense ────────────────────────────────── */}
      <Dialog open={showExpenseDialog} onOpenChange={(open) => { if (!open) setShowExpenseDialog(false) }}>
        <DialogContent className="max-w-md backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>{editingExpense ? 'Editar Gasto' : 'Registrar Gasto'}</DialogTitle>
            <DialogDescription>
              {editingExpense ? 'Modifica los datos del gasto' : 'Ingresa los datos del nuevo gasto'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Categoría</Label>
              <Select value={expenseFormCategory} onValueChange={setExpenseFormCategory}>
                <SelectTrigger className="focus-visible:ring-primary/20 focus-visible:border-primary/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {EXPENSE_CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Descripción</Label>
              <Input placeholder="Ej: Pago arriendo mes de enero" value={expenseFormDescription} onChange={(e) => setExpenseFormDescription(e.target.value)} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Monto (COP)</Label>
                <Input type="number" min="1" placeholder="0" value={expenseFormAmount} onChange={(e) => setExpenseFormAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Fecha</Label>
                <Input type="date" value={expenseFormDate} onChange={(e) => setExpenseFormDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Notas (opcional)</Label>
              <Textarea placeholder="Observaciones adicionales..." value={expenseFormNotes} onChange={(e) => setExpenseFormNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExpenseDialog(false)}>Cancelar</Button>
            <Button className="gap-1.5 active:scale-[0.98] transition-all" onClick={handleSaveExpense} disabled={isSavingExpense || !expenseFormDescription.trim() || !expenseFormAmount}>
              {isSavingExpense && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingExpense ? 'Guardar Cambios' : 'Registrar Gasto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── AlertDialog: Delete Expense ────────────────────────────────── */}
      <AlertDialog open={deleteExpenseId !== null} onOpenChange={(open) => { if (!open) setDeleteExpenseId(null) }}>
        <AlertDialogContent className="backdrop-blur-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar gasto?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará el registro del gasto y sus asientos contables.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteExpense} disabled={isSavingExpense} className="bg-red-600 hover:bg-red-700">
              {isSavingExpense ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
