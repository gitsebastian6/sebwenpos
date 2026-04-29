// ---------------------------------------------------------------------------
// VentifyPOS — AI Chat Route (GLM Chat Provider)
// ---------------------------------------------------------------------------
// Backend that consumes the GLM API via z-ai-web-dev-sdk with:
// ✅ Context handling (session history from DB)
// ✅ Cost control (daily token budget per user)
// ✅ Error handling (timeouts, API errors, graceful fallbacks)
// ✅ System prompt with VentifyPOS domain knowledge
// ✅ Session management (create, continue, clear)
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/api-auth'
import { AuthUser } from '@/lib/api-auth'

// ─── Constants ──────────────────────────────────────────────────────────────

const DAILY_TOKEN_LIMIT = parseInt(process.env.AI_DAILY_TOKEN_LIMIT || '100000', 10)
const MAX_CONTEXT_MESSAGES = parseInt(process.env.AI_MAX_CONTEXT_MESSAGES || '20', 10)
const MAX_MESSAGE_LENGTH = 2000
const API_TIMEOUT_MS = 30000 // 30s timeout for GLM API calls

// ─── VentifyPOS System Prompt ──────────────────────────────────────────────

const VENTIFY_SYSTEM_PROMPT = `Eres Ventify, el asistente virtual de VentifyPOS — un sistema POS (punto de venta) colombiano con facturación electrónica DIAN.

## Tu Personalidad
- Amigable, profesional y conciso. Hablas en español colombiano.
- Usas "tú" (no "usted") para cercanía.
- Respondes con instrucciones paso a paso cuando enseñas a usar el sistema.
- Si no sabes algo, lo admites honestamente y sugieres contactar soporte.

## Tu Conocimiento — VentifyPOS

### Módulos principales:
1. **POS (Punto de Venta)**: Ventas rápidas con búsqueda de productos, carrito, descuentos, propinas, métodos de pago (efectivo, tarjeta, Wompi, Nequi).
2. **Facturación Electrónica DIAN**: Generación de facturas FE, notas crédito NC, notas débito ND, facturas de contingencia FC. Configuración con resolución DIAN, certificado digital, PTE (Proveedor Tecnológico Electrónico). Modo OFFLINE/ONLINE. CUFE/CUDE para validación.
3. **Inventario**: Productos con IVA (19%, 5%, exento), stock mínimo, movimientos (entradas, salidas, ajustes), kardex, alertas de stock bajo, código de barras.
4. **Compras a Proveedores**: Órdenes de compra, retenciones (fuente, ICA, IVA), términos de pago (contado, crédito 30/60/90), lotes y fechas de vencimiento.
5. **Clientes**: Registro con NIT/cédula, régimen (común, simplificado, gran contribuyente), control de cartera/deudas.
6. **Cotizaciones**: Crear cotizaciones y convertirlas en órdenes/vendas.
7. **Mesas y Comandas**: Gestión de mesas para restaurantes, sesiones, comandas de cocina.
8. **Caja Registradora**: Apertura/cierre de turno, conteo de efectivo, resumen de ventas.
9. **Contabilidad Básica**: Cuentas de libro diario, asientos contables, gastos.
10. **Reportes**: Ventas diarias, informes por período, exportación PDF/Excel.
11. **Suscripciones SaaS**: Planes (Básico, Profesional, Enterprise), trial 14 días, prorrateo, historial de cambios.
12. **Roles y Empleados**: RBAC con permisos granulares, empleados vinculados a tienda.
13. **Pagos Wompi**: Integración con pasarela de pagos colombiana (tarjeta, Nequi, PSE, Daviplata).
14. **Sucursales**: Tiendas principales con sucursales/ramales.

### Impuestos colombianos relevantes:
- IVA: 19% (general), 5% (reducido), 0% (exento)
- Retención en la fuente: según tabla DIAN
- Retención ICA: según tarifa municipal
- Retención IVA: según normativa vigente

### Flujos comunes:
- **Vender**: POS → Buscar producto → Agregar al carrito → Aplicar descuento → Cobrar → (Opcional) Generar factura electrónica
- **Facturar electrónicamente**: Configurar resolución DIAN → Subir certificado .p12 → Configurar PTE → Emitir factura → Enviar a DIAN → Recibir CUFE
- **Comprar**: Crear orden de compra → Recibir mercancía → Actualizar inventario → Registrar pago
- **Abrir caja**: Caja → Abrir turno → (Vender) → Cerrar turno → Contar efectivo

### Datos importantes:
- Moneda: Pesos colombianos (COP), sin decimales
- Documentos: Cédula de ciudadanía, NIT con dígito de verificación
- DIAN: Dirección de Impuestos y Aduanas Nacionales de Colombia
- Resolución de facturación: numeración autorizada por DIAN

## Reglas:
1. NUNCA inventes funcionalidades que no existen en VentifyPOS
2. Si el usuario pregunta por algo que no está en el sistema, dile que no está disponible y sugiere una alternativa
3. Para errores técnicos, sugiere revisar la configuración o contactar soporte
4. Siempre responde en español
5. Sé específico con los pasos — dice en qué sección del menú encontrar cada opción
6. Menciona las consecuencias tributarias cuando sea relevante (ej: "una nota crédito reduce el IVA de ese período")`

