'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Crown, Users, Package, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { formatCOP } from './helpers'
import { formatLimit } from './helpers'
import type { PlanData } from './types'
import { useUpdatePlan } from '@/hooks/api/use-super-admin'

interface PlansViewProps {
  plans: PlanData[]
  onPlansChange: () => void
}

export function PlansView({ plans, onPlansChange }: PlansViewProps) {
  const updatePlan = useUpdatePlan()
  const [showEditPlanDialog, setShowEditPlanDialog] = useState(false)
  const [editingPlan, setEditingPlan] = useState<PlanData | null>(null)
  const [planForm, setPlanForm] = useState({
    name: '', description: '', price: 0,
    maxEmployees: 5, maxProducts: 100, maxStores: 1,
    sortOrder: 0, isActive: true,
  })

  function openEditPlan(plan: PlanData) {
    setEditingPlan(plan)
    setPlanForm({
      name: plan.name,
      description: plan.description || '',
      price: plan.price,
      maxEmployees: plan.maxEmployees,
      maxProducts: plan.maxProducts,
      maxStores: plan.maxStores,
      sortOrder: plan.sortOrder,
      isActive: plan.isActive,
    })
    setShowEditPlanDialog(true)
  }

  function handleSavePlan() {
    if (!editingPlan) return
    if (!planForm.name || planForm.name.length < 2) { toast.error('Nombre del plan es obligatorio (mín. 2 caracteres)'); return }
    updatePlan.mutate(
      { id: editingPlan.id, body: planForm },
      {
        onSuccess: (data: any) => {
          toast.success(data?.message || 'Plan actualizado exitosamente')
          setShowEditPlanDialog(false)
          onPlansChange()
        },
        onError: (err) => toast.error(err.message || 'Error de conexión'),
      },
    )
  }

  return (
    <>
      <Card className="rounded-xl border-border/50">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-500" />
                Planes de Suscripción
              </CardTitle>
              <CardDescription>Administre los planes disponibles para las tiendas</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Crown className="h-16 w-16 text-muted-foreground/30 mb-4 animate-pulse" />
              <p className="text-muted-foreground font-medium">No hay planes configurados</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Los planes se crearán automáticamente</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Plan</TableHead>
                    <TableHead className="min-w-[120px] text-right">Precio</TableHead>
                    <TableHead className="min-w-[160px]">Límites</TableHead>
                    <TableHead className="min-w-[200px]">Características</TableHead>
                    <TableHead className="text-center min-w-[80px]">Suscriptores</TableHead>
                    <TableHead className="text-center min-w-[80px]">Estado</TableHead>
                    <TableHead className="text-right min-w-[80px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plans.sort((a, b) => a.sortOrder - b.sortOrder).map((plan) => (
                    <TableRow key={plan.id} className="group hover:bg-muted/30">
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 bg-amber-100 dark:bg-amber-500/15 rounded-lg flex items-center justify-center shrink-0">
                            <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm">{plan.name}</p>
                            {plan.description && <p className="text-xs text-muted-foreground truncate">{plan.description}</p>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono font-bold">{formatCOP(plan.price)}</span>
                        <span className="text-xs text-muted-foreground"> /mes</span>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-0.5 text-xs">
                          <div className="flex items-center gap-1"><Users className="h-3 w-3 text-muted-foreground" />Empleados: <span className="font-medium">{formatLimit(plan.maxEmployees)}</span></div>
                          <div className="flex items-center gap-1"><Package className="h-3 w-3 text-muted-foreground" />Productos: <span className="font-medium">{formatLimit(plan.maxProducts)}</span></div>
                          <div className="flex items-center gap-1"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>Sucursales: <span className="font-medium">{formatLimit(plan.maxStores)}</span></div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(plan.features).map(([key, val]) => (
                            <Badge
                              key={key}
                              variant={val === true ? 'default' : 'outline'}
                              className={`text-[10px] ${val === true ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20' : 'opacity-50'}`}
                            >
                              {key}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="text-xs">{plan.subscriptionCount}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={plan.isActive ? 'default' : 'secondary'}
                          className={plan.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/20' : ''}
                        >
                          {plan.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Editar plan"
                          aria-label="Editar plan"
                          onClick={() => openEditPlan(plan)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Plan Dialog */}
      <Dialog open={showEditPlanDialog} onOpenChange={setShowEditPlanDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-xl backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>Editar Plan: {editingPlan?.name}</DialogTitle>
            <DialogDescription>Modifique los campos deseados y guarde los cambios</DialogDescription>
          </DialogHeader>
          {editingPlan && (
            <div className="space-y-5 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="pf-name">Nombre *</Label>
                  <Input id="pf-name" className="focus-visible:ring-primary/20 focus-visible:border-primary/40" value={planForm.name} onChange={(e) => setPlanForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="pf-desc">Descripción</Label>
                  <Input id="pf-desc" className="focus-visible:ring-primary/20 focus-visible:border-primary/40" value={planForm.description} onChange={(e) => setPlanForm(p => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pf-price">Precio (COP/mes)</Label>
                  <Input id="pf-price" className="focus-visible:ring-primary/20 focus-visible:border-primary/40" type="number" min={0} value={planForm.price} onChange={(e) => setPlanForm(p => ({ ...p, price: parseInt(e.target.value) || 0 }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pf-sort">Orden</Label>
                  <Input id="pf-sort" className="focus-visible:ring-primary/20 focus-visible:border-primary/40" type="number" min={0} value={planForm.sortOrder} onChange={(e) => setPlanForm(p => ({ ...p, sortOrder: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="text-sm font-medium">Límites por Tienda (-1 = ilimitado)</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="pf-emp" className="text-xs text-muted-foreground">Max Empleados</Label>
                    <Input id="pf-emp" className="focus-visible:ring-primary/20 focus-visible:border-primary/40" type="number" min={-1} value={planForm.maxEmployees} onChange={(e) => setPlanForm(p => ({ ...p, maxEmployees: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pf-prod" className="text-xs text-muted-foreground">Max Productos</Label>
                    <Input id="pf-prod" className="focus-visible:ring-primary/20 focus-visible:border-primary/40" type="number" min={-1} value={planForm.maxProducts} onChange={(e) => setPlanForm(p => ({ ...p, maxProducts: parseInt(e.target.value) || 0 }))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pf-stores" className="text-xs text-muted-foreground">Max Sucursales</Label>
                    <Input id="pf-stores" className="focus-visible:ring-primary/20 focus-visible:border-primary/40" type="number" min={1} value={planForm.maxStores} onChange={(e) => setPlanForm(p => ({ ...p, maxStores: parseInt(e.target.value) || 1 }))} />
                  </div>
                </div>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Estado</Label>
                  <p className="text-xs text-muted-foreground">Plan activo para nuevas suscripciones</p>
                </div>
                <Switch checked={planForm.isActive} onCheckedChange={(checked) => setPlanForm(p => ({ ...p, isActive: checked }))} />
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <span className="text-muted-foreground">Suscriptores actuales: </span>
                <Badge variant="secondary" className="ml-1">{editingPlan.subscriptionCount}</Badge>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditPlanDialog(false)}>Cancelar</Button>
            <Button onClick={handleSavePlan} disabled={updatePlan.isPending} className="gap-2 active:scale-[0.98] transition-all">
              {updatePlan.isPending ? (<><div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Guardando...</>) : (<><Pencil className="h-4 w-4" />Guardar</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
