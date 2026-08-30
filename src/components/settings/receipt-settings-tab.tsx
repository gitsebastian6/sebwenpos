'use client'

import { useMemo, useState } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { toast } from 'sonner'
import { useUpdateStore } from '@/hooks/api/use-settings'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2, Save, Printer, FileText, ShieldCheck, Info, AlertTriangle, Receipt,
} from 'lucide-react'

const REGIME_LABELS: Record<string, string> = {
  RESPONSABLE: 'Responsable del IVA',
  NO_RESPONSABLE: 'No responsable de IVA',
  SIMPLIFICADO: 'Régimen Simple de Tributación (SIMPLE)',
}

type PaperWidth = '80' | '58'

export function ReceiptSettingsTab() {
  const { store, updateStore } = useAuthStore()
  const updateStoreMutation = useUpdateStore()
  const saving = updateStoreMutation.isPending

  // ── Form state ──
  const [paperWidth, setPaperWidth] = useState<PaperWidth>(store?.receiptPaperWidth === '58' ? '58' : '80')
  const [taxRegime, setTaxRegime] = useState<string>(store?.taxRegime || 'RESPONSABLE')
  const [docDenomination, setDocDenomination] = useState(store?.receiptDocDenomination || '')
  const [footerText, setFooterText] = useState(store?.receiptFooterText || '')
  const [extraLegend, setExtraLegend] = useState(store?.receiptExtraLegend || '')
  const [isIvaWithholdingAgent, setIsIvaWithholdingAgent] = useState(!!store?.isIvaWithholdingAgent)
  const [isSelfWithholdingAgent, setIsSelfWithholdingAgent] = useState(!!store?.isSelfWithholdingAgent)
  const [isIncResponsible, setIsIncResponsible] = useState(!!store?.isIncResponsible)
  const [posResolutionNumber, setPosResolutionNumber] = useState(store?.posResolutionNumber || '')
  const [posResolutionPrefix, setPosResolutionPrefix] = useState(store?.posResolutionPrefix || 'POS')
  const [posResolutionFrom, setPosResolutionFrom] = useState(store?.posResolutionFrom?.toString() || '')
  const [posResolutionTo, setPosResolutionTo] = useState(store?.posResolutionTo?.toString() || '')
  const [posResolutionDate, setPosResolutionDate] = useState(
    store?.posResolutionDate ? store.posResolutionDate.split('T')[0] : ''
  )
  const [posResolutionEndDate, setPosResolutionEndDate] = useState(
    store?.posResolutionEndDate ? store.posResolutionEndDate.split('T')[0] : ''
  )

  const isResponsable = taxRegime === 'RESPONSABLE'

  const hasChanges =
    paperWidth !== (store?.receiptPaperWidth === '58' ? '58' : '80') ||
    taxRegime !== (store?.taxRegime || 'RESPONSABLE') ||
    docDenomination !== (store?.receiptDocDenomination || '') ||
    footerText !== (store?.receiptFooterText || '') ||
    extraLegend !== (store?.receiptExtraLegend || '') ||
    isIvaWithholdingAgent !== !!store?.isIvaWithholdingAgent ||
    isSelfWithholdingAgent !== !!store?.isSelfWithholdingAgent ||
    isIncResponsible !== !!store?.isIncResponsible ||
    posResolutionNumber !== (store?.posResolutionNumber || '') ||
    posResolutionPrefix !== (store?.posResolutionPrefix || 'POS') ||
    posResolutionFrom !== (store?.posResolutionFrom?.toString() || '') ||
    posResolutionTo !== (store?.posResolutionTo?.toString() || '') ||
    posResolutionDate !== (store?.posResolutionDate ? store.posResolutionDate.split('T')[0] : '') ||
    posResolutionEndDate !== (store?.posResolutionEndDate ? store.posResolutionEndDate.split('T')[0] : '')

  const denominationWarning =
    !docDenomination.trim() && !posResolutionNumber.trim()

  async function handleSave() {
    if (!store?.id) return
    try {
      const data = await updateStoreMutation.mutateAsync({
        storeId: store.id,
        data: {
          receiptPaperWidth: paperWidth,
          taxRegime,
          receiptDocDenomination: docDenomination.trim() || null,
          receiptFooterText: footerText.trim() || null,
          receiptExtraLegend: extraLegend.trim() || null,
          isIvaWithholdingAgent,
          isSelfWithholdingAgent,
          isIncResponsible,
          posResolutionNumber: posResolutionNumber.trim() || null,
          posResolutionPrefix: posResolutionPrefix.trim() || null,
          posResolutionFrom: posResolutionFrom ? parseInt(posResolutionFrom, 10) : null,
          posResolutionTo: posResolutionTo ? parseInt(posResolutionTo, 10) : null,
          posResolutionDate: posResolutionDate || null,
          posResolutionEndDate: posResolutionEndDate || null,
        },
      })
      updateStore(data)
      toast.success('Configuración de la tirilla guardada')
    } catch {
      toast.error('No se pudo guardar la configuración de la tirilla')
    }
  }

  // ── Live preview ──
  const previewWidthPx = paperWidth === '58' ? 200 : 288
  const qualityLegends = useMemo(() => {
    const l: string[] = []
    if (isIvaWithholdingAgent) l.push('Agente retenedor de IVA')
    if (isSelfWithholdingAgent) l.push('Autorretenedor')
    if (isIncResponsible) l.push('Responsable del impuesto nacional al consumo')
    return l
  }, [isIvaWithholdingAgent, isSelfWithholdingAgent, isIncResponsible])

  return (
    <div className="space-y-6">
      {/* ═══ Formato de impresión ═══ */}
      <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Printer className="h-4 w-4" />
            Formato de impresión
          </CardTitle>
          <CardDescription>
            Ancho del rollo térmico. Aplica a la tirilla de venta y a los demás
            documentos térmicos (cierre de caja, corte Z, catálogo, kardex, listados).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={paperWidth}
            onValueChange={(v) => setPaperWidth(v as PaperWidth)}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            <label
              htmlFor="pw-80"
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${paperWidth === '80' ? 'border-primary/50 bg-primary/5' : 'border-border/50 hover:border-primary/20'}`}
            >
              <RadioGroupItem value="80" id="pw-80" className="mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">80 mm</p>
                <p className="text-xs text-muted-foreground">
                  Estándar (~48 caracteres/línea). La mayoría de impresoras de tirilla.
                </p>
              </div>
            </label>
            <label
              htmlFor="pw-58"
              className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${paperWidth === '58' ? 'border-primary/50 bg-primary/5' : 'border-border/50 hover:border-primary/20'}`}
            >
              <RadioGroupItem value="58" id="pw-58" className="mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">58 mm</p>
                <p className="text-xs text-muted-foreground">
                  Compacto (~32 caracteres/línea). Mini impresoras y portátiles.
                </p>
              </div>
            </label>
          </RadioGroup>

          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              Al imprimir, elige «Tamaño de papel: {paperWidth} mm» (o «Recibo» / el
              predeterminado del rollo) y márgenes «Ninguno». Si guardas como PDF y el
              navegador fuerza A4, cambia el tamaño de papel en el diálogo del sistema.
            </span>
          </div>

          {/* Vista previa */}
          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              Vista previa
            </p>
            <div className="overflow-x-auto">
              <div
                className="border-2 border-dashed rounded-lg p-3 bg-muted/20 font-mono text-[10px] leading-relaxed space-y-0.5 mx-auto"
                style={{ width: previewWidthPx, maxWidth: '100%' }}
              >
                <p className="text-center font-bold uppercase tracking-wider">{store?.name || 'NOMBRE DEL NEGOCIO'}</p>
                <p className="text-center text-muted-foreground">{docDenomination.trim() || 'Tirilla de Venta'}</p>
                {store?.nit && <p className="text-center">NIT: {store.nit}</p>}
                {store?.address && <p className="text-center">{store.address}</p>}
                <div className="border-t border-dashed my-1" />
                <p className="text-center">{REGIME_LABELS[taxRegime] || taxRegime}</p>
                {qualityLegends.map((l) => (
                  <p key={l} className="text-center">{l}</p>
                ))}
                {posResolutionNumber.trim() && (
                  <p className="text-center">
                    Resolución DIAN {posResolutionNumber.trim()}
                    {posResolutionPrefix.trim() ? ` Prefijo: ${posResolutionPrefix.trim()}` : ''}
                  </p>
                )}
                {extraLegend.trim() &&
                  extraLegend.split('\n').map((l, i) => l.trim() && <p key={i} className="text-center">{l.trim()}</p>)}
                <div className="border-t border-dashed my-1" />
                <div className="flex justify-between"><span>Subtotal</span><span>$ 10.000</span></div>
                {isResponsable && <div className="flex justify-between"><span>IVA Incluido</span><span>+ $ 1.597</span></div>}
                <div className="flex justify-between font-bold"><span>TOTAL</span><span>$ 10.000</span></div>
                <div className="border-t border-dashed my-1" />
                <p className="text-center text-muted-foreground">{footerText.trim() || 'Gracias por su compra'}</p>
                <p className="text-center text-muted-foreground">¡Vuelva pronto!</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Datos tributarios de la tirilla ═══ */}
      <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Datos tributarios de la tirilla
          </CardTitle>
          <CardDescription>
            Textos y leyendas fiscales que se imprimen en el recibo de venta. La razón
            social, el NIT, la dirección y el teléfono se editan en la pestaña
            «Facturación».
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tax-regime">Régimen tributario</Label>
            <Select value={taxRegime} onValueChange={setTaxRegime}>
              <SelectTrigger id="tax-regime">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RESPONSABLE">Responsable del IVA</SelectItem>
                <SelectItem value="NO_RESPONSABLE">No responsable de IVA</SelectItem>
                <SelectItem value="SIMPLIFICADO">Régimen Simple de Tributación (SIMPLE)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Si eliges «No responsable de IVA», la tirilla no imprime IVA ni la
              leyenda de responsable. Verifica esta condición en tu RUT.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-denomination">Denominación del documento</Label>
            <Input
              id="doc-denomination"
              value={docDenomination}
              onChange={(e) => setDocDenomination(e.target.value)}
              placeholder="Ej: Documento equivalente de POS"
            />
            {denominationWarning && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                «Tirilla de venta» a secas no es una denominación válida ante la DIAN
                si el documento se usa como equivalente. Define la denominación y la
                resolución POS más abajo.
              </p>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <p className="text-sm font-medium">Calidades tributarias (se imprimen como leyenda)</p>
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <Label className="text-sm font-normal">Agente retenedor de IVA</Label>
              <Switch checked={isIvaWithholdingAgent} onCheckedChange={setIsIvaWithholdingAgent} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <Label className="text-sm font-normal">Autorretenedor</Label>
              <Switch checked={isSelfWithholdingAgent} onCheckedChange={setIsSelfWithholdingAgent} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <Label className="text-sm font-normal">Responsable del impuesto nacional al consumo (INC)</Label>
              <Switch checked={isIncResponsible} onCheckedChange={setIsIncResponsible} />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="extra-legend">Leyenda tributaria adicional</Label>
            <Textarea
              id="extra-legend"
              value={extraLegend}
              onChange={(e) => setExtraLegend(e.target.value)}
              placeholder="Texto libre. Una línea por renglón."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="footer-text">Pie de página</Label>
            <Input
              id="footer-text"
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="Gracias por su compra"
            />
            <p className="text-xs text-muted-foreground">
              Reemplaza el mensaje «Gracias por su compra». «¡Vuelva pronto!» se mantiene.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Resolución DIAN — Documento Equivalente POS ═══ */}
      <Card className="border-border/50 hover:shadow-md hover:border-primary/20 transition-all duration-200 rounded-xl">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Resolución DIAN — Documento Equivalente POS
          </CardTitle>
          <CardDescription>
            Numeración autorizada por la DIAN para el tiquete / documento equivalente
            POS. Es distinta de la «Resolución DIAN» de facturación electrónica (pestaña
            «Facturación»).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pos-res-number">Número de Resolución</Label>
              <Input
                id="pos-res-number"
                value={posResolutionNumber}
                onChange={(e) => setPosResolutionNumber(e.target.value)}
                placeholder="Ej: 18760000001234"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pos-res-prefix">Prefijo</Label>
              <Input
                id="pos-res-prefix"
                value={posResolutionPrefix}
                onChange={(e) => setPosResolutionPrefix(e.target.value)}
                placeholder="POS"
                maxLength={10}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pos-res-from">Rango autorizado — desde</Label>
              <Input
                id="pos-res-from"
                type="number"
                min={0}
                value={posResolutionFrom}
                onChange={(e) => setPosResolutionFrom(e.target.value)}
                placeholder="1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pos-res-to">Rango autorizado — hasta</Label>
              <Input
                id="pos-res-to"
                type="number"
                min={0}
                value={posResolutionTo}
                onChange={(e) => setPosResolutionTo(e.target.value)}
                placeholder="100000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pos-res-date">Fecha de la resolución</Label>
              <Input
                id="pos-res-date"
                type="date"
                value={posResolutionDate}
                onChange={(e) => setPosResolutionDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pos-res-end-date">Vigencia (hasta)</Label>
              <Input
                id="pos-res-end-date"
                type="date"
                value={posResolutionEndDate}
                onChange={(e) => setPosResolutionEndDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Nota legal ═══ */}
      <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-2 text-xs text-blue-800 dark:text-blue-200 space-y-1">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="space-y-1.5">
              <p className="font-medium">Ten en cuenta (Colombia)</p>
              <p>
                El tiquete POS de papel solo es válido para ventas por debajo de 5 UVT;
                a partir de ese monto —o si el cliente la solicita— debes expedir factura
                electrónica de venta.
              </p>
              <p>
                Un responsable de IVA debe discriminar el impuesto (tarifa y valor). Un
                «No responsable de IVA» no cobra ni discrimina IVA.
              </p>
              <p>
                Conserva la copia digital de tus documentos por 5 años (E.T. art. 632);
                el papel térmico se decolora. Emitir la tirilla sin los requisitos o con
                datos errados expone al negocio a sanciones de la DIAN (E.T. arts. 652,
                652‑1 y 657) y de la SIC.
              </p>
              <p className="text-blue-700/70 dark:text-blue-300/70">
                Esta información es orientativa, no asesoría legal. Consulta a tu contador.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button
        onClick={handleSave}
        disabled={saving || !hasChanges}
        className="w-full gap-2 active:scale-[0.98] transition-all"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar configuración de la tirilla
      </Button>
    </div>
  )
}