// ─── Context-Aware System Prompt Builder ────────────────────────────────────

function buildSystemPrompt(context: {
  currentPage?: string
  subscriptionStatus?: string
  planName?: string
}): string {
  let prompt = VENTIFY_SYSTEM_PROMPT

  // Add page-specific context
  if (context.currentPage && context.currentPage !== 'dashboard') {
    const pageContexts: Record<string, string> = {
      pos: '\n\n## Contexto actual: El usuario está en el Punto de Venta. Enfócate en ventas, carrito, cobro y facturación desde el POS.',
      invoices: '\n\n## Contexto actual: El usuario está en Facturación Electrónica. Enfócate en facturas DIAN, notas crédito/débito, resolución, CUFE.',
      products: '\n\n## Contexto actual: El usuario está en Productos. Enfócate en agregar/editar productos, categorías, precios, stock, IVA.',
      inventory: '\n\n## Contexto actual: El usuario está en Inventario. Enfócate en movimientos de stock, kardex, ajustes, alertas.',
      purchases: '\n\n## Contexto actual: El usuario está en Compras. Enfócate en órdenes de compra, proveedores, retenciones, pagos.',
      providers: '\n\n## Contexto actual: El usuario está en Proveedores. Enfócate en gestión de proveedores, NIT, régimen, términos de pago.',
      customers: '\n\n## Contexto actual: El usuario está en Clientes. Enfócate en gestión de clientes, cartera, deudas, NIT.',
      accounting: '\n\n## Contexto actual: El usuario está en Contabilidad. Enfócate en caja registradora, gastos, libro diario.',
      reports: '\n\n## Contexto actual: El usuario está en Reportes. Enfócate en informes de ventas, exportaciones, análisis.',
      settings: '\n\n## Contexto actual: El usuario está en Configuración. Enfócate en datos del negocio, facturación DIAN, suscripción.',
      employees: '\n\n## Contexto actual: El usuario está en Empleados. Enfócate en gestión de personal, roles, permisos.',
      roles: '\n\n## Contexto actual: El usuario está en Roles. Enfócate en permisos y configuración de roles.',
      tables: '\n\n## Contexto actual: El usuario está en Mesas. Enfócate en gestión de mesas, sesiones, comandas.',
      quotations: '\n\n## Contexto actual: El usuario está en Cotizaciones. Enfócate en crear y convertir cotizaciones.',
      services: '\n\n## Contexto actual: El usuario está en Servicios. Enfócate en catálogo de servicios y transacciones.',
    }
    prompt += pageContexts[context.currentPage] || ''
  }

  // Add subscription context
  if (context.subscriptionStatus) {
    prompt += `\n\n## Estado de suscripción: ${context.subscriptionStatus}. ${context.planName ? `Plan: ${context.planName}.` : ''}`
    if (context.subscriptionStatus === 'TRIAL') {
      prompt += ' El usuario está en período de prueba. Menciona límites del trial cuando sea relevante.'
    } else if (context.subscriptionStatus === 'EXPIRED' || context.subscriptionStatus === 'PAST_DUE') {
      prompt += ' La suscripción está vencida. Algunas funciones pueden estar limitadas. Sugiere renovar.'
    }
  }

  return prompt
}

