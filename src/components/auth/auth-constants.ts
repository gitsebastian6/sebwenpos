import {
  Sparkles, TrendingUp, Crown, ShoppingCart, Package, Receipt, BarChart3,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export const SUPPORT_PHONE = '3012695457'
export const SUPPORT_WHATSAPP = `https://wa.me/57${SUPPORT_PHONE}?text=Hola%2C%20necesito%20informaci%C3%B3n%20sobre%20Ventify%20POS`

export interface PlanInfo {
  name: string
  price: string
  period: string
  description: string
  features: string[]
  highlight: boolean
  icon: LucideIcon
  color: string
  border: string
  bgIcon: string
}

export const PLANS: PlanInfo[] = [
  {
    name: 'Trial',
    price: 'Gratis',
    period: '7 días',
    description: 'Evalúa el sistema completo sin compromiso',
    features: ['Hasta 50 productos', 'Hasta 3 empleados', 'Punto de venta', 'Inventario básico'],
    highlight: false,
    icon: Sparkles,
    color: 'text-amber-400',
    border: 'border-amber-500/20',
    bgIcon: 'bg-amber-500/10',
  },
  {
    name: 'Pro',
    price: '$89.900',
    period: '/mes',
    description: 'Para negocios en crecimiento',
    features: ['Hasta 500 productos', 'Hasta 15 empleados', 'Facturación electrónica DIAN', 'Reportes avanzados', 'Soporte por email'],
    highlight: false,
    icon: TrendingUp,
    color: 'text-emerald-400',
    border: 'border-emerald-500/20',
    bgIcon: 'bg-emerald-500/10',
  },
  {
    name: 'Empresarial',
    price: '$249.000',
    period: '/mes',
    description: 'Solución completa multi-tienda',
    features: ['Hasta 10 sucursales', 'Productos ilimitados', 'Multi-tienda', 'API personalizada', 'Soporte dedicado'],
    highlight: true,
    icon: Crown,
    color: 'text-purple-400',
    border: 'border-purple-500/30',
    bgIcon: 'bg-purple-500/10',
  },
]

export const FEATURES_HIGHLIGHTS = [
  { icon: ShoppingCart, label: 'Punto de Venta', desc: 'Rápido e intuitivo' },
  { icon: Package, label: 'Inventario', desc: 'Control total' },
  { icon: Receipt, label: 'Facturación', desc: 'Electrónica DIAN' },
  { icon: BarChart3, label: 'Reportes', desc: 'En tiempo real' },
]

export interface BlockedInfo {
  subscriptionStatus: string
  planName?: string
  endDate?: string
}
