// ---------------------------------------------------------------------------
// VentifyPOS — AI Chat Route (GLM via z-ai CLI subprocess)
// ---------------------------------------------------------------------------
// Uses z-ai CLI tool via Bun.spawn to call GLM API.
// Avoids all fetch/SDK calls inside Next.js that cause server crashes.
// Context, session management, cost control handled here.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/api-auth'
import { spawn } from 'child_process'
import { readFileSync, unlinkSync, existsSync } from 'fs'

// ─── Constants ──────────────────────────────────────────────────────────────

const DAILY_TOKEN_LIMIT = parseInt(process.env.AI_DAILY_TOKEN_LIMIT || '100000', 10)
const MAX_CONTEXT_MESSAGES = parseInt(process.env.AI_MAX_CONTEXT_MESSAGES || '20', 10)
const MAX_MESSAGE_LENGTH = 2000

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
    where: { userId, createdAt: { gte: todayStart } },
    select: { tokensUsed: true },
  })

  const usedToday = todaySessions.reduce((sum, s) => sum + s.tokensUsed, 0)
  const remaining = Math.max(0, DAILY_TOKEN_LIMIT - usedToday)

  return { allowed: usedToday < DAILY_TOKEN_LIMIT, usedToday, remaining }
}

// ─── GLM API via z-ai CLI subprocess ────────────────────────────────────────
// This avoids fetch/SDK calls inside Next.js that crash the server.

async function callGlmCli(userMessage: string, systemPrompt: string): Promise<{
  content: string
  tokens: number
  model: string
}> {
  const startTime = Date.now()
  const outputFile = `/tmp/zai-chat-${Date.now()}.json`

  try {
    // Use Node.js child_process.spawn (works in Next.js runtime)
    const exitCode = await new Promise<number>((resolve, reject) => {
      const proc = spawn('z-ai', [
        'chat',
        '--prompt', userMessage,
        '--system', systemPrompt,
        '-o', outputFile,
      ], {
        env: { ...process.env },
        stdio: 'pipe',
      })

      // Set a 35s timeout
      const timer = setTimeout(() => {
        proc.kill('SIGTERM')
        resolve(1)
      }, 35000)

      proc.on('close', (code) => {
        clearTimeout(timer)
        resolve(code ?? 1)
      })

      proc.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })

    const latencyMs = Date.now() - startTime

    if (exitCode !== 0) {
      console.error(`[GLM Chat] CLI exit ${exitCode} after ${latencyMs}ms`)
      return { content: '', tokens: 0, model: 'error' }
    }

    // Read output file
    if (!existsSync(outputFile)) {
      console.error('[GLM Chat] Output file not found')
      return { content: '', tokens: 0, model: 'error' }
    }

    const result = JSON.parse(readFileSync(outputFile, 'utf-8')) as any
    const reply = result.choices?.[0]?.message?.content || ''
    const tokens = result.usage?.total_tokens || Math.ceil(reply.length / 4)
    const model = result.model || 'glm-4-flash'

    console.log(`[GLM Chat] CLI ${latencyMs}ms, ~${tokens} tokens, model: ${model}`)

    // Clean up temp file
    try { unlinkSync(outputFile) } catch { /* ignore */ }

    return { content: reply, tokens, model }
  } catch (error: any) {
    const latencyMs = Date.now() - startTime
    console.error(`[GLM Chat] CLI error after ${latencyMs}ms:`, error?.message || error)
    return { content: '', tokens: 0, model: 'error' }
  }
}

// ─── Fallback Response ──────────────────────────────────────────────────────

