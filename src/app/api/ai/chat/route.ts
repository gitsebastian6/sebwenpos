import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  return NextResponse.json({
    success: true,
    message: '¡Hola! Soy Ventify, tu asistente virtual. ¿En qué puedo ayudarte?',
    sessionId: 'test-session',
    usage: { remaining: 95000, messageCount: 1 }
  })
}
