'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { MessageCircle, Zap, KeyRound, Phone, Eye, EyeOff, CheckCircle2, Info } from 'lucide-react'

export function ConfigView() {
  const [configLoading, setConfigLoading] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [mbConfig, setMbConfig] = useState({ apiKey: '', phoneNumber: '', enabled: false, testMode: false, template: 'Tu código de verificación para Ventify POS es: {{code}}. Válido por 5 minutos. No lo compartas con nadie.' })

  const loadConfig = useCallback(async () => {
    setConfigLoading(true)
    try {
      const res = await fetch('/api/super-admin/system-config')
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al cargar configuración'); return }
      setMbConfig({
        apiKey: data.messagebird?.apiKey || '',
        phoneNumber: data.messagebird?.phoneNumber || '',
        enabled: data.messagebird?.enabled || false,
        testMode: data.messagebird?.testMode || false,
        template: data.messagebird?.template || 'Tu código de verificación para Ventify POS es: {{code}}. Válido por 5 minutos. No lo compartas con nadie.',
      })
    } catch { toast.error('Error de conexión') }
    finally { setConfigLoading(false) }
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  async function handleSaveConfig() {
    setConfigSaving(true)
    try {
      const res = await fetch('/api/super-admin/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messagebird: mbConfig }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'Error al guardar'); return }
      toast.success(data.message || 'Configuración guardada exitosamente')
    } catch { toast.error('Error de conexión') }
    finally { setConfigSaving(false) }
  }

  return (
    <Card className="rounded-xl border-border/50 max-w-2xl mx-auto w-full">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-emerald-100 dark:bg-emerald-500/15 rounded-lg flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              MessageBird — WhatsApp OTP
            </CardTitle>
            <CardDescription>Envío de códigos de verificación por WhatsApp para recuperación de contraseña</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {configLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Enable/disable */}
            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
              <div>
                <p className="text-sm font-medium">Habilitar WhatsApp OTP</p>
                <p className="text-xs text-muted-foreground">Permitir a los usuarios recibir códigos por WhatsApp</p>
              </div>
              <Switch checked={mbConfig.enabled} onCheckedChange={(checked) => setMbConfig(prev => ({ ...prev, enabled: checked }))} />
            </div>

            {/* Test Mode toggle */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-amber-500/20 bg-amber-500/[0.04]">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 bg-amber-100 dark:bg-amber-500/15 rounded-lg flex items-center justify-center">
                  <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">Modo Pruebas (Test)</p>
                  <p className="text-xs text-muted-foreground">Genera códigos sin enviar WhatsApp. El código se muestra en pantalla.</p>
                </div>
              </div>
              <Switch
                checked={mbConfig.testMode}
                onCheckedChange={(checked) => setMbConfig(prev => ({ ...prev, testMode: checked }))}
                className="data-[state=checked]:bg-amber-500"
              />
            </div>

            {/* Show test mode notice */}
            {mbConfig.testMode && (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
                <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  Modo pruebas activo — No se requiere API Key ni número de WhatsApp. Los códigos se mostrarán directamente en la pantalla de recuperación.
                </p>
              </div>
            )}

            <Separator className="my-2" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Credenciales de Mensajería</p>

            {/* API Key — hidden in test mode */}
            {!mbConfig.testMode && (
              <>
                <div className="space-y-2">
                  <Label>API Key (Access Key)</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      type={showApiKey ? 'text' : 'password'}
                      placeholder="MensajeBird Access Key"
                      className="pl-10 pr-10"
                      value={mbConfig.apiKey}
                      onChange={(e) => setMbConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                    />
                    <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-3 top-3 text-muted-foreground hover:text-foreground" aria-label="Mostrar u ocultar clave API">
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <Label>Número de WhatsApp Business</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input type="tel" placeholder="573001234567" className="pl-10" value={mbConfig.phoneNumber} onChange={(e) => setMbConfig(prev => ({ ...prev, phoneNumber: e.target.value }))} />
                  </div>
                  <p className="text-xs text-muted-foreground">Incluir código de país sin + (ej: 573001234567)</p>
                </div>

                {/* Template */}
                <div className="space-y-2">
                  <Label>Plantilla del mensaje</Label>
                  <Textarea rows={3} placeholder="Tu código de verificación..." value={mbConfig.template} onChange={(e) => setMbConfig(prev => ({ ...prev, template: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">Usa {'{'}{'{'}code{'}'}{'}'} como placeholder para el código OTP de 6 dígitos</p>
                </div>

                {/* Info */}
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-4">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                    <div className="text-xs text-amber-600 dark:text-amber-400 space-y-1">
                      <p className="font-medium">Requisitos para WhatsApp OTP:</p>
                      <ol className="list-decimal list-inside space-y-0.5 text-amber-500/80">
                        <li>Cuenta activa en <a href="https://messagebird.com" target="_blank" rel="noopener noreferrer" className="underline">messagebird.com</a></li>
                        <li>WhatsApp Business aprobado por Meta</li>
                        <li>API Access Key con permisos de Conversations API</li>
                        <li>Plantilla de mensaje aprobada (si se requiere)</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </>
            )}

            <Separator className="my-2" />

            {/* Save */}
            <Button onClick={handleSaveConfig} disabled={configSaving} className="gap-2">
              {configSaving ? (
                <><div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Guardando...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4" />Guardar Cambios</>
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
