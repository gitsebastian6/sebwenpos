import { NextResponse } from 'next/server'
import { isWompiConfigured, isWompiDemoMode, getDemoApprovalDelay } from '@/lib/wompi/client'

export const dynamic = 'force-dynamic'

// GET /api/payments/wompi/health
// Returns Wompi configuration status.
// Public — no auth required (used by client to check if Wompi is available).
export async function GET() {
  const { configured, missingKeys, mode } = isWompiConfigured()
  const demoMode = isWompiDemoMode()

  return NextResponse.json({
    configured,
    mode,                             // "demo" | "sandbox" | "production"
    demoMode,                         // boolean convenience flag
    missingKeys,
    ...(demoMode && {
      demoInfo: {
        approvalDelaySeconds: getDemoApprovalDelay(),
        description: 'Modo Demo — los pagos se auto-aprueban después de ' + getDemoApprovalDelay() + ' segundos. No se conecta a Wompi real.',
      },
    }),
  })
}
