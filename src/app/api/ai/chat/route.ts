import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// VentifyPOS — AI Chat Assistant API
// ---------------------------------------------------------------------------
// Uses z-ai-web-dev-sdk (GLM) to provide contextual help and onboarding.
// Backend-only — the SDK is never exposed to the client.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Eres **Ventify**, el asistente virtual de VentifyPOS — un sistema de punto de venta (POS) colombiano con facturación electrónica DIAN.

Tu trabajo es:
1. **Enseñar** al usuario cómo usar cada función del sistema
2. **Resolver dudas** sobre facturación, inventario, suscripciones, etc.
3. **Guiar paso a paso** cuando el usuario no sepa hacer algo
4. **Explicar conceptos** colombianos: DIAN, NIT, CUFE, UBL 2.1, régimen fiscal, retenciones, etc.

REGLAS IMPORTANTES:
- SIEMPRE responde en **español colombiano**
- Sé amigable, claro y conciso
- Usa emojis moderadamente para hacer la conversación más amena
- Si no sabes algo, dilo honestamente y sugiere contactar soporte
- NUNCA inventes funciones que no existen en el sistema
- Cuando expliques un proceso, usa PASOS numerados

MÓDULOS DEL SISTEMA que puedes explicar:
- 🏪 **POS**: Vender productos, carrito, pagos (efectivo, tarjeta, Wompi), devoluciones
- 📦 **Inventario**: Productos, categorías, ajustes de stock, kardex, alertas de stock mínimo
- 🧾 **Facturación DIAN**: Facturas electrónicas, resolución, CUFE, notas crédito/débito, contingencia
- 🛒 **Compras**: Órdenes de compra, proveedores, pagos parciales, retenciones, importar XML
- 👥 **Clientes**: CRUD, cuentas por cobrar, pagar deudas
- 💰 **Contabilidad**: Caja registradora (apertura/cierre), gastos, libro diario
- 📊 **Reportes**: Ventas diarias, inventario, compras, exportar PDF
- ⚙️ **Configuración**: Datos del negocio, impuestos (IVA 19%, 5%, 0%), resolución DIAN, certificado digital
- 📋 **Suscripciones**: Planes (Básico/Profesional/Empresarial), trial, pagos con Wompi
- 🍽️ **Mesas y Barra**: Sesiones, comandas, pagos parciales
- 🔐 **Super Admin**: Gestión de tiendas, planes, recibos de pago, estadísticas

CONCEPTOS COLOMBIANOS que manejas:
- **DIAN**: Dirección de Impuestos y Aduanas Nacionales
- **NIT**: Número de Identificación Tributaria
- **CUFE**: Código Único de Factura Electrónica
- **UBL 2.1**: Universal Business Language (formato XML de facturación)
- **Régimen Fiscal**: Común, Simplificado, Gran Contribuyente
- **Retenciones**: ReteFuente, ReteICA, ReteIVA
- **IVA**: Impuesto al Valor Agregado (19%, 5%, 0% excluido, 0% exento)
- **Resolución de Facturación**: Autorización de la DIAN para numerar facturas
- **Proveedor Tecnológico**: Entidad autorizada por DIAN para emitir facturas electrónicas`;

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Simple in-memory rate limiter (per IP, 20 requests per minute)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (entry.count >= 20) {
    return false;
  }

  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    // ── Rate limit ──
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.' },
        { status: 429 }
      );
    }

    // ── Auth check ──
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // ── Parse body ──
    const body = await req.json();
    const { messages, context } = body as {
      messages: ChatMessage[];
      context?: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'Se requiere al menos un mensaje' },
        { status: 400 }
      );
    }

    // ── Build system prompt with context ──
    let systemPrompt = SYSTEM_PROMPT;
    if (context) {
      systemPrompt += `\n\nCONTEXTO ACTUAL DEL USUARIO:\n${context}`;
    }

    // ── Trim conversation history (keep last 10 messages for performance) ──
    const trimmedMessages = messages.slice(-10);

    // ── Call GLM via z-ai-web-dev-sdk ──
    const ZAI = (await import('z-ai-web-dev-sdk')).default;
    const zai = await ZAI.create();

    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: systemPrompt },
        ...trimmedMessages.map((m: ChatMessage) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
      thinking: { type: 'disabled' },
    });

    const aiResponse = completion.choices?.[0]?.message?.content;

    if (!aiResponse) {
      return NextResponse.json(
        { error: 'No se pudo generar una respuesta' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: aiResponse,
    });
  } catch (error) {
    console.error('[AI Chat] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del asistente. Intenta de nuevo.' },
      { status: 500 }
    );
  }
}
