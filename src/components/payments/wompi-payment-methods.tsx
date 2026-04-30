'use client'

import {
  CreditCard,
  Smartphone,
  Building2,
  Building,
  Banknote,
  Shield,
  Lock,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

// ── Wompi Payment Methods ──
// Reusable components to display accepted Wompi payment methods
// as visually polished badges/pills with brand-colored icons.

// ── Types ──

interface PaymentMethod {
  id: string
  label: string
  Icon: LucideIcon
  /** Tailwind bg color classes (light + dark) */
  bgColor: string
  /** Tailwind text color for the icon */
  iconColor: string
  /** Tailwind ring/border color for dark mode emphasis */
  ringColor: string
}

// ── Payment methods data ──

const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'visa',
    label: 'Visa',
    Icon: CreditCard,
    bgColor: 'bg-blue-100 dark:bg-blue-500/15',
    iconColor: 'text-blue-700 dark:text-blue-400',
    ringColor: 'ring-blue-200 dark:ring-blue-500/30',
  },
  {
    id: 'mastercard',
    label: 'Mastercard',
    Icon: CreditCard,
    bgColor: 'bg-orange-100 dark:bg-orange-500/15',
    iconColor: 'text-orange-700 dark:text-orange-400',
    ringColor: 'ring-orange-200 dark:ring-orange-500/30',
  },
  {
    id: 'nequi',
    label: 'Nequi',
    Icon: Smartphone,
    bgColor: 'bg-[#f3e5f5] dark:bg-[#8B26AA]/15',
    iconColor: 'text-[#8B26AA] dark:text-[#c47fdb]',
    ringColor: 'ring-[#8B26AA]/30 dark:ring-[#8B26AA]/40',
  },
  {
    id: 'daviplata',
    label: 'Daviplata',
    Icon: Smartphone,
    bgColor: 'bg-red-50 dark:bg-[#E30613]/15',
    iconColor: 'text-[#E30613] dark:text-red-400',
    ringColor: 'ring-red-200 dark:ring-[#E30613]/30',
  },
  {
    id: 'pse',
    label: 'PSE',
    Icon: Building2,
    bgColor: 'bg-blue-50 dark:bg-[#004691]/15',
    iconColor: 'text-[#004691] dark:text-blue-400',
    ringColor: 'ring-blue-200 dark:ring-[#004691]/30',
  },
  {
    id: 'bancolombia',
    label: 'Bancolombia',
    Icon: Building,
    bgColor: 'bg-yellow-50 dark:bg-[#003B71]/15',
    iconColor: 'text-[#003B71] dark:text-yellow-400',
    ringColor: 'ring-yellow-200 dark:ring-[#003B71]/30',
  },
  {
    id: 'efectivo',
    label: 'Efectivo',
    Icon: Banknote,
    bgColor: 'bg-emerald-50 dark:bg-emerald-500/15',
    iconColor: 'text-emerald-700 dark:text-emerald-400',
    ringColor: 'ring-emerald-200 dark:ring-emerald-500/30',
  },
]

// ── Individual badge ──

function PaymentMethodBadge({ method }: { method: PaymentMethod }) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${method.bgColor} ring-1 ${method.ringColor} transition-all duration-150 hover:scale-105 hover:shadow-sm`}
      title={method.label}
    >
      <method.Icon className={`h-3.5 w-3.5 ${method.iconColor}`} />
      <span className="text-[11px] font-semibold leading-none text-foreground/80 dark:text-foreground/70 whitespace-nowrap">
        {method.label}
      </span>
    </div>
  )
}

// ── Exported Components ──

/**
 * `WompiPaymentMethodsGrid`
 * Horizontal row of payment method badges.
 * Shows all accepted Wompi payment methods as colored pills.
 *
 * Usage:
 * ```tsx
 * <WompiPaymentMethodsGrid />
 * ```
 */
export function WompiPaymentMethodsGrid() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PAYMENT_METHODS.map((method) => (
        <PaymentMethodBadge key={method.id} method={method} />
      ))}
    </div>
  )
}

/**
 * `WompiPoweredBy`
 * Small footer indicating the payment is securely processed by Wompi.
 * Shows a lock icon with descriptive text.
 *
 * Usage:
 * ```tsx
 * <WompiPoweredBy />
 * ```
 */
export function WompiPoweredBy() {
  return (
    <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
      <Lock className="h-3.5 w-3.5 text-emerald-500" />
      <span className="text-[11px] font-medium">
        Pago seguro procesado por{' '}
        <span className="font-bold text-foreground/70 dark:text-foreground/60">
          Wompi
        </span>
      </span>
    </div>
  )
}

/**
 * `WompiSecurityBadge`
 * Security badge showing SSL encryption and data protection indicators.
 * Displays a shield icon alongside security-related text.
 *
 * Usage:
 * ```tsx
 * <WompiSecurityBadge />
 * ```
 */
export function WompiSecurityBadge() {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1.5">
      <Shield className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
      <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        Encriptaci&oacute;n SSL &middot; Protecci&oacute;n de datos
      </span>
    </div>
  )
}
