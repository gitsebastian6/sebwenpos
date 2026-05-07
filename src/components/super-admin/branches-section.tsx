'use client'

import { useState } from 'react'
import { useStoreBranches, useCreateBranch } from '@/hooks/api/use-super-admin'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Building2, Users, Package, ShoppingCart, Crown, Plus, Link2 } from 'lucide-react'
import { formatDate } from './helpers'

interface BranchesSectionProps {
  storeId: number
  storeName: string
  storeLegalName: string | null
  storeNit: string | null
  onRefresh?: (storeId: number) => void
}

export function BranchesSection({ storeId, storeName, storeLegalName, storeNit, onRefresh }: BranchesSectionProps) {
  const { data, isLoading: branchesLoading } = useStoreBranches(storeId)
  const createBranchMutation = useCreateBranch()
  const branchCreating = createBranchMutation.isPending
  const branches = data?.branches ?? []
  const parentSubInfo = data?.parentSubscription ?? null
  const [showBranchDialog, setShowBranchDialog] = useState(false)
  const [branchForm, setBranchForm] = useState({ name: '', address: '', phone: '', legalName: '', nit: '' })

  async function handleCreateBranch() {
    if (!branchForm.name || branchForm.name.length < 2) { toast.error('Nombre de sucursal obligatorio (mín. 2 caracteres)'); return }
    try {
      await createBranchMutation.mutateAsync({ storeId, body: branchForm })
      toast.success(`Sucursal "${branchForm.name}" creada exitosamente`)
      setBranchForm({ name: '', address: '', phone: '', legalName: '', nit: '' })
      setShowBranchDialog(false)
      onRefresh?.(storeId)
    } catch (err: any) { toast.error(err?.message || 'Error al crear sucursal') }
  }

  return (
    <>
      {/* Sucursales (Branches) */}
      <Card className="rounded-xl border-border/50">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${parentSubInfo?.multiStoreEnabled ? 'bg-violet-100 dark:bg-violet-500/15' : 'bg-muted'}`}>
                <Building2 className={`h-5 w-5 ${parentSubInfo?.multiStoreEnabled ? 'text-violet-600 dark:text-violet-400' : 'text-muted-foreground/40'}`} />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  Sucursales
                  {branches.length > 0 && <Badge variant="secondary" className="text-xs">{branches.length}/{parentSubInfo?.maxStores ?? 1}</Badge>}
                </CardTitle>
                <CardDescription>
                  {parentSubInfo?.multiStoreEnabled
                    ? <>Suscripción centralizada · Plan {parentSubInfo.planName} · Máx. {parentSubInfo.maxStores} sucursales</>
                    : 'Disponible únicamente con los planes Pro y Empresarial'
                  }
                </CardDescription>
              </div>
            </div>
            {parentSubInfo?.multiStoreEnabled ? (
              branches.length < (parentSubInfo?.maxStores ?? 0) ? (
                <Button size="sm" className="gap-1.5 active:scale-[0.98] transition-all" onClick={() => setShowBranchDialog(true)}>
                  <Plus className="h-3.5 w-3.5" />Nueva Sucursal
                </Button>
              ) : (
                <Badge variant="outline" className="text-xs border-muted-foreground/30 text-muted-foreground gap-1">
                  <Crown className="h-3 w-3" />Requiere Empresarial
                </Badge>
              )
            ) : (
              <Badge variant="outline" className="text-xs border-muted-foreground/30 text-muted-foreground gap-1">
                <Crown className="h-3 w-3" />Requiere Empresarial
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!parentSubInfo?.multiStoreEnabled && (
            <div className="rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 p-6 mb-4 text-center">
              <Crown className="h-8 w-8 text-amber-500/50 mx-auto mb-2" />
              <p className="text-sm font-medium text-muted-foreground">Multi-Tienda no disponible en este plan</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Actualmente en plan <span className="font-semibold">{parentSubInfo?.planName || '—'}</span>. Actualiza a Empresarial para crear y gestionar sucursales.</p>
            </div>
          )}
          {branchesLoading ? (
            <div className="flex justify-center py-8"><div className="h-6 w-6 border-3 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : branches.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="h-12 w-12 text-muted-foreground/20 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Sin sucursales creadas</p>
              <p className="text-xs text-muted-foreground/70 mt-1">{parentSubInfo?.multiStoreEnabled ? 'Crea sucursales para gestionar múltiples puntos de venta del mismo dueño' : 'Actualiza a Empresarial para habilitar esta funcionalidad'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {branches.map((branch) => (
                <div key={branch.id} className="p-4 rounded-xl border hover:shadow-md transition-all duration-200 group cursor-pointer" onClick={() => onRefresh?.(branch.id)}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 bg-violet-100 dark:bg-violet-500/15 rounded-lg flex items-center justify-center">
                        <Building2 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{branch.name}</p>
                        {branch.address && <p className="text-xs text-muted-foreground">{branch.address}</p>}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Link2 className="h-2.5 w-2.5" />Vinculada
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{branch._count.employees}</span>
                    <span className="flex items-center gap-1"><Package className="h-3 w-3" />{branch._count.products}</span>
                    <span className="flex items-center gap-1"><ShoppingCart className="h-3 w-3" />{branch._count.orders}</span>
                    <span className="ml-auto">{formatDate(branch.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Branch Dialog */}
      <Dialog open={showBranchDialog} onOpenChange={(open) => { if (!open) setBranchForm({ name: '', address: '', phone: '', legalName: '', nit: '' }); setShowBranchDialog(open) }}>
        <DialogContent className="max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>Nueva Sucursal</DialogTitle>
            <DialogDescription>Sucursal vinculada a {storeName}. Hereda la suscripción {parentSubInfo?.planName || '—'} ({branches.length + 1}/{parentSubInfo?.maxStores ?? '—'}). El dueño accede con las mismas credenciales.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nombre de la Sucursal *</Label>
              <Input placeholder="Ej: Sucursal Norte" value={branchForm.name} onChange={(e) => setBranchForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Razón Social</Label>
              <Input placeholder={storeLegalName || 'Opcional'} value={branchForm.legalName} onChange={(e) => setBranchForm(p => ({ ...p, legalName: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>NIT</Label>
                <Input placeholder={storeNit || 'Opcional'} value={branchForm.nit} onChange={(e) => setBranchForm(p => ({ ...p, nit: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input placeholder="3001234567" value={branchForm.phone} onChange={(e) => setBranchForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Dirección</Label>
              <Input placeholder="Calle 10 #5-30" value={branchForm.address} onChange={(e) => setBranchForm(p => ({ ...p, address: e.target.value }))} />
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
              <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 shrink-0" />
                La sucursal hereda la suscripción del plan {parentSubInfo?.planName || '—'}. No se generan credenciales separadas.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBranchDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateBranch} disabled={branchCreating} className="gap-1.5">
              {branchCreating ? <><div className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />Creando...</> : <><Plus className="h-3.5 w-3.5" />Crear Sucursal</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
