'use client'

import { CheckCircle2 } from 'lucide-react'
import { formatCOP } from '@/lib/format'
import type { PlanOption } from '@/hooks/api/use-subscription'

// ── Plan Comparison Table ──
// Reusable table that renders active plans side-by-side with feature comparison.
// Used in both OWNER and non-OWNER subscription views.

const FEATURE_ROWS = [
  { key: 'electronicInvoicing', label: 'Facturación Electrónica' },
  { key: 'multiStore', label: 'Multi-Tienda' },
  { key: 'reports', label: 'Reportes Avanzados' },
  { key: 'advancedInventory', label: 'Inventario Avanzado' },
  { key: 'api', label: 'Acceso API' },
  { key: 'customBranding', label: 'Branding Personalizado' },
  { key: 'multiCurrency', label: 'Multi-Moneda' },
] as const

export interface PlanComparisonTableProps {
  plans: PlanOption[]
  currentPlanName?: string
  onSelectPlan?: (plan: PlanOption) => void
  selectedPlanId?: number | null
}

export function PlanComparisonTable({
  plans,
  currentPlanName,
}: PlanComparisonTableProps) {
  const activePlans = plans.filter(p => p.isActive)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-4 font-semibold text-muted-foreground">Funcionalidad</th>
            {activePlans.map(plan => (
              <th key={plan.id} className={`text-center py-2 px-3 font-bold ${currentPlanName === plan.name ? 'text-primary' : ''}`}>
                {plan.name}
                {currentPlanName === plan.name && (
                  <div className="text-[10px] font-normal text-primary/70 mt-0.5">Plan Actual</div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Price row */}
          <tr className="border-b border-border/50">
            <td className="py-2.5 pr-4 text-muted-foreground">Precio/mes</td>
            {activePlans.map(plan => (
              <td key={plan.id} className="text-center py-2.5 px-3 font-mono font-bold">
                {plan.price === 0 ? 'Gratis' : formatCOP(plan.price)}
              </td>
            ))}
          </tr>
          {/* Employees row */}
          <tr className="border-b border-border/50">
            <td className="py-2.5 pr-4 text-muted-foreground">Empleados</td>
            {activePlans.map(plan => (
              <td key={plan.id} className="text-center py-2.5 px-3 font-semibold">
                {plan.maxEmployees === -1 ? '∞' : plan.maxEmployees}
              </td>
            ))}
          </tr>
          {/* Products row */}
          <tr className="border-b border-border/50">
            <td className="py-2.5 pr-4 text-muted-foreground">Productos</td>
            {activePlans.map(plan => (
              <td key={plan.id} className="text-center py-2.5 px-3 font-semibold">
                {plan.maxProducts === -1 ? '∞' : plan.maxProducts}
              </td>
            ))}
          </tr>
          {/* Feature rows */}
          {FEATURE_ROWS.map(feature => (
            <tr key={feature.key} className="border-b border-border/50 last:border-0">
              <td className="py-2.5 pr-4 text-muted-foreground">{feature.label}</td>
              {activePlans.map(plan => (
                <td key={plan.id} className="text-center py-2.5 px-3">
                  {plan.features[feature.key] ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mx-auto" />
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
