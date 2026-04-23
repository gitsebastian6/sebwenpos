'use client'

import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Building2, Store, User, Phone, Mail, MapPin, Hash, Pencil, Receipt, Upload, XCircle, FileText } from 'lucide-react'
import type { StoreListItem, StoreCount } from './types'

interface EditStoreDialogProps {
  store: StoreListItem & { _count: StoreCount }
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function EditStoreDialog({ store, open, onOpenChange, onSaved }: EditStoreDialogProps) {
  const queryClient = useQueryClient()

  const [saving, setSaving] = useState(false)
  const [editForm, setEditForm] = useState({
    name: store.name || '',
    legalName: store.legalName || '',
    nit: store.nit || '',
    address: store.address || '',
    phone: store.phone || '',
    ownerFullName: store.user.fullName || '',
    ownerEmail: store.user.email || '',
    ownerPhone: store.user.phone || '',
  })

  // Edit dialog receipt state
  const [editReceiptFile, setEditReceiptFile] = useState<File | null>(null)
  const [editReceiptForm, setEditReceiptForm] = useState({
    amount: '', paymentMethod: 'NEQUI', reference: '', notes: '',
  })
  const [uploadingReceipt, setUploadingReceipt] = useState(false)

  // Initialize form when dialog opens
  useEffect(() => {
    if (open) {
      setEditForm({
        name: store.name || '',
        legalName: store.legalName || '',
        nit: store.nit || '',
        address: store.address || '',
        phone: store.phone || '',
        ownerFullName: store.user.fullName || '',
        ownerEmail: store.user.email || '',
        ownerPhone: store.user.phone || '',
      })
      setEditReceiptFile(null)
      setEditReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' })
    }
  }, [open, store])

  function updateEdit(field: string, value: string) { setEditForm((p) => ({ ...p, [field]: value })) }

  async function handleSave() {
    if (!editForm.name || editForm.name.length < 2) { toast.error('Nombre de tienda es obligatorio (mín. 2 caracteres)'); return }
    if (!editForm.ownerFullName || editForm.ownerFullName.length < 2) { toast.error('Nombre del propietario es obligatorio (mín. 2 caracteres)'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/super-admin/stores/${store.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          legalName: editForm.legalName || null,
          nit: editForm.nit || null,
          address: editForm.address || null,
          phone: editForm.phone || null,
          ownerFullName: editForm.ownerFullName,
          ownerEmail: editForm.ownerEmail || null,
          ownerPhone: editForm.ownerPhone || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al guardar'); return }
      toast.success(data.message || 'Datos actualizados')

      if (editReceiptFile && editReceiptForm.amount) {
        setUploadingReceipt(true)
        try {
          const reader = new FileReader()
          const fileData = await new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result as string
              const base64 = result.split(',')[1]
              if (base64) resolve(base64)
              else reject(new Error('No se pudo leer el archivo'))
            }
            reader.onerror = () => reject(new Error('Error leyendo archivo'))
            reader.readAsDataURL(editReceiptFile)
          })
          const receiptRes = await fetch('/api/super-admin/payment-receipts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storeId: store.id,
              amount: parseInt(editReceiptForm.amount),
              paymentMethod: editReceiptForm.paymentMethod,
              reference: editReceiptForm.reference || undefined,
              notes: editReceiptForm.notes || undefined,
              fileData,
              fileName: editReceiptFile.name,
              fileSize: editReceiptFile.size,
              fileType: editReceiptFile.type || 'application/octet-stream',
            }),
          })
          const receiptData = await receiptRes.json()
          if (!receiptRes.ok) { toast.error(receiptData.error || 'Error al subir comprobante') }
          else { toast.success('Comprobante de pago registrado') }
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Error al subir comprobante')
        }
        finally { setUploadingReceipt(false) }
      }

      onOpenChange(false)
      setEditReceiptFile(null)
      setEditReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' })
      onSaved()
      queryClient.invalidateQueries({ queryKey: ['stores'] })
      queryClient.invalidateQueries({ queryKey: ['store-detail', store.id] })
    } catch { toast.error('Error de conexión') }
    finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!open) { setEditReceiptFile(null); setEditReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' }) } onOpenChange(open) }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>Editar Datos del Establecimiento</DialogTitle>
          <DialogDescription>Modifique la información del local y del propietario</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Datos del Establecimiento</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2 sm:col-span-2">
                <Label>Nombre de la Tienda *</Label>
                <div className="relative">
                  <Store className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Nombre del negocio" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editForm.name} onChange={(e) => updateEdit('name', e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Razón Social</Label>
                <Input className="focus-visible:ring-primary/20 focus-visible:border-primary/40" placeholder="Razón social" value={editForm.legalName} onChange={(e) => updateEdit('legalName', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>NIT</Label>
                <div className="relative">
                  <Hash className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="901234567-8" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editForm.nit} onChange={(e) => updateEdit('nit', e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Teléfono del Local</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="6011234567" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editForm.phone} onChange={(e) => updateEdit('phone', e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Dirección</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Calle 10 #5-30" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editForm.address} onChange={(e) => updateEdit('address', e.target.value)} />
                </div>
              </div>
            </div>
          </div>
          <Separator />
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Datos del Propietario</h3>
              <Badge variant="outline" className="text-xs font-mono">{store.user.cedula}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2 sm:col-span-2">
                <Label>Nombre Completo *</Label>
                <Input className="focus-visible:ring-primary/20 focus-visible:border-primary/40" placeholder="Nombre del propietario" value={editForm.ownerFullName} onChange={(e) => updateEdit('ownerFullName', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input type="email" placeholder="correo@ejemplo.com" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editForm.ownerEmail} onChange={(e) => updateEdit('ownerEmail', e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="3001234567" className="pl-10 focus-visible:ring-primary/20 focus-visible:border-primary/40" value={editForm.ownerPhone} onChange={(e) => updateEdit('ownerPhone', e.target.value)} />
                </div>
              </div>
            </div>
          </div>
          <Separator />
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Comprobante de Pago (Opcional)</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2 sm:col-span-2">
                <Label>Archivo del comprobante</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-3 text-center hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => document.getElementById('edit-receipt-file')?.click()}
                >
                  {editReceiptFile ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium truncate">{editReceiptFile.name}</span>
                      <span className="text-xs text-muted-foreground">({(editReceiptFile.size / 1024).toFixed(0)}KB)</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditReceiptFile(null) }}
                        className="ml-2 text-muted-foreground hover:text-destructive"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground"><Upload className="h-5 w-5 text-muted-foreground/50 mx-auto mb-1" />Haz clic para seleccionar archivo</p>
                  )}
                  <input
                    id="edit-receipt-file"
                    type="file"
                    className="hidden"
                    accept="image/png,image/jpeg,image/webp,image/heic,.pdf"
                    onChange={(e) => { if (e.target.files?.[0]) setEditReceiptFile(e.target.files[0]) }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Monto (COP)</Label>
                <Input type="number" placeholder="50000" value={editReceiptForm.amount}
                  onChange={(e) => setEditReceiptForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Método de pago</Label>
                <Select value={editReceiptForm.paymentMethod} onValueChange={(v) => setEditReceiptForm(f => ({ ...f, paymentMethod: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NEQUI">Nequi</SelectItem>
                    <SelectItem value="DAVIPLATA">Davivienda (Daviplata)</SelectItem>
                    <SelectItem value="BANCOLOMBIA">Bancolombia</SelectItem>
                    <SelectItem value="BANCARY">Bancario (Consignación)</SelectItem>
                    <SelectItem value="EFFECTIVE">Efectivo</SelectItem>
                    <SelectItem value="OTHER">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Referencia / Transacción</Label>
                <Input placeholder="Ej: 000123456789" value={editReceiptForm.reference}
                  onChange={(e) => setEditReceiptForm(f => ({ ...f, reference: e.target.value }))} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Notas</Label>
                <Textarea placeholder="Observaciones..." rows={2} value={editReceiptForm.notes}
                  onChange={(e) => setEditReceiptForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); setEditReceiptFile(null); setEditReceiptForm({ amount: '', paymentMethod: 'NEQUI', reference: '', notes: '' }) }}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || uploadingReceipt} className="gap-2 active:scale-[0.98] transition-all">
            {saving || uploadingReceipt ? (
              <><div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />{uploadingReceipt ? 'Subiendo comprobante...' : 'Guardando...'}</>
            ) : (
              <><Pencil className="h-4 w-4" />Guardar Cambios</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
