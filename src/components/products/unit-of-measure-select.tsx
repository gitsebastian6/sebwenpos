'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UNIT_OF_MEASURE_OPTIONS } from '@/lib/constants'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'

interface UnitOfMeasureSelectProps {
  value: string
  onChange: (value: string) => void
  id?: string
  size?: 'default' | 'sm'
  className?: string
}

/**
 * Searchable unit-of-measure picker — the flat catalog (~50 codes) is too
 * long to scan visually, so this lets you type "caja" or "botella" instead
 * of scrolling. Kept as a select-style trigger (not a free-text input) so
 * the value is always one of the controlled catalog codes.
 */
export function UnitOfMeasureSelect({ value, onChange, id, size = 'default', className }: UnitOfMeasureSelectProps) {
  const [open, setOpen] = useState(false)
  const selected = UNIT_OF_MEASURE_OPTIONS.find((u) => u.value === value)
  const listId = `${id || 'unit-select'}-list`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          className={cn(
            'border-input data-[placeholder]:text-muted-foreground flex w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50',
            size === 'sm' ? 'h-8' : 'h-9',
            className,
          )}
        >
          <span className="truncate">
            {selected ? `${selected.label} (${selected.value})` : <span className="text-muted-foreground">Selecciona unidad...</span>}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0 flex flex-col overflow-hidden max-h-[min(20rem,var(--radix-popover-content-available-height))]"
        align="start"
      >
        <Command className="flex flex-col overflow-hidden">
          <CommandInput placeholder="Buscar unidad (ej: caja, botella, kg)..." className="h-9" />
          <CommandList id={listId} className="flex-1 min-h-0 max-h-none">
            <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">Sin resultados</CommandEmpty>
            <CommandGroup>
              {UNIT_OF_MEASURE_OPTIONS.map((u) => (
                <CommandItem
                  key={u.value}
                  value={`${u.label} ${u.value}`}
                  onSelect={() => { onChange(u.value); setOpen(false) }}
                  className="cursor-pointer"
                >
                  <Check className={cn('mr-2 size-4 shrink-0', value === u.value ? 'opacity-100' : 'opacity-0')} />
                  {u.label} <span className="ml-1 text-xs text-muted-foreground">({u.value})</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
