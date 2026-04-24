'use client'

import {
  ArrowDownToLine,
  ArrowUpDown,
  RotateCcw,
  AlertTriangle,
  TrendingDown,
} from 'lucide-react'

// ─── Interfaces ──────────────────────────────────────────────

export interface Product {
  id: number
  name: string
  sku: string | null
  currentStock: number
  minStock: number
  salePrice: number
  costPrice: number
  category: { id: number; name: string } | null
}

export interface InventoryMovement {
  id: number
  productId: number
  productName: string
  quantity: number
  movementType: string
  notes: string | null
  createdAt: string
}

export interface LowStockAlert {
  id: number
  name: string
  currentStock: number
  minStock: number
  salePrice: number
  category: string | null
}

// ─── Types ───────────────────────────────────────────────────

export type ActionType = 'loss' | 'return' | 'adjust'

// ─── Constants ───────────────────────────────────────────────

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  PURCHASE: 'Compra',
  SALE: 'Venta',
  ADJUSTMENT: 'Ajuste',
  RETURN: 'Devolución',
  LOSS: 'Pérdida',
}

export const MOVEMENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  PURCHASE: <ArrowDownToLine className="h-3.5 w-3.5" />,
  SALE: <TrendingDown className="h-3.5 w-3.5" />,
  ADJUSTMENT: <ArrowUpDown className="h-3.5 w-3.5" />,
  RETURN: <RotateCcw className="h-3.5 w-3.5" />,
  LOSS: <AlertTriangle className="h-3.5 w-3.5" />,
}

export const LOSS_REASONS = [
  { value: 'VENCIDO', label: 'Producto vencido' },
  { value: 'DANADO', label: 'Producto dañado' },
  { value: 'ROBO', label: 'Robo o hurto' },
  { value: 'DERRAME', label: 'Derrame o rotura' },
  { value: 'INVENTARIO', label: 'Diferencia de inventario' },
  { value: 'OTRO', label: 'Otro motivo' },
]
