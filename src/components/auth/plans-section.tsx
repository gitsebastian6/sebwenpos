'use client'

import { useQuery } from '@tanstack/react-query'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Check, Shield, Headphones, Star, Phone, MessageCircle, ArrowRight,
} from 'lucide-react'
import { PLANS, SUPPORT_PHONE, SUPPORT_WHATSAPP, type PlanInfo } from './auth-constants'
import { formatCOP } from '@/lib/format'

// ── API response shape ──────────────────────────────────────────────
interface ApiPlan {
  id: string
  name: string
  description: string
  price: number
  maxEmployees: number
  maxProducts: number
  features: Record<string, unknown>
  isActive: boolean
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Convert the API `features` object into a flat string[] for display.
 * Maps known feature keys to Spanish labels; uses key name for unknown ones.
 */
const FEATURE_LABELS: Record<string, string> = {
  electronicInvoicing: 'Facturación Electrónica',
  multiStore: 'Multi-Tienda',
  reports: 'Reportes Avanzados',
  advancedInventory: 'Inventario Avanzado',
  api: 'Acceso API',
  customBranding: 'Branding Personalizado',
  multiCurrency: 'Multi-Moneda',
  priority: 'Soporte Prioritario',
}

function extractFeatures(features: Record<string, unknown>): string[] {
  return Object.entries(features).flatMap(([key, value]) => {
    if (typeof value === 'boolean' && value) return [FEATURE_LABELS[key] || key]
    if (typeof value === 'string' && value !== 'none') return [FEATURE_LABELS[value] || value]
    return []
  })
}

/**
 * Merge a single API plan with the matching static plan so we preserve
 * icon, colour classes, highlight flag, etc.  Falls back to a neutral
 * style when the API plan has no static counterpart.
 */
function mapApiPlan(apiPlan: ApiPlan): PlanInfo | null {
  const isTrial = apiPlan.name.toLowerCase() === 'trial'

  const displayPrice = isTrial ? 'Gratis' : formatCOP(apiPlan.price)
  const displayPeriod = isTrial ? '7 días' : '/mes'

  const description =
    apiPlan.description.length > 60
      ? `${apiPlan.description.slice(0, 57)}...`
      : apiPlan.description

  // Match by name (case-insensitive) to pull icon / colour / border etc.
  const staticPlan = PLANS.find(
    (p) => p.name.toLowerCase() === apiPlan.name.toLowerCase(),
  )

  if (staticPlan) {
    return {
      ...staticPlan,
      price: displayPrice,
      period: displayPeriod,
      description,
      // Keep static plan's human-readable features (Spanish labels)
      // Only use DB features as fallback for custom/unknown plans
      features: staticPlan.features,
    }
  }

  // No matching static plan – use neutral styling as last resort
  return {
    name: apiPlan.name,
    price: displayPrice,
    period: displayPeriod,
    description,
    features: extractFeatures(apiPlan.features),
    highlight: false,
    icon: Star,
    color: 'text-zinc-400',
    border: 'border-zinc-700/50',
    bgIcon: 'bg-zinc-500/10',
  }
}

// ── Component ───────────────────────────────────────────────────────

export function PlansSection() {
  const { data: apiPlans } = useQuery<ApiPlan[]>({
    queryKey: ['public-plans'],
    queryFn: () => fetch('/api/subscription/plans').then((r) => r.json()),
  })

  // Use API data when available; fall back to hardcoded PLANS while loading.
  const displayPlans: PlanInfo[] = apiPlans
    ? apiPlans
        .filter((p) => p.isActive)
        .map(mapApiPlan)
        .filter((p): p is PlanInfo => p !== null)
    : PLANS

  return (
    <>
      {/* ═══ Desktop Plans (right column) ═══ */}
      <div className="hidden lg:flex flex-col gap-6">

        {/* Plan Cards */}
        <div className="flex flex-col gap-4">
          {displayPlans.map((plan) => {
            const IconComp = plan.icon
            return (
              <div
                key={plan.name}
                className={`relative overflow-hidden rounded-xl border transition-all duration-200 hover:shadow-lg hover:shadow-black/20 ${
                  plan.highlight
                    ? `${plan.border} bg-gradient-to-r from-emerald-500/[0.04] to-purple-500/[0.04] shadow-md ring-1 ring-emerald-500/20`
                    : 'border-zinc-800/60 bg-zinc-900/40 hover:border-zinc-700'
                }`}
              >
                {plan.highlight && (
                  <div className="absolute top-0 right-0">
                    <Badge className="rounded-none rounded-bl-xl rounded-tr-xl text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border-emerald-500/30">⭐ Más Popular</Badge>
                  </div>
                )}
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Plan Icon */}
                    <div className={`h-11 w-11 ${plan.bgIcon} rounded-xl flex items-center justify-center shrink-0 border ${plan.border}`}>
                      <IconComp className={`h-5 w-5 ${plan.color}`} />
                    </div>

                    {/* Plan Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-base text-zinc-100">{plan.name}</h3>
                      </div>
                      <p className="text-xs text-zinc-500 mb-3">{plan.description}</p>

                      {/* Features */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {plan.features.map((feature) => (
                          <div key={feature} className="flex items-center gap-1.5">
                            <Check className={`h-3.5 w-3.5 shrink-0 ${plan.highlight ? 'text-emerald-400' : 'text-emerald-500/70'}`} />
                            <span className="text-xs text-zinc-500">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Price */}
                    <div className="text-right shrink-0">
                      <p className="text-xl font-extrabold text-zinc-100">{plan.price}</p>
                      <p className="text-xs text-zinc-500 font-medium">{plan.period}</p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Trust Badges */}
        <div className="flex items-center justify-center gap-6 pt-2">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <div className="h-8 w-8 bg-emerald-500/10 rounded-lg flex items-center justify-center border border-emerald-500/15">
              <Shield className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <p className="font-semibold text-zinc-300">Datos seguros</p>
              <p className="text-zinc-600">Encriptación SSL</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <div className="h-8 w-8 bg-sky-500/10 rounded-lg flex items-center justify-center border border-sky-500/15">
              <Headphones className="h-4 w-4 text-sky-400" />
            </div>
            <div>
              <p className="font-semibold text-zinc-300">Soporte 24/7</p>
              <p className="text-zinc-600">WhatsApp directo</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <div className="h-8 w-8 bg-amber-500/10 rounded-lg flex items-center justify-center border border-amber-500/15">
              <Star className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <p className="font-semibold text-zinc-300">Hecho en</p>
              <p className="text-zinc-600">Colombia 🇨🇴</p>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <div className="text-center pt-1">
          <a
            href={SUPPORT_WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl px-8 py-3.5 transition-all shadow-lg shadow-emerald-600/20 hover:shadow-xl hover:shadow-emerald-600/30 active:scale-[0.98] text-sm"
          >
            <MessageCircle className="h-4.5 w-4.5" />
            Contratar por WhatsApp
            <ArrowRight className="h-4 w-4" />
          </a>
          <p className="text-xs text-zinc-600 mt-3">
            <Phone className="h-3 w-3 inline mr-1" />
            O llámanos al <span className="font-semibold text-zinc-400">{SUPPORT_PHONE}</span>
          </p>
        </div>
      </div>

      {/* ─── Mobile: Plans Section (below login) ─── */}
      <section className="lg:hidden px-4 pb-8">
        <Separator className="bg-zinc-800/60 mb-8" />
        <div className="max-w-md mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 rounded-full px-3.5 py-1.5 text-xs font-bold mb-3 border border-emerald-500/20">
              <Star className="h-3.5 w-3.5" />
              Planes desde $0
            </div>
            <h2 className="text-xl font-bold text-zinc-100">Elige el plan ideal</h2>
            <p className="text-sm text-zinc-500 mt-1">7 días de prueba gratuita en todos los planes</p>
          </div>

          <div className="flex flex-col gap-3">
            {displayPlans.map((plan) => {
              const IconComp = plan.icon
              return (
                <div
                  key={plan.name}
                  className={`rounded-xl border p-4 transition-all ${
                    plan.highlight
                      ? `${plan.border} bg-gradient-to-r from-emerald-500/[0.04] to-purple-500/[0.04] ring-1 ring-emerald-500/20`
                      : 'border-zinc-800/60 bg-zinc-900/40'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 ${plan.bgIcon} rounded-lg flex items-center justify-center shrink-0 border ${plan.border}`}>
                      <IconComp className={`h-4.5 w-4.5 ${plan.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-sm text-zinc-100">{plan.name}</h3>
                        <div className="text-right">
                          <span className="text-base font-extrabold text-zinc-100">{plan.price}</span>
                          <span className="text-[10px] text-zinc-500 ml-1">{plan.period}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-0.5 mb-2">{plan.description}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {plan.features.map((f) => (
                          <div key={f} className="flex items-center gap-1">
                            <Check className={`h-3 w-3 shrink-0 ${plan.highlight ? 'text-emerald-400' : 'text-emerald-500/70'}`} />
                            <span className="text-[11px] text-zinc-500">{f}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Mobile CTA */}
          <div className="text-center mt-6">
            <a
              href={SUPPORT_WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg px-6 py-3 transition-all shadow-md shadow-emerald-600/20 text-sm"
            >
              <MessageCircle className="h-4 w-4" />
              Contratar por WhatsApp
            </a>
          </div>

          {/* Mobile Trust Badges */}
          <div className="flex items-center justify-center gap-4 mt-5">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <Shield className="h-3.5 w-3.5 text-emerald-500/70" />
              <span>Datos seguros</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <Headphones className="h-3.5 w-3.5 text-sky-500/70" />
              <span>Soporte 24/7</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <Star className="h-3.5 w-3.5 text-amber-500/70" />
              <span>Colombia 🇨🇴</span>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
