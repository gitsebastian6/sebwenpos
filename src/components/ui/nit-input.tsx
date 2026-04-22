'use client'

import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { CheckCircle2, XCircle } from 'lucide-react'
import { DIAN_CONSUMIDOR_FINAL_NIT } from '@/lib/constants'

// ─── DV Algorithm (inline — pure math, no Node.js crypto needed) ──────────

function calculateNITDV(nitDigits: string): number {
  const cleaned = nitDigits.replace(/[^0-9]/g, '')
  if (cleaned.length === 0) return -1
  const weights = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3]
  const n = cleaned.length
  const relevantWeights = weights.slice(-n)
  let sum = 0
  for (let i = 0; i < n; i++) {
    sum += parseInt(cleaned[i], 10) * relevantWeights[i]
  }
  const remainder = sum % 11
  if (remainder === 0 || remainder === 1) return remainder
  return 11 - remainder
}

// ─── Format NIT with dots and dash: "900.123.456-7" ───────────────────────

function formatNITDisplay(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '')
  if (digits.length === 0) return ''

  // Separate main digits and DV (last digit)
  const mainDigits = digits.slice(0, -1)
  const dv = digits[digits.length - 1]

  if (mainDigits.length === 0) return dv

  // Add dots from right to left every 3 digits
  const parts: string[] = []
  let remaining = mainDigits
  while (remaining.length > 3) {
    parts.unshift(remaining.slice(-3))
    remaining = remaining.slice(0, -3)
  }
  if (remaining.length > 0) parts.unshift(remaining)

  return `${parts.join('.')}-${dv}`
}

// ─── Validation result type ───────────────────────────────────────────────

type ValidationResult =
  | { status: 'idle' }          // Too short or empty
  | { status: 'valid' }         // DV matches
  | { status: 'invalid'; expectedDV: number }  // DV doesn't match

function validateNIT(value: string, allowConsumidorFinal: boolean): ValidationResult {
  const digits = value.replace(/[^0-9]/g, '')

  // Need at least 2 digits (main digit + DV) to validate
  if (digits.length < 2) return { status: 'idle' }

  // Consumidor final check
  if (allowConsumidorFinal && digits === DIAN_CONSUMIDOR_FINAL_NIT) return { status: 'valid' }

  const mainDigits = digits.slice(0, -1)
  const actualDV = parseInt(digits[digits.length - 1], 10)
  const expectedDV = calculateNITDV(mainDigits)

  if (expectedDV === actualDV) return { status: 'valid' }
  return { status: 'invalid', expectedDV }
}

// ─── Component Props ──────────────────────────────────────────────────────

interface NITInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
  allowConsumidorFinal?: boolean
}

// ─── NITInput Component ───────────────────────────────────────────────────

export function NITInput({
  value,
  onChange,
  placeholder = '900.123.456-7',
  disabled = false,
  className = '',
  id,
  allowConsumidorFinal = true,
}: NITInputProps) {
  // Format the value for display
  const displayValue = useMemo(() => formatNITDisplay(value), [value])

  // Validate the current value
  const validation = useMemo(
    () => validateNIT(value, allowConsumidorFinal),
    [value, allowConsumidorFinal]
  )

  // Handle user input — store only raw digits
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9]/g, '')
    // Max 15 digits for NIT + DV
    onChange(raw.slice(0, 15))
  }

  // Handle paste — extract only digits
  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '')
    onChange(pasted.slice(0, 15))
  }

  return (
    <div className="space-y-1">
      <Input
        id={id}
        value={displayValue}
        onChange={handleChange}
        onPaste={handlePaste}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={21} // "999.999.999.999-9" = 19 chars max
        className={`h-9 text-sm font-mono tabular-nums focus-visible:ring-primary/20 focus-visible:border-primary/40 ${
          validation.status === 'valid'
            ? 'border-emerald-500/40 focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500/40'
            : validation.status === 'invalid'
              ? 'border-destructive/50 focus-visible:ring-destructive/20 focus-visible:border-destructive/40'
              : ''
        } ${className}`}
      />
      {validation.status === 'valid' && (
        <p className="flex items-center gap-1 text-xs text-emerald-500 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          DV válido
        </p>
      )}
      {validation.status === 'invalid' && (
        <p className="flex items-center gap-1 text-xs text-destructive">
          <XCircle className="h-3 w-3 shrink-0" />
          DV inválido — se espera DV={validation.expectedDV}
        </p>
      )}
    </div>
  )
}

export default NITInput
