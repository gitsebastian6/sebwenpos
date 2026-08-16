'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { MessageCircle, Zap, KeyRound, Phone, Eye, EyeOff, CheckCircle2, Info, CreditCard, Shield, Globe, TriangleAlert, RefreshCw, Wrench } from 'lucide-react'
import { useSystemConfig, useUpdateSystemConfig, useCheckExpired, useSeedMissingSubscriptions } from '@/hooks/api/use-super-admin'

export function ConfigView() {
  const { data: configData, isLoading: configLoading } = useSystemConfig()
  const updateConfig = useUpdateSystemConfig()
  const [showApiKey, setShowApiKey] = useState(false)
  const [mbConfig, setMbConfig] = useState({ apiKey: '', phoneNumber: '', enabled: false, testMode: false, template: 'Tu código de verificación para Viva POS es: {{code}}. Válido por 5 minutos. No lo compartas con nadie.' })
  const [wpConfig, setWpConfig] = useState({ demoVisible: false, enabled: false })
  const checkExpired = useCheckExpired()
  const seedMissing = useSeedMissingSubscriptions()

  function handleCheckExpired() {
    checkExpired.mutate(undefined, {
      onSuccess: (data: any) => toast.success(data?.message || `Verificación completada — ${data?.transitions?.length ?? 0} suscripción(es) actualizada(s)`),
      onError: (err) => toast.error(err.message || 'Error al verificar suscripciones'),
    })
  }

  function handleSeedMissing() {
    seedMissing.mutate(undefined, {
      onSuccess: (data: any) => toast.success(data?.message || `${data?.assigned ?? 0} suscripción(es) asignada(s)`),
      onError: (err) => toast.error(err.message || 'Error al reparar suscripciones'),
    })
  }

  // Initialize form from query data
  useEffect(() => {
    if (configData?.messagebird) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync form state from query data
      setMbConfig({
        apiKey: configData.messagebird.apiKey || '',
        phoneNumber: configData.messagebird.phoneNumber || '',
        enabled: configData.messagebird.enabled || false,
        testMode: configData.messagebird.testMode || false,
        template: configData.messagebird.template || 'Tu código de verificación para Viva POS es: {{code}}. Válido por 5 minutos. No lo compartas con nadie.',
      })
    }
    if (configData?.wompi) {
      setWpConfig({
        demoVisible: configData.wompi.demoVisible || false,
        enabled: configData.wompi.enabled || false,
      })
    }
  }, [configData])

  function handleSaveConfig() {
    updateConfig.mutate(
      { messagebird: mbConfig, wompi: wpConfig },
      {
        onSuccess: (data: any) => toast.success(data?.message || 'Configuración guardada exitosamente'),
        onError: (err) => toast.error(err.message || 'Error de conexión'),
      },
    )
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto w-full">
      {/* ── MessageBird — WhatsApp OTP ── */}
      <Card className="rounded-xl border-border/50">
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
              <Button onClick={handleSaveConfig} disabled={updateConfig.isPending} className="gap-2">
                {updateConfig.isPending ? (
                  <><div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Guardando...</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4" />Guardar Cambios</>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Wompi — Pagos Online ── */}
      <Card className="rounded-xl border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-violet-100 dark:bg-violet-500/15 rounded-lg flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                Wompi — Pagos Online
              </CardTitle>
              <CardDescription>Pasarela de pagos en línea para suscripciones y renovaciones</CardDescription>
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
              {/* Toggle: Wompi Demo visible for customers */}
              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 bg-orange-100 dark:bg-orange-500/15 rounded-lg flex items-center justify-center">
                    <Globe className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Habilitar Wompi Demo para clientes</p>
                    <p className="text-xs text-muted-foreground">
                      {wpConfig.demoVisible
                        ? 'Los clientes verán los botones de pago demo Wompi.'
                        : 'Los clientes verán el mensaje "Próximamente disponible" en lugar de pagos demo.'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={wpConfig.demoVisible}
                  onCheckedChange={(checked) => setWpConfig(prev => ({ ...prev, demoVisible: checked }))}
                  className="data-[state=checked]:bg-orange-500"
                />
              </div>

              {/* Security warning when demo is enabled */}
              {wpConfig.demoVisible && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/[0.05] p-3">
                  <p className="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>Precaución: Los clientes podrán realizar pagos de demostración gratuitos. Desactiva cuando no necesites pruebas.</span>
                  </p>
                </div>
              )}

              {/* Toggle: Wompi Production enabled */}
              <div className="flex items-center justify-between p-4 rounded-lg border border-violet-500/20 bg-violet-500/[0.04]">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 bg-violet-100 dark:bg-violet-500/15 rounded-lg flex items-center justify-center">
                    <Shield className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Activar Wompi (Producción)</p>
                    <p className="text-xs text-muted-foreground">
                      {wpConfig.enabled
                        ? 'Pasarela de pagos real Wompi activa para los clientes.'
                        : 'Los clientes verán el mensaje "Próximamente disponible" en pagos.'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={wpConfig.enabled}
                  onCheckedChange={(checked) => setWpConfig(prev => ({ ...prev, enabled: checked }))}
                  className="data-[state=checked]:bg-violet-500"
                />
              </div>

              {/* Info notice when production is enabled */}
              {wpConfig.enabled && (
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.05] p-3">
                  <p className="text-xs text-blue-600 dark:text-blue-400 flex items-start gap-1.5">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>Requiere configuración previa de llaves API en el servidor.</span>
                  </p>
                </div>
              )}

              <Separator className="my-2" />

              {/* Upcoming info banner */}
              <div className="rounded-lg border border-dashed border-muted-foreground/25 bg-muted/20 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-muted-foreground">Próximamente — Pagos en línea</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Estamos integrando pagos automatizados con Wompi y Stripe. Esta sección estará disponible cuando la pasarela de pagos esté configurada completamente.
                </p>
                <div className="flex gap-2 pt-1">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300">
                    Wompi
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                    Stripe
                  </span>
                </div>
              </div>

              <Separator className="my-2" />

              {/* Save */}
              <Button onClick={handleSaveConfig} disabled={updateConfig.isPending} className="gap-2">
                {updateConfig.isPending ? (
                  <><div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />Guardando...</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4" />Guardar Cambios</>
                )}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Mantenimiento de Suscripciones ── */}
      <Card className="rounded-xl border-border/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-sky-100 dark:bg-sky-500/15 rounded-lg flex items-center justify-center">
              <Wrench className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                Mantenimiento de Suscripciones
              </CardTitle>
              <CardDescription>Estas tareas corren automáticamente por cron — usa estos botones solo para forzar una verificación manual</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div>
              <p className="text-sm font-medium">Revisar suscripciones vencidas</p>
              <p className="text-xs text-muted-foreground">Transiciona TRIAL/ACTIVE → PAST_DUE → EXPIRED según fecha de vencimiento y período de gracia</p>
            </div>
            <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={handleCheckExpired} disabled={checkExpired.isPending}>
              {checkExpired.isPending ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Verificar Ahora
            </Button>
          </div>
          <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
            <div>
              <p className="text-sm font-medium">Reparar suscripciones faltantes</p>
              <p className="text-xs text-muted-foreground">Asigna un plan Trial a cualquier tienda que no tenga suscripción (por ejemplo, tras una migración)</p>
            </div>
            <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={handleSeedMissing} disabled={seedMissing.isPending}>
              {seedMissing.isPending ? <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Reparar Ahora
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
