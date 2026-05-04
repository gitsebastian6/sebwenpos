import { NextResponse } from 'next/server'
import { isWompiConfigured, isWompiDemoMode, getDemoApprovalDelay } from '@/lib/wompi/client'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/payments/wompi/health
// Returns Wompi configuration status.
// Public — no auth required (used by client to check if Wompi is available).
export async function GET() {
  const { configured, missingKeys, mode } = isWompiConfigured()
  const demoMode = isWompiDemoMode()

  // Check super admin settings for demo visibility
  let demoVisible = false
  let wompiEnabled = false
  try {
    const [demoVisibleSetting, wompiEnabledSetting] = await Promise.all([
      db.systemSetting.findUnique({ where: { key: 'wompi_demo_visible' } }),
      db.systemSetting.findUnique({ where: { key: 'wompi_enabled' } }),
    ])
    demoVisible = demoVisibleSetting?.value === 'true'
    wompiEnabled = wompiEnabledSetting?.value === 'true'
  } catch {
    // Default to false if DB is not available
  }

  return NextResponse.json({
    configured,
    mode,                             // "demo" | "sandbox" | "production"
    demoMode,                         // boolean convenience flag
    demoVisible,                      // super admin toggle — whether customers can see demo
    wompiEnabled,                     // super admin toggle — whether real Wompi is active
    missingKeys,
    ...(demoMode && {
      demoInfo: {
        approvalDelaySeconds: getDemoApprovalDelay(),
        description: 'Modo Demo — los pagos se auto-aprueban después de ' + getDemoApprovalDelay() + ' segundos. No se conecta a Wompi real.',
      },
    }),
  })
}
