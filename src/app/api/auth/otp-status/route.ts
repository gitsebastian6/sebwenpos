import { NextResponse } from 'next/server'
import { isWhatsAppOTPEnabled } from '@/lib/messagebird'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const enabled = await isWhatsAppOTPEnabled()
    return NextResponse.json({ enabled })
  } catch {
    return NextResponse.json({ enabled: false })
  }
}