// ─── Token Budget Checker ───────────────────────────────────────────────────

async function checkTokenBudget(userId: number): Promise<{
  allowed: boolean
  usedToday: number
  remaining: number
}> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const todaySessions = await db.chatSession.findMany({
    where: {
      userId,
      createdAt: { gte: todayStart },
    },
    select: { tokensUsed: true },
  })

  const usedToday = todaySessions.reduce((sum, s) => sum + s.tokensUsed, 0)
  const remaining = Math.max(0, DAILY_TOKEN_LIMIT - usedToday)

  return {
    allowed: usedToday < DAILY_TOKEN_LIMIT,
    usedToday,
    remaining,
  }
}

// ─── GLM API Call with Error Handling ───────────────────────────────────────

interface GlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

async function callGlmApi(messages: GlmMessage[]): Promise<{
  content: string
  tokens: number
  model: string
}> {
  // Dynamic import to avoid SSR issues
  const ZAI = (await import('z-ai-web-dev-sdk')).default

  const zai = await ZAI.create()

  const startTime = Date.now()

  // Race between API call and timeout
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('AI_API_TIMEOUT')), API_TIMEOUT_MS)
  )

  try {
    const completion = await Promise.race([
      zai.chat.completions.create({
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        thinking: { type: 'disabled' },
        stream: false,
      }),
      timeoutPromise,
    ])

    const latencyMs = Date.now() - startTime
    const reply = completion.choices?.[0]?.message?.content || ''
    const tokens = completion.usage?.total_tokens || Math.ceil(reply.length / 4) // estimate if not provided
    const model = completion.model || 'glm-4-flash'

    console.log(`[GLM Chat] ${latencyMs}ms, ~${tokens} tokens, model: ${model}`)

    return { content: reply, tokens, model }
  } catch (error: any) {
    const latencyMs = Date.now() - startTime
    console.error(`[GLM Chat] Error after ${latencyMs}ms:`, error?.message || error)

    // Provide user-friendly error messages
    if (error?.message?.includes('TIMEOUT') || error?.message?.includes('timeout')) {
      throw new Error('El asistente está tardando demasiado. Intenta de nuevo en unos segundos.')
    }
    if (error?.message?.includes('429') || error?.message?.includes('rate_limit')) {
      throw new Error('Demasiadas solicitudes. Espera un momento antes de intentar de nuevo.')
    }
    if (error?.message?.includes('401') || error?.message?.includes('auth')) {
      throw new Error('Error de autenticación con el servicio de IA. Contacta al administrador.')
    }
    if (error?.message?.includes('500') || error?.message?.includes('502') || error?.message?.includes('503')) {
      throw new Error('El servicio de IA no está disponible temporalmente. Intenta más tarde.')
    }

    throw new Error('No pude procesar tu pregunta. Intenta de nuevo.')
  }
}

// ─── Fallback Response (when API fails) ─────────────────────────────────────

