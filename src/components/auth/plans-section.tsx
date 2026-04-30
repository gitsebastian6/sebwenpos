'use client'

import { useQuery } from '@tanstack/react-query'
import { Separator } from '@/components/ui/separator'
import {
  Check, Shield, Headphones, Star, Phone, MessageCircle, ArrowRight, Gift,
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

        {/* ── Section Header ── */}
        <div className="text-center mb-2">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-zinc-100 via-zinc-300 to-zinc-100 bg-clip-text text-transparent">
            Planes y Precios
          </h2>
          <p className="text-sm text-zinc-500 mt-1.5">
            Elige el plan que mejor se adapte a tu negocio
          </p>
        </div>

        {/* ── Plan Cards ── */}
        <div className="flex flex-col gap-4">
          {displayPlans.map((plan) => {
            const IconComp = plan.icon
            const isTrial = plan.price === 'Gratis'

            return (
              <div
                key={plan.name}
                className={`relative overflow-hidden rounded-2xl border transition-all duration-300 hover:shadow-xl hover:shadow-black/25 ${
                  plan.highlight
                    ? `${plan.border} bg-gradient-to-br from-emerald-500/[0.06] via-purple-500/[0.04] to-transparent ring-1 ring-emerald-500/30 shadow-lg shadow-emerald-500/[0.05]`
                    : 'border-zinc-800/60 bg-zinc-900/50 hover:border-zinc-700/80'
                }`}
              >
                {/* "Más Popular" ribbon */}
                {plan.highlight && (
                  <div className="absolute top-0 right-0 z-10">
                    <div className="bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-bl-xl rounded-tr-2xl">
                      ⭐ Más Popular
                    </div>
                  </div>
                )}

                {/* Top gradient band */}
                <div className={`h-1.5 w-full ${
                  plan.highlight
                    ? 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-purple-500'
                    : isTrial
                      ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                      : 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                }`} />

                <div className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Plan Icon — large circle with gradient bg */}
                    <div className="shrink-0">
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center border ${
                        plan.highlight
                          ? 'bg-gradient-to-br from-emerald-500/15 to-purple-500/15 border-emerald-500/20'
                          : isTrial
                            ? 'bg-gradient-to-br from-amber-500/15 to-amber-400/10 border-amber-500/20'
                            : 'bg-gradient-to-br from-emerald-500/15 to-emerald-400/10 border-emerald-500/20'
                      }`}>
                        {isTrial ? (
                          <Check className="h-6 w-6 text-emerald-400" />
                        ) : (
                          <IconComp className={`h-6 w-6 ${plan.color}`} />
                        )}
                      </div>
                    </div>

                    {/* Plan Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-base text-zinc-100 tracking-tight">
                        {plan.name}
                        {isTrial && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                            <Check className="h-3.5 w-3.5" />
                            Gratis
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-zinc-500 mt-0.5 mb-3">{plan.description}</p>

                      {/* Features list with green checkmarks */}
                      <div className="space-y-1.5">
                        {plan.features.map((feature) => (
                          <div key={feature} className="flex items-center gap-2">
                            <div className="h-4 w-4 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                              <Check className={`h-2.5 w-2.5 ${plan.highlight ? 'text-emerald-400' : 'text-emerald-500'}`} />
                            </div>
                            <span className="text-xs text-zinc-400">{feature}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Price — large and prominent */}
                    <div className="text-right shrink-0 pl-4">
                      <p className={`text-3xl font-extrabold tracking-tight leading-none ${
                        isTrial ? 'text-emerald-400' : 'text-zinc-50'
                      }`}>
                        {isTrial ? 'Gratis' : plan.price}
                      </p>
                      <p className="text-xs text-zinc-500 font-medium mt-1">{plan.period}</p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Trust Badges ── */}
        <div className="flex items-center justify-center gap-3 pt-2">
          {[
            {
              icon: Shield,
              label: 'SSL/TLS',
              sub: 'Datos seguros',
              bgLight: 'bg-emerald-50',
              bgDark: 'dark:bg-emerald-500/10',
              borderLight: 'border-emerald-200/60',
              borderDark: 'dark:border-emerald-500/20',
              iconColor: 'text-emerald-600 dark:text-emerald-400',
            },
            {
              icon: Headphones,
              label: 'Soporte 24/7',
              sub: 'WhatsApp directo',
              bgLight: 'bg-sky-50',
              bgDark: 'dark:bg-sky-500/10',
              borderLight: 'border-sky-200/60',
              borderDark: 'dark:border-sky-500/20',
              iconColor: 'text-sky-600 dark:text-sky-400',
            },
            {
              icon: Star,
              label: 'Hecho en Colombia',
              sub: '🇨🇴',
              bgLight: 'bg-amber-50',
              bgDark: 'dark:bg-amber-500/10',
              borderLight: 'border-amber-200/60',
              borderDark: 'dark:border-amber-500/20',
              iconColor: 'text-amber-600 dark:text-amber-400',
            },
            {
              icon: Gift,
              label: '7 días de prueba',
              sub: 'Totalmente gratis',
              bgLight: 'bg-violet-50',
              bgDark: 'dark:bg-violet-500/10',
              borderLight: 'border-violet-200/60',
              borderDark: 'dark:border-violet-500/20',
              iconColor: 'text-violet-600 dark:text-violet-400',
            },
          ].map((badge) => (
            <div
              key={badge.label}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs
                ${badge.bgLight} ${badge.bgDark} ${badge.borderLight} ${badge.borderDark}
                bg-zinc-900/60`}
            >
              <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 bg-white/60 dark:bg-white/5 border border-black/5 dark:border-white/10`}>
                <badge.icon className={`h-3.5 w-3.5 ${badge.iconColor}`} />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-zinc-700 dark:text-zinc-300 leading-tight">{badge.label}</span>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-600 leading-tight">{badge.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── CTA Button ── */}
        <div className="text-center pt-1">
          <a
            href={SUPPORT_WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 h-14 rounded-xl px-10 font-bold text-white text-sm
              bg-gradient-to-r from-emerald-500 to-emerald-600
              shadow-lg shadow-emerald-600/25
              hover:shadow-xl hover:shadow-emerald-600/35 hover:scale-[1.02]
              active:scale-[0.98]
              transition-all duration-200"
          >
            <MessageCircle className="h-5 w-5" />
            Contratar por WhatsApp
            <ArrowRight className="h-4 w-4" />
          </a>
          <p className="text-xs text-zinc-600 dark:text-zinc-500 mt-3">
            <Phone className="h-3 w-3 inline mr-1" />
            O llámanos al{' '}
            <a
              href={`tel:+57${SUPPORT_PHONE}`}
              className="font-semibold text-zinc-400 dark:text-zinc-400 hover:text-emerald-400 transition-colors underline-offset-2 hover:underline"
            >
              {SUPPORT_PHONE}
            </a>
          </p>
        </div>
      </div>

      {/* ─── Mobile: Plans Section (below login) ─── */}
      <section className="lg:hidden px-4 pb-8">
        <Separator className="bg-zinc-800/60 mb-8" />
        <div className="max-w-md mx-auto">
          {/* Mobile Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 rounded-full px-3.5 py-1.5 text-xs font-bold mb-3 border border-emerald-500/20">
              <Star className="h-3.5 w-3.5" />
              Planes desde $0
            </div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-zinc-100 to-zinc-300 bg-clip-text text-transparent">
              Planes y Precios
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
              Elige el plan que mejor se adapte a tu negocio
            </p>
          </div>

          {/* Mobile Plan Cards */}
          <div className="flex flex-col gap-3">
            {displayPlans.map((plan) => {
              const IconComp = plan.icon
              const isTrial = plan.price === 'Gratis'

              return (
                <div
                  key={plan.name}
                  className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${
                    plan.highlight
                      ? `${plan.border} bg-gradient-to-br from-emerald-500/[0.06] via-purple-500/[0.04] to-transparent ring-1 ring-emerald-500/30`
                      : 'border-zinc-800/60 bg-zinc-900/50'
                  }`}
                >
                  {/* Mobile "Más Popular" ribbon */}
                  {plan.highlight && (
                    <div className="absolute top-0 right-0 z-10">
                      <div className="bg-emerald-500 text-white text-[9px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-bl-lg rounded-tr-2xl">
                        ⭐ Popular
                      </div>
                    </div>
                  )}

                  {/* Top gradient band */}
                  <div className={`h-1 w-full ${
                    plan.highlight
                      ? 'bg-gradient-to-r from-emerald-500 to-purple-500'
                      : isTrial
                        ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                        : 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                  }`} />

                  <div className="p-4">
                    {/* Row: Icon + Name + Price */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center border shrink-0 ${
                        plan.highlight
                          ? 'bg-gradient-to-br from-emerald-500/15 to-purple-500/15 border-emerald-500/20'
                          : isTrial
                            ? 'bg-gradient-to-br from-amber-500/15 to-amber-400/10 border-amber-500/20'
                            : 'bg-gradient-to-br from-emerald-500/15 to-emerald-400/10 border-emerald-500/20'
                      }`}>
                        {isTrial ? (
                          <Check className="h-5 w-5 text-emerald-400" />
                        ) : (
                          <IconComp className={`h-5 w-5 ${plan.color}`} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-sm text-zinc-100">
                          {plan.name}
                          {isTrial && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] font-semibold text-emerald-400">
                              <Check className="h-3 w-3" />
                              Gratis
                            </span>
                          )}
                        </h3>
                        <p className="text-[11px] text-zinc-500 mt-0.5">{plan.description}</p>
                      </div>
                    </div>

                    {/* Large Price */}
                    <div className="flex items-baseline gap-1.5 mb-3 pl-0.5">
                      <span className={`text-2xl font-extrabold tracking-tight leading-none ${
                        isTrial ? 'text-emerald-400' : 'text-zinc-50'
                      }`}>
                        {isTrial ? 'Gratis' : plan.price}
                      </span>
                      <span className="text-xs text-zinc-500 font-medium">{plan.period}</span>
                    </div>

                    {/* Features as compact 2-column grid */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      {plan.features.map((f) => (
                        <div key={f} className="flex items-center gap-1.5">
                          <div className="h-3.5 w-3.5 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                            <Check className={`h-2 w-2 ${plan.highlight ? 'text-emerald-400' : 'text-emerald-500'}`} />
                          </div>
                          <span className="text-[11px] text-zinc-400 leading-tight">{f}</span>
                        </div>
                      ))}
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
              className="inline-flex items-center gap-2.5 h-12 rounded-xl px-8 font-bold text-white text-sm
                bg-gradient-to-r from-emerald-500 to-emerald-600
                shadow-lg shadow-emerald-600/25
                hover:shadow-xl hover:shadow-emerald-600/35 hover:scale-[1.02]
                active:scale-[0.98]
                transition-all duration-200"
            >
              <MessageCircle className="h-4.5 w-4.5" />
              Contratar por WhatsApp
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
            <p className="text-xs text-zinc-600 dark:text-zinc-500 mt-2.5">
              <Phone className="h-3 w-3 inline mr-1" />
              O llámanos al{' '}
              <a
                href={`tel:+57${SUPPORT_PHONE}`}
                className="font-semibold text-zinc-400 hover:text-emerald-400 transition-colors"
              >
                {SUPPORT_PHONE}
              </a>
            </p>
          </div>

          {/* Mobile Trust Badges */}
          <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
            {[
              { icon: Shield, label: 'SSL/TLS', color: 'text-emerald-500/80' },
              { icon: Headphones, label: 'Soporte 24/7', color: 'text-sky-500/80' },
              { icon: Star, label: 'Colombia 🇨🇴', color: 'text-amber-500/80' },
              { icon: Gift, label: '7 días gratis', color: 'text-violet-500/80' },
            ].map((badge) => (
              <div
                key={badge.label}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-800/60 bg-zinc-900/60 text-[11px] text-zinc-400"
              >
                <badge.icon className={`h-3.5 w-3.5 shrink-0 ${badge.color}`} />
                <span>{badge.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
