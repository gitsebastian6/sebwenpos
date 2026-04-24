'use client'

import { AlertTriangle, RotateCcw, SlidersHorizontal } from 'lucide-react'
import type { ActionType } from './inventory-types'

interface InventoryActionCardsProps {
  onAction: (type: ActionType) => void
}

export function InventoryActionCards({ onAction }: InventoryActionCardsProps) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-1">Acciones de Inventario</h2>
      <p className="text-sm text-muted-foreground mb-4">
        ¿Qué necesitas hacer? Selecciona una opción:
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {/* LOSS CARD */}
        <button
          onClick={() => onAction('loss')}
          className="group relative flex flex-col items-center gap-3 rounded-xl border-2 active:scale-[0.98] transition-all border-red-200 bg-red-50 p-6 text-center transition-all hover:border-red-400 hover:bg-red-100/70 dark:border-red-900/60 dark:bg-red-950/30 dark:hover:border-red-700 dark:hover:bg-red-950/50"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/60 transition-transform group-hover:scale-110">
            <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <p className="font-semibold text-red-700 dark:text-red-300">Registrar Pérdida</p>
            <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-1">
              Vencido, dañado, robo, derrame...
            </p>
          </div>
          <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
            Haz clic aquí
            <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
          </span>
        </button>

        {/* RETURN CARD */}
        <button
          onClick={() => onAction('return')}
          className="group relative flex flex-col items-center gap-3 rounded-xl border-2 active:scale-[0.98] transition-all border-sky-200 bg-sky-50 p-6 text-center transition-all hover:border-sky-400 hover:bg-sky-100/70 dark:border-sky-900/60 dark:bg-sky-950/30 dark:hover:border-sky-700 dark:hover:bg-sky-950/50"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/60 transition-transform group-hover:scale-110">
            <RotateCcw className="h-7 w-7 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <p className="font-semibold text-sky-700 dark:text-sky-300">Registrar Devolución</p>
            <p className="text-xs text-sky-600/70 dark:text-sky-400/70 mt-1">
              Devoluciones de clientes o proveedores
            </p>
          </div>
          <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-sky-600 dark:text-sky-400">
            Haz clic aquí
            <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
          </span>
        </button>

        {/* ADJUST CARD */}
        <button
          onClick={() => onAction('adjust')}
          className="group relative flex flex-col items-center gap-3 rounded-xl border-2 active:scale-[0.98] transition-all border-amber-200 bg-amber-50 p-6 text-center transition-all hover:border-amber-400 hover:bg-amber-100/70 dark:border-amber-900/60 dark:bg-amber-950/30 dark:hover:border-amber-700 dark:hover:bg-amber-950/50"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/60 transition-transform group-hover:scale-110">
            <SlidersHorizontal className="h-7 w-7 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="font-semibold text-amber-700 dark:text-amber-300">Ajustar Inventario</p>
            <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-1">
              Corregir stock, conteo físico...
            </p>
          </div>
          <span className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
            Haz clic aquí
            <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
          </span>
        </button>
      </div>
    </div>
  )
}