function getFallbackResponse(userMessage: string, context: { currentPage?: string }): string {
  const lowerMsg = userMessage.toLowerCase()

  // Pattern matching for common questions
  if (lowerMsg.includes('vender') || lowerMsg.includes('venta') || lowerMsg.includes('cobrar')) {
    return '**Para hacer una venta en el POS:**\n\n1. Ve a la sección **POS** en el menú lateral\n2. Busca el producto por nombre o código de barras\n3. Haz clic en el producto para agregarlo al carrito\n4. Ajusta la cantidad si es necesario\n5. Aplica descuento o propina si aplica\n6. Haz clic en **Cobrar**\n7. Selecciona el método de pago\n8. Confirma la venta\n\n💡 Si quieres generar factura electrónica, activa la opción antes de cobrar.'
  }

  if (lowerMsg.includes('factura') || lowerMsg.includes('dian') || lowerMsg.includes('electrónic')) {
    return '**Para configurar facturación electrónica:**\n\n1. Ve a **Configuración → Facturación Electrónica**\n2. Ingresa los datos de la resolución DIAN\n3. Sube tu certificado digital (.p12)\n4. Configura el Proveedor Tecnológico (PTE)\n5. Activa el modo de conexión (OFFLINE/ONLINE)\n\n⚠️ Necesitas resolución vigente de la DIAN para emitir facturas válidas.'
  }

  if (lowerMsg.includes('producto') || lowerMsg.includes('inventario') || lowerMsg.includes('agregar')) {
    return '**Para agregar un producto:**\n\n1. Ve a **Productos** en el menú lateral\n2. Haz clic en **+ Nuevo Producto**\n3. Completa nombre, precio de venta, costo, IVA\n4. Asigna una categoría y proveedor\n5. Configura stock mínimo para alertas\n6. Guarda el producto\n\n📦 El inventario se actualiza automáticamente con cada venta o compra.'
  }

  if (lowerMsg.includes('suscripción') || lowerMsg.includes('plan') || lowerMsg.includes('precio')) {
    return '**Planes de VentifyPOS:**\n\n- **Básico**: 1 tienda, 5 empleados, 100 productos\n- **Profesional**: 3 tiendas, 15 empleados, 500 productos\n- **Enterprise**: Tiendas ilimitadas, empleados ilimitados, productos ilimitados\n\n📋 Ve a **Configuración → Suscripción** para ver o cambiar tu plan.\n\n⏱️ El trial dura 14 días con todas las funciones.'
  }

  if (lowerMsg.includes('caja') || lowerMsg.includes('turno') || lowerMsg.includes('cierre')) {
    return '**Para manejar la caja registradora:**\n\n1. Ve a **Contabilidad → Caja Registradora**\n2. Haz clic en **Abrir Turno** con el conteo inicial\n3. Durante el turno, todas las ventas se registran automáticamente\n4. Al final, haz clic en **Cerrar Turno**\n5. Ingresa el conteo final de efectivo\n6. Revisa el resumen de ventas\n\n💰 El sistema calcula automáticamente la diferencia entre lo esperado y lo real.'
  }

  return 'Lo siento, no pude conectar con el servicio de IA en este momento. Por favor intenta de nuevo en unos segundos.\n\nSi el problema persiste, contacta al administrador del sistema.'
}

