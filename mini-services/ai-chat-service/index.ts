// ---------------------------------------------------------------------------
// VivaPOS — AI Chat Mini-Service (GLM via z-ai-web-dev-sdk)
// ---------------------------------------------------------------------------
// Standalone Bun service on port 3004 that calls GLM API via the SDK.
// Runs outside Next.js so the SDK works without crashes.
// ---------------------------------------------------------------------------

import ZAI from 'z-ai-web-dev-sdk'

const PORT = 3004

// Initialize SDK once
let zaiInstance: any = null

async function getZai() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
    console.log('[AI Service] SDK initialized')
  }
  return zaiInstance
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

async function callGlmApi(messages: ChatMessage[]): Promise<{
  content: string
  tokens: number
  model: string
}> {
  const startTime = Date.now()

  try {
    const zai = await getZai()

    const completion = await zai.chat.completions.create({
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      thinking: { type: 'disabled' },
      stream: false,
    })

    const latencyMs = Date.now() - startTime
    const reply = completion.choices?.[0]?.message?.content || ''
    const tokens = completion.usage?.total_tokens || Math.ceil(reply.length / 4)
    const model = completion.model || 'glm-4-flash'

    console.log(`[AI Service] ${latencyMs}ms, ~${tokens} tokens, model: ${model}`)

    return { content: reply, tokens, model }
  } catch (error: any) {
    const latencyMs = Date.now() - startTime
    console.error(`[AI Service] Error after ${latencyMs}ms:`, error?.message || error)
    return { content: '', tokens: 0, model: 'error' }
  }
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      })
    }

    if (req.method === 'GET' && new URL(req.url).pathname === '/health') {
      return Response.json({ status: 'ok', sdkReady: !!zaiInstance })
    }

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 })
    }

    try {
      const body = await req.json()
      const { messages } = body as { messages: ChatMessage[] }

      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return Response.json({ error: 'messages array required' }, { status: 400 })
      }

      const result = await callGlmApi(messages)

      return Response.json({
        success: true,
        content: result.content,
        tokens: result.tokens,
        model: result.model,
      })
    } catch (error: any) {
      console.error('[AI Service] Handler error:', error)
      return Response.json(
        { success: false, error: error?.message || 'Internal error' },
        { status: 500 }
      )
    }
  },
})

console.log(`[AI Service] Running on port ${PORT} (using z-ai-web-dev-sdk)`)
