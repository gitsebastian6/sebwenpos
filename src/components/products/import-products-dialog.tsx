'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  Loader2,
  Tag,
  Truck,
  Info,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ImportResult {
  success: boolean
  imported: number
  created: string[]
  skipped: { row: number; name: string; reason: string }[]
  totalInFile: number
  createdCategories?: string[]
  createdProviders?: string[]
  subscription?: {
    planName: string | null
    planLimit: number | null
    currentCount: number
    newTotal: number
    remainingSlots: number | null
    limitReached: boolean
  }
}

interface ImportProductsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImport: (file: File) => Promise<ImportResult | null>
  importing: boolean
  subscriptionLoading?: boolean
  maxProducts?: number | null
  planName?: string | null
  currentProductCount?: number
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ImportProductsDialog({
  open,
  onOpenChange,
  onImport,
  importing,
  subscriptionLoading = false,
  maxProducts = null,
  planName = null,
  currentProductCount = 0,
}: ImportProductsDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function handleImport() {
    if (!file) return
    const data = await onImport(file)
    setResult(data)
  }

  function handleClose() {
    onOpenChange(false)
    // Reset state after dialog animation finishes
    setTimeout(() => {
      setFile(null)
      setResult(null)
    }, 200)
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose()
    }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Productos desde Excel
          </DialogTitle>
          <DialogDescription>
            Carga un archivo Excel (.xlsx/.xls) o CSV con tus productos para crearlos en lote.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-5 py-2">
            {/* Subscription Limit Info */}
            {!subscriptionLoading && maxProducts !== null && (
              <div className={`rounded-lg border p-3 flex items-start gap-3 ${
                currentProductCount >= maxProducts
                  ? 'border-red-500/30 bg-red-500/[0.06]'
                  : currentProductCount >= maxProducts * 0.8
                    ? 'border-amber-500/30 bg-amber-500/[0.06]'
                    : 'border-sky-500/20 bg-sky-500/[0.04]'
              }`}>
                <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                  currentProductCount >= maxProducts
                    ? 'bg-red-500/15'
                    : currentProductCount >= maxProducts * 0.8
                      ? 'bg-amber-500/15'
                      : 'bg-sky-500/15'
                }`}>
                  <Info className={`h-4 w-4 ${
                    currentProductCount >= maxProducts
                      ? 'text-red-400'
                      : currentProductCount >= maxProducts * 0.8
                        ? 'text-amber-400'
                        : 'text-sky-400'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${
                    currentProductCount >= maxProducts
                      ? 'text-red-400'
                      : currentProductCount >= maxProducts * 0.8
                        ? 'text-amber-400'
                        : 'text-sky-400'
                  }`}>
                    {currentProductCount >= maxProducts
                      ? `Límite del plan alcanzado`
                      : `Límite de productos — Plan ${planName || ''}`
                    }
                  </p>
                  {currentProductCount >= maxProducts ? (
                    <p className="text-[11px] text-red-300/60 mt-0.5">
                      Tu plan permite máximo {maxProducts} productos y ya tienes {currentProductCount}. No se pueden importar más productos. Actualiza tu plan para agregar más.
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                      Tu plan ({planName}) permite hasta <strong>{maxProducts}</strong> productos. Actualmente tienes <strong>{currentProductCount}</strong>. Puedes importar hasta <strong>{maxProducts - currentProductCount}</strong> productos más. Los que excedan este límite serán omitidos automáticamente.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Instructions */}
            <Card className="border-dashed">
              <CardContent className="p-4 space-y-3">
                <h4 className="font-semibold text-sm">Formato del Excel</h4>
                <p className="text-xs text-muted-foreground">
                  La primera fila debe contener los nombres de las columnas (encabezados). Las columnas se mapean automáticamente:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div className="bg-muted/50 rounded-md p-2">
                    <span className="font-medium text-emerald-600">Obligatoria:</span>
                    <p className="font-mono mt-0.5">Nombre</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2">
                    <span className="font-medium text-emerald-600">Obligatoria:</span>
                    <p className="font-mono mt-0.5">Precio Venta</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2">
                    <span className="font-medium text-muted-foreground">Opcional:</span>
                    <p className="font-mono mt-0.5">SKU</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2">
                    <span className="font-medium text-muted-foreground">Opcional:</span>
                    <p className="font-mono mt-0.5">Categoría</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2">
                    <span className="font-medium text-muted-foreground">Opcional:</span>
                    <p className="font-mono mt-0.5">Proveedor</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2">
                    <span className="font-medium text-muted-foreground">Opcional:</span>
                    <p className="font-mono mt-0.5">Impuesto</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2">
                    <span className="font-medium text-muted-foreground">Opcional:</span>
                    <p className="font-mono mt-0.5">INVIMA</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2">
                    <span className="font-medium text-muted-foreground">Opcional:</span>
                    <p className="font-mono mt-0.5">Precio Compra</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2">
                    <span className="font-medium text-muted-foreground">Opcional:</span>
                    <p className="font-mono mt-0.5">Comisión</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2">
                    <span className="font-medium text-muted-foreground">Opcional:</span>
                    <p className="font-mono mt-0.5">Stock</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2">
                    <span className="font-medium text-muted-foreground">Opcional:</span>
                    <p className="font-mono mt-0.5">Stock Mínimo</p>
                  </div>
                  <div className="bg-muted/50 rounded-md p-2">
                    <span className="font-medium text-muted-foreground">Opcional:</span>
                    <p className="font-mono mt-0.5">Activo (Sí/No)</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-md p-2">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <ul className="space-y-1 list-disc ml-1">
                    <li>La columna <strong>Categoría</strong>, <strong>Proveedor</strong> e <strong>Impuesto</strong> se resuelven por nombre (deben existir previamente)</li>
                    <li>Los precios van en pesos colombianos (sin símbolo $, solo el número)</li>
                    <li>Máximo 1,000 productos por archivo, tamaño máximo 5MB</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* File Drop Zone */}
            <div className="space-y-2">
              <Label>Archivo Excel o CSV</Label>
              <div
                className={`
                  relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8
                  transition-colors cursor-pointer hover:bg-muted/50
                  ${file ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-muted-foreground/25'}
                `}
                onClick={() => document.getElementById('import-file-input')?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const droppedFile = e.dataTransfer.files[0]
                  if (droppedFile) setFile(droppedFile)
                }}
              >
                <input
                  id="import-file-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0]
                    if (selectedFile) setFile(selectedFile)
                  }}
                />
                {file ? (
                  <>
                    <FileSpreadsheet className="h-10 w-10 text-emerald-600 mb-2" />
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(file.size / 1024).toFixed(1)} KB — Click para cambiar
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Arrastra un archivo aquí o <span className="text-primary font-medium underline">haz click para seleccionar</span>
                    </p>
                    <p className="text-xs text-muted-foreground/60 mt-1">.xlsx, .xls o .csv — máx. 5MB</p>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Results */
          <div className="space-y-4 py-2">
            {/* Subscription Info Banner */}
            {result.subscription && (
              <div className={`rounded-lg border p-3 flex items-start gap-3 ${
                result.subscription.limitReached
                  ? 'border-amber-500/30 bg-amber-500/[0.06]'
                  : 'border-sky-500/20 bg-sky-500/[0.04]'
              }`}>
                <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                  result.subscription.limitReached
                    ? 'bg-amber-500/15'
                    : 'bg-sky-500/15'
                }`}>
                  <Info className={`h-4 w-4 ${
                    result.subscription.limitReached
                      ? 'text-amber-400'
                      : 'text-sky-400'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${
                    result.subscription.limitReached
                      ? 'text-amber-400'
                      : 'text-sky-400'
                  }`}>
                    {result.subscription.limitReached
                      ? `Límite del plan alcanzado (${result.subscription.planName})`
                      : `Capacidad del plan — ${result.subscription.planName}`
                    }
                  </p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                    {result.subscription.limitReached
                      ? <>
                          Tu plan permite máximo <strong>{result.subscription.planLimit}</strong> productos.
                          Tenías {result.subscription.currentCount}, se importaron {result.imported} y ahora tienes <strong>{result.subscription.newTotal}/{result.subscription.planLimit}</strong>.
                          Algunos productos del archivo fueron omitidos por alcanzar el límite.
                          {result.skipped.some(s => s.reason.includes('Límite del plan')) && (
                            <span className="text-amber-500"> Los productos restantes fueron omitidos por límite del plan.</span>
                          )}
                        </>
                      : <>
                          Tu plan ({result.subscription.planName}) permite hasta <strong>{result.subscription.planLimit}</strong> productos.
                          Tenías {result.subscription.currentCount}, se importaron {result.imported} y ahora tienes <strong>{result.subscription.newTotal}</strong>.
                          Quedan <strong>{result.subscription.remainingSlots}</strong> cupos disponibles.
                        </>
                    }
                  </p>
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-2xl font-bold">{result.totalInFile}</p>
                <p className="text-xs text-muted-foreground">En archivo</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{result.imported}</p>
                <p className="text-xs text-muted-foreground">Importados</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{result.skipped.length}</p>
                <p className="text-xs text-muted-foreground">Omitidos</p>
              </div>
            </div>

            {/* Skipped details */}
            {result.skipped.length > 0 && (
              <div className="max-h-48 overflow-y-auto">
                <p className="text-sm font-medium mb-2">Productos omitidos:</p>
                <div className="space-y-1">
                  {result.skipped.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs bg-muted/50 rounded-md p-2">
                      <Badge variant="outline" className="shrink-0 font-mono">Fila {s.row}</Badge>
                      <span className="truncate font-medium">{s.name}</span>
                      <span className="text-muted-foreground truncate">{s.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.imported > 0 && (
              <div className="text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 rounded-md p-3">
                Se importaron {result.imported} producto{result.imported !== 1 ? 's' : ''} exitosamente.
                {result.subscription && (
                  <span className="text-xs block mt-1 text-muted-foreground">
                    Total en el sistema: {result.subscription.newTotal}{result.subscription.planLimit ? `/${result.subscription.planLimit}` : ''} productos
                    {result.subscription.limitReached && ' — Límite alcanzado'}
                  </span>
                )}
              </div>
            )}

            {(result.createdCategories && result.createdCategories.length > 0) && (
              <div className="text-sm bg-sky-50 dark:bg-sky-950/20 rounded-md p-3">
                <p className="font-medium text-sky-700 dark:text-sky-400 mb-1">
                  <Tag className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                  {result.createdCategories.length} categoría{result.createdCategories.length !== 1 ? 's' : ''} creada{result.createdCategories.length !== 1 ? 's' : ''}
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {result.createdCategories.map(cat => (
                    <Badge key={cat} variant="secondary" className="text-xs bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800">{cat}</Badge>
                  ))}
                </div>
              </div>
            )}

            {(result.createdProviders && result.createdProviders.length > 0) && (
              <div className="text-sm bg-violet-50 dark:bg-violet-950/20 rounded-md p-3">
                <p className="font-medium text-violet-700 dark:text-violet-400 mb-1">
                  <Truck className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                  {result.createdProviders.length} proveedor{result.createdProviders.length !== 1 ? 'es' : ''} creado{result.createdProviders.length !== 1 ? 's' : ''}
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {result.createdProviders.map(prov => (
                    <Badge key={prov} variant="secondary" className="text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800">{prov}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={handleClose}>
              Cerrar
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={importing}>
                Cancelar
              </Button>
              <Button onClick={handleImport} disabled={!file || importing || (maxProducts !== null && currentProductCount >= maxProducts)}>
                {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {importing ? 'Importando...' : (maxProducts !== null && currentProductCount >= maxProducts) ? 'Límite alcanzado' : `Importar ${file ? file.name : ''}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