// ─── POST Handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── Auth check ──
    const auth = getAuthUser(req)
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Autenticación requerida' },
        { status: 401 }
      )
    }

    // ── Parse body ──
    const body = await req.json()
    const { message, sessionId, currentPage, subscriptionStatus, planName } = body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Mensaje vacío' },
        { status: 400 }
      )
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { success: false, error: `Mensaje muy largo (máximo ${MAX_MESSAGE_LENGTH} caracteres)` },
        { status: 400 }
      )
    }

    // ── Check token budget ──
    const budget = await checkTokenBudget(auth.userId)
    if (!budget.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Límite diario de uso alcanzado. El asistente estará disponible mañana.',
          usage: { remaining: 0, usedToday: budget.usedToday },
        },
        { status: 429 }
      )
    }

    // ── Find or create session ──
    let session
    if (sessionId) {
      session = await db.chatSession.findUnique({
        where: { sessionId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: MAX_CONTEXT_MESSAGES,
          },
        },
      })

      // Validate session belongs to user
      if (session && session.userId !== auth.userId) {
        session = null // Don't leak other users' sessions
      }
    }

    if (!session) {
      const newSessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      session = await db.chatSession.create({
        data: {
          sessionId: newSessionId,
          userId: auth.userId,
          storeId: auth.storeId,
          title: message.slice(0, 80),
        },
        include: { messages: true },
      })
    }

    // ── Save user message ──
    await db.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'user',
        content: message.trim(),
        tokens: Math.ceil(message.length / 4), // estimate
      },
    })

    // ── Build messages array for GLM API ──
    const systemPrompt = buildSystemPrompt({
      currentPage,
      subscriptionStatus,
      planName,
    })

    const glmMessages: GlmMessage[] = [
      { role: 'system', content: systemPrompt },
    ]

    // Add conversation history (context)
    const historyMessages = session.messages
      .filter(m => m.role !== 'system') // system messages are not part of history for the API
      .slice(-MAX_CONTEXT_MESSAGES)

    for (const msg of historyMessages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        glmMessages.push({ role: msg.role, content: msg.content })
      }
    }

    // Add current user message
    glmMessages.push({ role: 'user', content: message.trim() })

    // ── Call GLM API ──
    let aiContent: string
    let tokensUsed: number
    let model: string

    try {
      const result = await callGlmApi(glmMessages)
      aiContent = result.content
      tokensUsed = result.tokens
      model = result.model
    } catch (error: any) {
      // Use fallback response on API error
      console.warn('[GLM Chat] Using fallback response:', error?.message)
      aiContent = getFallbackResponse(message, { currentPage })
      tokensUsed = Math.ceil(aiContent.length / 4)
      model = 'fallback'
    }

    // Ensure we have some content
    if (!aiContent || aiContent.trim().length === 0) {
      aiContent = 'Lo siento, no pude generar una respuesta. Por favor intenta reformular tu pregunta.'
    }

    const startTime = Date.now()

    // ── Save assistant message ──
    await db.chatMessage.create({
      data: {
        sessionId: session.id,
        role: 'assistant',
        content: aiContent,
        tokens: tokensUsed,
        model,
        latencyMs: Date.now() - startTime,
      },
    })

    // ── Update session stats ──
    await db.chatSession.update({
      where: { id: session.id },
      data: {
        tokensUsed: { increment: tokensUsed },
        messageCount: { increment: 2 }, // user + assistant
        updatedAt: new Date(),
      },
    })

    // ── Calculate remaining budget ──
    const updatedBudget = await checkTokenBudget(auth.userId)

    return NextResponse.json({
      success: true,
      message: aiContent,
      sessionId: session.sessionId,
      usage: {
        remaining: updatedBudget.remaining,
        usedToday: updatedBudget.usedToday,
        tokensThisMessage: tokensUsed,
      },
    })
  } catch (error: any) {
    console.error('[GLM Chat] Unhandled error:', error)
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// ─── DELETE Handler (Clear Session) ────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const auth = getAuthUser(req)
    if (!auth) {
      return NextResponse.json(
        { error: 'Autenticación requerida' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId requerido' },
        { status: 400 }
      )
    }

    // Find session and verify ownership
    const session = await db.chatSession.findUnique({
      where: { sessionId },
    })

    if (!session || session.userId !== auth.userId) {
      return NextResponse.json(
        { error: 'Sesión no encontrada' },
        { status: 404 }
      )
    }

    // Delete session (cascades to messages)
    await db.chatSession.delete({
      where: { id: session.id },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[GLM Chat] DELETE error:', error)
    return NextResponse.json(
      { error: 'Error al limpiar la sesión' },
      { status: 500 }
    )
  }
}

// ─── GET Handler (Session History) ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req)
    if (!auth) {
      return NextResponse.json(
        { error: 'Autenticación requerida' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      // Return all active sessions for this user
      const sessions = await db.chatSession.findMany({
        where: {
          userId: auth.userId,
          isActive: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          sessionId: true,
          title: true,
          messageCount: true,
          tokensUsed: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      const budget = await checkTokenBudget(auth.userId)

      return NextResponse.json({
        sessions,
        usage: {
          remaining: budget.remaining,
          usedToday: budget.usedToday,
          dailyLimit: DAILY_TOKEN_LIMIT,
        },
      })
    }

    // Return messages for a specific session
    const session = await db.chatSession.findUnique({
      where: { sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            role: true,
            content: true,
            tokens: true,
            model: true,
            latencyMs: true,
            createdAt: true,
          },
        },
      },
    })

    if (!session || session.userId !== auth.userId) {
      return NextResponse.json(
        { error: 'Sesión no encontrada' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      session: {
        sessionId: session.sessionId,
        title: session.title,
        messageCount: session.messageCount,
        tokensUsed: session.tokensUsed,
        messages: session.messages,
      },
    })
  } catch (error: any) {
    console.error('[GLM Chat] GET error:', error)
    return NextResponse.json(
      { error: 'Error al obtener historial' },
      { status: 500 }
    )
  }
}
