'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, CheckCircle2, ChevronRight, AlertTriangle, Loader2, Plus } from 'lucide-react'

interface Order { id: number; orderNumber: string; total: number; customerName?: string }

export default function Test() {
  const [step, setStep] = useState<1 | 2>(1)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isContingency, setIsContingency] = useState(false)
  const [formNit, setFormNit] = useState('222222222222')
  const [formName, setFormName] = useState('Consumidor Final')
  const [formEmail, setFormEmail] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formType, setFormType] = useState('__none__')
  const [formRegime, setFormRegime] = useState('RESPONSABLE')
  const [formPhone, setFormPhone] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [formContingencyType, setFormContingencyType] = useState('03')
  const [formContingencyNotes, setFormContingencyNotes] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [ordersLoading, setOrdersLoading] = useState(false)

  const filteredOrders: Order[] = []

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold bg-primary text-primary-foreground">1</div>
        <div className="h-0.5 flex-1 bg-muted" />
        <div className="flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold bg-muted text-muted-foreground">2</div>
      </div>

      <div>
      {step === 1 ? (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar..." className="pl-9" />
          </div>
          {ordersLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-muted-foreground">No hay ordenes.</p>
            </div>
          ) : (
            <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
              {filteredOrders.map((order) => (
                <button key={order.id} type="button" className="w-full flex items-center gap-3 p-3">
                  <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{order.orderNumber}</p>
                      {order.orderNumber === 'A' ? (
                        <Badge variant="outline">Tirilla</Badge>
                      ) : (
                        <Badge variant="outline">Factura</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{order.customerName || 'Sin cliente'}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {selectedOrder && (
            <div className="rounded-lg bg-muted/50 p-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{selectedOrder.orderNumber}</p>
                <p className="text-xs text-muted-foreground">{selectedOrder.customerName || 'Consumidor Final'}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setStep(1)}>Cambiar</Button>
            </div>
          )}

          <div className="rounded-lg border border-amber-200 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <div>
                  <p className="text-sm font-medium text-amber-700">Contingencia</p>
                  <p className="text-[10px] text-muted-foreground">Tipos 03/04</p>
                </div>
              </div>
              <Button variant={isContingency ? 'destructive' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setIsContingency(!isContingency)}>
                {isContingency ? 'Activada' : 'Activar'}
              </Button>
            </div>
            {isContingency && (
              <div className="mt-3 space-y-3 pt-3 border-t border-amber-200/50">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Tipo *</Label>
                  <Select value={formContingencyType} onValueChange={setFormContingencyType}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="03">03</SelectItem>
                      <SelectItem value="04">04</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Notas *</Label>
                  <Textarea value={formContingencyNotes} onChange={(e) => setFormContingencyNotes(e.target.value)} placeholder="Describa..." rows={2} className="text-xs" />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="inv-nit" className="text-xs font-medium">NIT / Documento *</Label>
              <Input id="inv-nit" value={formNit} onChange={(e) => setFormNit(e.target.value)} placeholder="222222222222" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-name" className="text-xs font-medium">Nombre / Razón Social *</Label>
              <Input id="inv-name" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Consumidor Final" />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="inv-email" className="text-xs font-medium">Email (opcional)</Label>
              <Input id="inv-email" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="cliente@email.com" />
            </div>
          </div>
          <div>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setShowAdvanced(!showAdvanced)}>
              {showAdvanced
                ? <span className="flex items-center"><ChevronRight className="h-3 w-3 mr-1 rotate-90" />Ocultar campos opcionales</span>
                : <span className="flex items-center"><ChevronRight className="h-3 w-3 mr-1" />Campos opcionales (tipo documento, régimen, dirección, teléfono)</span>
              }
            </Button>
            {showAdvanced && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="inv-type" className="text-xs font-medium">Tipo Documento</Label>
                  <Select value={formType} onValueChange={setFormType}>
                    <SelectTrigger id="inv-type" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sin documento</SelectItem>
                      <SelectItem value="CC">CC</SelectItem>
                      <SelectItem value="NIT">NIT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-regime" className="text-xs font-medium">Régimen</Label>
                  <Select value={formRegime} onValueChange={setFormRegime}>
                    <SelectTrigger id="inv-regime" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RESPONSABLE">Responsable</SelectItem>
                      <SelectItem value="NO_RESPONSABLE">No Responsable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-address" className="text-xs font-medium">Dirección</Label>
                  <Input id="inv-address" value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="Calle 123 #45-67" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-phone" className="text-xs font-medium">Teléfono</Label>
                  <Input id="inv-phone" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="3101234567" />
                </div>
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="inv-notes" className="text-xs font-medium">Notas (opcional)</Label>
                  <Textarea id="inv-notes" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Observaciones..." rows={2} className="text-xs" />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      <div>
        <Button variant="outline" onClick={() => setStep(1)}>Cancelar</Button>
        {step === 2 && (
          <Button disabled={!formNit.trim() || !formName.trim()}>
            {false ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creando...</> : <><Plus className="h-4 w-4 mr-2" />Crear Factura</>}
          </Button>
        )}
      </div>
    </div>
  )
}
