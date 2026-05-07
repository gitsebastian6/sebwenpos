'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Crown, Lock, ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { PLAN_FEATURES } from '@/lib/subscription-helpers'

interface UpgradePromptProps {
  feature: string
  planName?: string
  className?: string
  compact?: boolean
}

/**
 * Reusable component to show when a feature is blocked by plan.
 * Displays the feature name, current plan, and an upgrade CTA.
 */
export function UpgradePrompt({ feature, planName, className, compact = false }: UpgradePromptProps) {
  const subscription = useAuthStore((s) => s.subscription)
  const currentPlan = planName || subscription?.planName || 'Tu plan'
  const router = useRouter()

  const goToSettings = () => router.push('/settings')

  if (compact) {
    return (
      <div className={`flex items-center gap-3 p-3 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/10 ${className || ''}`}>
        <Lock className="h-4 w-4 text-amber-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            {feature} no disponible en el plan {currentPlan}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700">
          <Crown className="h-2.5 w-2.5 mr-1" />
          Upgrade
        </Badge>
      </div>
    )
  }

  return (
    <Card className={`border-amber-200 dark:border-amber-800/50 ${className || ''}`}>
      <CardContent className="py-6">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center shrink-0">
            <Lock className="h-6 w-6 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-amber-700 dark:text-amber-300">
              Funcionalidad no disponible
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              <strong>{feature}</strong> no está incluida en tu plan actual ({currentPlan}).
              Actualiza tu plan para acceder a esta funcionalidad.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Button size="sm" className="gap-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white" onClick={goToSettings}>
                <Crown className="h-3.5 w-3.5" />
                Actualizar Plan
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={goToSettings}>
                Ver Planes
                <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Shows all features that are NOT available in the current plan.
 * Useful in settings to show what the user is missing.
 */
export function MissingFeaturesList({ className }: { className?: string }) {
  const subscription = useAuthStore((s) => s.subscription)
  const features = subscription?.planLimits?.features as Record<string, boolean> | undefined

  if (!features) return null

  const missing = Object.entries(PLAN_FEATURES)
    .filter(([key]) => key !== 'support' && key !== 'priority' && !features[key])
    .map(([key, label]) => ({ key, label }))

  if (missing.length === 0) return null

  return (
    <div className={`space-y-2 ${className || ''}`}>
      <p className="text-xs font-semibold text-muted-foreground">Funcionalidades no incluidas en tu plan:</p>
      {missing.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          {label}
        </div>
      ))}
    </div>
  )
}
