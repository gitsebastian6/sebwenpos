import { NextResponse } from 'next/server'
import { isWompiConfigured } from '@/lib/wompi/client'

export const dynamic = 'force-dynamic'

// GET /api/payments/wompi/health
// Returns Wompi configuration status.
// Public — no auth required (used by client to check if Wompi is available).
export async function GET() {
  const { configured, missingKeys } = isWompiConfigured()
  const env = process.env.WOMPI_ENV || 'sandbox'

  return NextResponse.json({
    configured,
    env,
    missingKeys,
  })
}
