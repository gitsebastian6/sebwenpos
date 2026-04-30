'use client'

import { Check } from 'lucide-react'

// ── Wompi Checkout Step Indicator ──
// Reusable step indicator for the Wompi checkout flow.
// Shows a horizontal progression through: Resumen → Pago → Confirmación

// ── Exported Types ──

export type WompiCheckoutStep =
  | 'summary'
  | 'pending'
  | 'approved'
  | 'declined'
  | 'error'

// ── Internal Types ──

interface WompiStepIndicatorProps {
  currentStep: WompiCheckoutStep
}

interface StepConfig {
  id: number
  label: string
}

// ── Step definitions ──

const STEPS: StepConfig[] = [
  { id: 1, label: 'Resumen' },
  { id: 2, label: 'Pago' },
  { id: 3, label: 'Confirmación' },
]

/**
 * Maps the WompiCheckoutStep to the visual step index (1-based).
 * - summary → step 1 (current)
 * - pending → step 2 (current)
 * - approved → step 3 (completed)
 * - declined → step 3 (failed)
 * - error → step 3 (failed)
 */
function getStepStates(currentStep: WompiCheckoutStep): {
  currentStepIndex: number
  isFailed: boolean
} {
  switch (currentStep) {
    case 'summary':
      return { currentStepIndex: 1, isFailed: false }
    case 'pending':
      return { currentStepIndex: 2, isFailed: false }
    case 'approved':
      return { currentStepIndex: 3, isFailed: false }
    case 'declined':
    case 'error':
      return { currentStepIndex: 3, isFailed: true }
  }
}

/**
 * Determines the visual state of an individual step circle.
 * Returns 'completed', 'current', 'future', or 'failed'.
 */
function getStepCircleState(
  stepId: number,
  currentStepIndex: number,
  isFailed: boolean,
): 'completed' | 'current' | 'future' | 'failed' {
  if (isFailed && stepId === 3) return 'failed'
  if (stepId < currentStepIndex) return 'completed'
  if (stepId === currentStepIndex) return 'current'
  return 'future'
}

/**
 * Determines the visual state of a connector line between two steps.
 * Returns 'completed', 'active', or 'inactive'.
 */
function getConnectorState(
  fromStepId: number,
  currentStepIndex: number,
  isFailed: boolean,
): 'completed' | 'active' | 'inactive' {
  if (fromStepId >= currentStepIndex) return 'inactive'
  if (fromStepId + 1 === currentStepIndex && !isFailed) return 'active'
  return 'completed'
}

// ── Step Circle Component ──

function StepCircle({
  step,
  state,
}: {
  step: StepConfig
  state: 'completed' | 'current' | 'future' | 'failed'
}) {
  const sizeClasses = 'h-7 w-7 sm:h-8 sm:w-8'
  const textClasses = 'text-xs sm:text-sm font-bold'

  switch (state) {
    case 'completed':
      return (
        <div
          className={`${sizeClasses} rounded-full bg-emerald-500 flex items-center justify-center ring-2 ring-emerald-500/30 transition-all duration-300`}
        >
          <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" strokeWidth={3} />
        </div>
      )
    case 'current':
      return (
        <div
          className={`${sizeClasses} rounded-full bg-primary flex items-center justify-center ring-2 ring-primary/30 shadow-sm transition-all duration-300`}
        >
          <span className={`${textClasses} text-primary-foreground`}>{step.id}</span>
        </div>
      )
    case 'failed':
      return (
        <div
          className={`${sizeClasses} rounded-full bg-red-500 flex items-center justify-center ring-2 ring-red-500/30 transition-all duration-300`}
        >
          <span className={`${textClasses} text-white`}>{step.id}</span>
        </div>
      )
    case 'future':
      return (
        <div
          className={`${sizeClasses} rounded-full border-2 border-muted-foreground/30 dark:border-muted-foreground/20 flex items-center justify-center bg-background transition-all duration-300`}
        >
          <span className={`${textClasses} text-muted-foreground/50 dark:text-muted-foreground/40`}>
            {step.id}
          </span>
        </div>
      )
  }
}

// ── Connector Line Component ──

function ConnectorLine({ state }: { state: 'completed' | 'active' | 'inactive' }) {
  const baseClasses = 'h-0.5 flex-1 rounded-full transition-all duration-500'

  switch (state) {
    case 'completed':
      return (
        <div
          className={`${baseClasses} bg-emerald-500`}
        />
      )
    case 'active':
      return (
        <div
          className={`${baseClasses} bg-gradient-to-r from-emerald-500 to-primary/40`}
        />
      )
    case 'inactive':
      return (
        <div
          className={`${baseClasses} bg-muted-foreground/20 dark:bg-muted-foreground/10`}
        />
      )
  }
}

// ── Step Label Component ──

function StepLabel({
  step,
  state,
}: {
  step: StepConfig
  state: 'completed' | 'current' | 'future' | 'failed'
}) {
  let textClass = 'text-muted-foreground/50 dark:text-muted-foreground/40'
  if (state === 'completed') textClass = 'text-emerald-600 dark:text-emerald-400'
  else if (state === 'current') textClass = 'text-foreground font-semibold'
  else if (state === 'failed') textClass = 'text-red-600 dark:text-red-400 font-semibold'

  return (
    <span className={`text-[10px] sm:text-xs mt-1.5 whitespace-nowrap ${textClass} transition-colors duration-300`}>
      {step.label}
    </span>
  )
}

// ── Main Exported Component ──

/**
 * `WompiStepIndicator`
 * Step indicator for the Wompi checkout flow.
 * Shows 3 steps: Resumen → Pago → Confirmación
 * with visual states for completed, current, future, and failed.
 *
 * Usage:
 * ```tsx
 * <WompiStepIndicator currentStep="pending" />
 * ```
 */
export function WompiStepIndicator({ currentStep }: WompiStepIndicatorProps) {
  const { currentStepIndex, isFailed } = getStepStates(currentStep)

  return (
    <div className="flex items-start w-full max-w-xs sm:max-w-sm mx-auto">
      {STEPS.map((step, index) => {
        const circleState = getStepCircleState(step.id, currentStepIndex, isFailed)
        const isLast = index === STEPS.length - 1

        return (
          <div key={step.id} className="flex items-start flex-1 last:flex-none">
            {/* Step circle + label */}
            <div className="flex flex-col items-center">
              <StepCircle step={step} state={circleState} />
              <StepLabel step={step} state={circleState} />
            </div>

            {/* Connector line (not after last step) */}
            {!isLast && (
              <div className="flex items-center mt-[14px] sm:mt-4 mx-1.5 sm:mx-2 min-w-[24px] sm:min-w-[40px]">
                <ConnectorLine
                  state={getConnectorState(step.id, currentStepIndex, isFailed)}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
