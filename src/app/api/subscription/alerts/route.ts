import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { getSupportPhone } from '@/lib/constants'

export const dynamic = 'force-dynamic'

/**
 * GET /api/subscription/alerts
 * Internal endpoint called by the subscription-cron service.
 * Finds subscriptions expiring soon and sends email/WhatsApp alerts.
 *
 * Query params:
 *   daysBefore=3  → alert 3 days before expiry
 *   daysBefore=1  → alert 1 day before expiry
 *
 * The cron calls this endpoint twice daily: once with daysBefore=3, once with daysBefore=1.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const daysBefore = parseInt(searchParams.get('daysBefore') || '3', 10)

    // Auth: internal secret via header (set by cron service) — constant-time comparison
    const internalSecret = req.headers.get('x-internal-secret')
    const expectedSecret = process.env.INTERNAL_SECRET
    const secretsMatch = internalSecret && expectedSecret && internalSecret.length === expectedSecret.length &&
      Buffer.from(internalSecret).compare(Buffer.from(expectedSecret)) === 0
    if (!secretsMatch) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (![1, 3].includes(daysBefore)) {
      return NextResponse.json({ error: 'daysBefore must be 1 or 3' }, { status: 400 })
    }

    const now = new Date()
    const targetStart = new Date(now.getTime() + daysBefore * 24 * 60 * 60 * 1000)
    targetStart.setHours(0, 0, 0, 0)

    const targetEnd = new Date(targetStart.getTime() + 24 * 60 * 60 * 1000)

    // Find ACTIVE/TRIAL subscriptions expiring in the target window that haven't been alerted yet
    const alertField = daysBefore === 3 ? 'alertSentAt3d' : 'alertSentAt1d'

    // Use Prisma to find subscriptions where:
    // - status is ACTIVE or TRIAL
    // - endDate is between targetStart and targetEnd
    // - the corresponding alert field is null (not yet sent)
    const subscriptions = await db.subscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'TRIAL'] },
        endDate: { gte: targetStart, lt: targetEnd },
        ...(daysBefore === 3 ? { alertSentAt3d: null } : { alertSentAt1d: null }),
      },
      include: {
        plan: true,
        store: {
          select: {
            id: true,
            name: true,
            phone: true,
            user: { select: { fullName: true, email: true, phone: true } },
          },
        },
      },
    })

    if (subscriptions.length === 0) {
      return NextResponse.json({
        message: `No subscriptions expiring in ${daysBefore} day(s)`,
        checkedAt: now.toISOString(),
        count: 0,
      })
    }

    // Send alerts for each subscription
    const results = []

    for (const sub of subscriptions) {
      const store = sub.store
      const owner = store.user
      const ownerName = owner.fullName || 'Propietario'
      const planName = sub.plan.name
      const endDateFormatted = sub.endDate
        ? new Date(sub.endDate).toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })
        : '—'

      const isUrgent = daysBefore === 1

      // ── Send Email Alert ──
      let emailResult = null
      if (owner.email) {
        try {
          emailResult = await sendExpiryAlertEmail({
            to: owner.email,
            ownerName,
            storeName: store.name,
            planName,
            daysRemaining: daysBefore,
            endDateFormatted,
            isUrgent,
          })
        } catch (emailError) {
          logger.error(`[Alert] Failed to send email to ${owner.email}:`, emailError)
        }
      }

      // ── Build WhatsApp Link ──
      const supportPhone = getSupportPhone()
      const whatsappMessage = encodeURIComponent(
        `Hola, soy ${ownerName} de "${store.name}". Mi suscripción ${planName} en Ventify POS vence ${isUrgent ? 'mañana' : `en ${daysBefore} días`}. Quisiera renovar/actualizar mi plan.`
      )
      const whatsappLink = `https://wa.me/${supportPhone}?text=${whatsappMessage}`

      // ── Mark alert as sent ──
      try {
        await db.subscription.update({
          where: { id: sub.id },
          data: {
            ...(daysBefore === 3 ? { alertSentAt3d: now } : { alertSentAt1d: now }),
          },
        })
      } catch (updateError) {
        logger.error(`[Alert] Failed to mark alert for store ${store.id}:`, updateError)
      }

      results.push({
        storeId: store.id,
        storeName: store.name,
        planName,
        ownerEmail: owner.email,
        ownerPhone: owner.phone || owner.phone,
        emailSent: emailResult?.success ?? false,
        whatsappLink,
        daysRemaining: daysBefore,
      })
    }

    const emailSentCount = results.filter(r => r.emailSent).length
    logger.info(
      `[ExpiryAlert] Sent ${emailSentCount}/${results.length} email alerts for ${daysBefore}-day expiry warning`
    )

    return NextResponse.json({
      message: `Processed ${results.length} subscription(s) expiring in ${daysBefore} day(s)`,
      checkedAt: now.toISOString(),
      daysBefore,
      total: results.length,
      emailSent: emailSentCount,
      whatsappLinks: results.map(r => ({ storeName: r.storeName, link: r.whatsappLink })),
      results,
    })
  } catch (error) {
    logger.error('GET /api/subscription/alerts error:', error)
    return NextResponse.json({ error: 'Error al procesar alertas' }, { status: 500 })
  }
}

// ── Email Sending ──

interface AlertEmailData {
  to: string
  ownerName: string
  storeName: string
  planName: string
  daysRemaining: number
  endDateFormatted: string
  isUrgent: boolean
}

async function sendExpiryAlertEmail(data: AlertEmailData): Promise<{ success: boolean; error?: string }> {
  const { getSmtpConfig, createTransport } = await import('@/lib/invoicing/email-sender')

  const config = getSmtpConfig()
  if (!config) {
    return { success: false, error: 'SMTP not configured' }
  }

  if (!data.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.to)) {
    return { success: false, error: 'Invalid email' }
  }

  const transporter = createTransport(config)
  const fromName = config.fromName ?? 'Ventify POS'
  const fromHeader = config.from.includes('<') && config.from.includes('>')
    ? `${fromName} ${config.from}`
    : `"${fromName}" <${config.from}>`

  const supportPhone = getSupportPhone()
  const whatsappMessage = encodeURIComponent(
    `Hola, soy ${data.ownerName} de "${data.storeName}". Mi suscripción ${data.planName} en Ventify POS vence ${data.isUrgent ? 'mañana' : `en ${data.daysRemaining} días`}. Quisiera renovar/actualizar mi plan.`
  )
  const whatsappLink = `https://wa.me/${supportPhone}?text=${whatsappMessage}`

  const accentColor = data.isUrgent ? '#dc2626' : '#f59e0b'
  const bgColor = data.isUrgent ? '#fef2f2' : '#fffbeb'
  const borderAccent = data.isUrgent ? '#ef4444' : '#f59e0b'
  const iconEmoji = data.isUrgent ? '🔴' : '🟡'
  const urgencyText = data.isUrgent
    ? `Tu suscripción <strong>vence mañana</strong>`
    : `Tu suscripción vence en <strong>${data.daysRemaining} días</strong>`

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Recordatorio de Suscripción — Ventify POS</title>
</head>
<body style="margin:0; padding:0; background-color:#f0f2f5; font-family:Arial, Helvetica, sans-serif; color:#1a1a2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:${accentColor}; padding:24px 32px; text-align:center;">
              <p style="margin:0; font-size:28px; line-height:1;">${iconEmoji}</p>
              <h1 style="margin:8px 0 0; font-size:18px; font-weight:700; color:#ffffff;">Recordatorio de Suscripción</h1>
              <p style="margin:4px 0 0; font-size:13px; color:rgba(255,255,255,0.9);">Ventify POS</p>
            </td>
          </tr>

          <!-- Alert Banner -->
          <tr>
            <td style="padding:20px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${bgColor}; border-left:4px solid ${borderAccent}; border-radius:6px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="margin:0; font-size:15px; line-height:1.5; color:#1a1a2e;">
                      ${urgencyText}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px 32px;">
              <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#495057;">
                Estimado/a <strong>${data.ownerName}</strong>,
              </p>
              <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#495057;">
                Le recordamos que la suscripción de su negocio <strong>"${data.storeName}"</strong> al plan <strong>${data.planName}</strong> finaliza el <strong>${data.endDateFormatted}</strong>.
              </p>
              <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#495057;">
                ${data.isUrgent
                  ? 'Para evitar la suspensión del servicio, le recomendamos renovar su plan a la mayor brevedad.'
                  : 'Le recomendamos renovar con anticipación para disfrutar de una experiencia ininterrumpida.'}
              </p>

              <!-- Action buttons -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
                <tr>
                  <td align="center" style="padding:0 0 12px;">
                    <a href="${whatsappLink}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block; padding:12px 28px; background-color:#25D366; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:600; font-size:14px;">
                      💬 Renovar por WhatsApp
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <a href="tel:+${supportPhone}"
                       style="display:inline-block; padding:10px 28px; background-color:#ffffff; color:#495057; text-decoration:none; border:1px solid #dee2e6; border-radius:8px; font-weight:500; font-size:13px;">
                      📞 Llamar al ${supportPhone.slice(-10)}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Subscription Summary -->
          <tr>
            <td style="padding:0 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">
                <tr>
                  <td style="padding:12px 18px; font-size:13px; color:#6c757d; border-bottom:1px solid #e5e7eb; width:40%;">Negocio</td>
                  <td style="padding:12px 18px; font-size:13px; font-weight:600; border-bottom:1px solid #e5e7eb; text-align:right;">${data.storeName}</td>
                </tr>
                <tr>
                  <td style="padding:12px 18px; font-size:13px; color:#6c757d; border-bottom:1px solid #e5e7eb;">Plan actual</td>
                  <td style="padding:12px 18px; font-size:13px; font-weight:600; border-bottom:1px solid #e5e7eb; text-align:right;">${data.planName}</td>
                </tr>
                <tr>
                  <td style="padding:12px 18px; font-size:13px; color:#6c757d; border-bottom:1px solid #e5e7eb;">Fecha de vencimiento</td>
                  <td style="padding:12px 18px; font-size:13px; font-weight:600; border-bottom:1px solid #e5e7eb; text-align:right; color:${accentColor};">${data.endDateFormatted}</td>
                </tr>
                <tr>
                  <td style="padding:12px 18px; font-size:13px; color:#6c757d;">Días restantes</td>
                  <td style="padding:12px 18px; font-size:14px; font-weight:700; text-align:right; color:${accentColor};">${data.daysRemaining} día${data.daysRemaining > 1 ? 's' : ''}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f9fa; padding:16px 32px; text-align:center; border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 4px; font-size:11px; color:#6c757d;">
                Este es un recordatorio automático de Ventify POS. Puede renovar su suscripción desde la sección "Suscripción" en su panel de administración o contactando a nuestro equipo de soporte.
              </p>
              <p style="margin:0; font-size:10px; color:#adb5bd;">
                Si ya renovó su plan, ignore este mensaje.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  try {
    const info = await transporter.sendMail({
      from: fromHeader,
      to: data.to,
      subject: data.isUrgent
        ? `⚠️ Tu suscripción Ventify POS vence mañana`
        : `Recordatorio: Tu suscripción Ventify POS vence en ${data.daysRemaining} días`,
      html,
    })

    return { success: true, messageId: info.messageId }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[AlertEmail] Error sending to ${data.to}:`, message)
    return { success: false, error: message }
  }
}