function getFallbackResponse(userMessage: string): string {
  const lowerMsg = userMessage.toLowerCase()

  if (lowerMsg.includes('vender') || lowerMsg.includes('venta') || lowerMsg.includes('cobrar')) {
    return '**Para hacer una venta en el POS:**\n\n1. Ve a la sección **POS** en el menú lateral\n2. Busca el producto por nombre o código de barras\n3. Haz clic en el producto para agregarlo al carrito\n4. Ajusta la cantidad si es necesario\n5. Aplica descuento o propina si aplica\n6. Haz clic en **Cobrar**\n7. Selecciona el método de pago\n8. Confirma la venta\n\n💡 Si quieres generar factura electrónica, activa la opción antes de cobrar.'
  }

  if (lowerMsg.includes('factura') || lowerMsg.includes('dian') || lowerMsg.includes('electrónic')) {
    return '**Para configurar facturación electrónica:**\n\n1. Ve a **Configuración → Facturación Electrónica**\n2. Ingresa los datos de la resolución DIAN\n3. Sube tu certificado digital (.p12)\n4. Configura el Proveedor Tecnológico (PTE)\n5. Activa el modo de conexión (OFFLINE/ONLINE)\n\n⚠️ Necesitas resolución vigente de la DIAN para emitir facturas válidas.'
  }

  if (lowerMsg.includes('cotización') || lowerMsg.includes('cotizar') || lowerMsg.includes('cotizacion')) {
    return '**Para crear una cotización:**\n\n1. Ve a **Cotizaciones** en el menú lateral\n2. Haz clic en **Nueva Cotización**\n3. Selecciona el cliente\n4. Agrega los productos o servicios con sus cantidades\n5. Aplica descuentos si aplica\n6. Define la validez de la cotización\n7. Guarda y envía al cliente\n\n💡 Puedes convertir una cotización en una venta directamente desde el detalle.'
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
    const auth = getAuthUser(req)
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Autenticación requerida' }, { status: 401 })
    }

    const body = await req.json()
    const { message, sessionId, currentPage, subscriptionStatus, planName } = body

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Mensaje vacío' }, { status: 400 })
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ success: false, error: `Mensaje muy largo (máximo ${MAX_MESSAGE_LENGTH} caracteres)` }, { status: 400 })
    }

    const budget = await checkTokenBudget(auth.userId)
    if (!budget.allowed) {
      return NextResponse.json({
        success: false,
        error: 'Límite diario de uso alcanzado. El asistente estará disponible mañana.',
        usage: { remaining: 0, usedToday: budget.usedToday },
      }, { status: 429 })
    }

    // Find or create session
    let session
    if (sessionId) {
      session = await db.chatSession.findUnique({
        where: { sessionId },
        include: { messages: { orderBy: { createdAt: 'asc' }, take: MAX_CONTEXT_MESSAGES } },
      })
      if (session && session.userId !== auth.userId) session = null
    }

    if (!session) {
      const newSessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      session = await db.chatSession.create({
        data: { sessionId: newSessionId, userId: auth.userId, storeId: auth.storeId, title: message.slice(0, 80) },
        include: { messages: true },
      })
    }

    // Save user message
    await db.chatMessage.create({
      data: { sessionId: session.id, role: 'user', content: message.trim(), tokens: Math.ceil(message.length / 4) },
    })

    // Build system prompt with context
    const systemPrompt = buildSystemPrompt({ currentPage, subscriptionStatus, planName })

    // Build conversation summary for context (CLI only supports single prompt + system)
    // Include recent history in the user message for continuity
    const recentHistory = session.messages
      .filter(m => m.role !== 'system')
      .slice(-6) // last 3 exchanges

    let contextMessage = message.trim()
    if (recentHistory.length > 0) {
      const historyText = recentHistory
        .map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.content}`)
        .join('\n')
      contextMessage = `[Conversación previa]\n${historyText}\n\n[Usuario ahora]: ${message.trim()}`
    }

    // Call GLM via z-ai CLI subprocess (no fetch, no SDK — no crashes)
    let aiContent: string
    let tokensUsed: number
    let model: string

    const result = await callGlmCli(contextMessage, systemPrompt)

    if (result.content && result.content.trim().length > 0) {
      aiContent = result.content
      tokensUsed = result.tokens
      model = result.model
    } else {
      console.warn('[GLM Chat] Using fallback (CLI returned empty)')
      aiContent = getFallbackResponse(message)
      tokensUsed = Math.ceil(aiContent.length / 4)
      model = 'fallback'
    }

    // Save assistant message
    await db.chatMessage.create({
      data: { sessionId: session.id, role: 'assistant', content: aiContent, tokens: tokensUsed, model },
    })

    // Update session stats
    await db.chatSession.update({
      where: { id: session.id },
      data: { tokensUsed: { increment: tokensUsed }, messageCount: { increment: 2 }, updatedAt: new Date() },
    })

    const updatedBudget = await checkTokenBudget(auth.userId)

    return NextResponse.json({
      success: true,
      message: aiContent,
      sessionId: session.sessionId,
      usage: { remaining: updatedBudget.remaining, usedToday: updatedBudget.usedToday, tokensThisMessage: tokensUsed },
    })
  } catch (error: any) {
    console.error('[GLM Chat] Unhandled error:', error)
    return NextResponse.json({ success: false, error: 'Error interno del servidor' }, { status: 500 })
  }
}

// ─── DELETE Handler ─────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const auth = getAuthUser(req)
    if (!auth) return NextResponse.json({ error: 'Autenticación requerida' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')
    if (!sessionId) return NextResponse.json({ error: 'sessionId requerido' }, { status: 400 })

    const session = await db.chatSession.findUnique({ where: { sessionId } })
    if (!session || session.userId !== auth.userId) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })

    await db.chatSession.delete({ where: { id: session.id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[GLM Chat] DELETE error:', error)
    return NextResponse.json({ error: 'Error al limpiar la sesión' }, { status: 500 })
  }
}

// ─── GET Handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const auth = getAuthUser(req)
    if (!auth) return NextResponse.json({ error: 'Autenticación requerida' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      const sessions = await db.chatSession.findMany({
        where: { userId: auth.userId, isActive: true },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: { sessionId: true, title: true, messageCount: true, tokensUsed: true, createdAt: true, updatedAt: true },
      })
      const budget = await checkTokenBudget(auth.userId)
      return NextResponse.json({ sessions, usage: { remaining: budget.remaining, usedToday: budget.usedToday, dailyLimit: DAILY_TOKEN_LIMIT } })
    }

    const session = await db.chatSession.findUnique({
      where: { sessionId },
      include: { messages: { orderBy: { createdAt: 'asc' }, select: { id: true, role: true, content: true, tokens: true, model: true, latencyMs: true, createdAt: true } } },
    })

    if (!session || session.userId !== auth.userId) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })

    return NextResponse.json({ session: { sessionId: session.sessionId, title: session.title, messageCount: session.messageCount, tokensUsed: session.tokensUsed, messages: session.messages } })
  } catch (error: any) {
    console.error('[GLM Chat] GET error:', error)
    return NextResponse.json({ error: 'Error al obtener historial' }, { status: 500 })
  }
}
