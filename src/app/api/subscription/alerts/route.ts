import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { getSupportPhone } from '@/lib/constants'
import { buildExpiryAlertHtml } from '@/lib/subscription/alert-email'
import { safeStringEqual } from '@/lib/crypto-utils'

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
    if (!internalSecret || !expectedSecret || !safeStringEqual(internalSecret, expectedSecret)) {
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
        ownerPhone: store.phone || owner.phone,
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

  const html = buildExpiryAlertHtml({
    ownerName: data.ownerName,
    storeName: data.storeName,
    planName: data.planName,
    daysRemaining: data.daysRemaining,
    endDate: data.endDateFormatted,
    supportPhone,
    supportWhatsApp: supportPhone,
  })

  try {
    const info = await transporter.sendMail({
      from: fromHeader,
      to: data.to,
      subject: data.isUrgent
        ? `⚠️ Tu suscripción Ventify POS vence mañana`
        : `Recordatorio: Tu suscripción Ventify POS vence en ${data.daysRemaining} días`,
      html,
    })

    return { success: true, messageId: info.messageId } as { success: boolean; error?: string }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`[AlertEmail] Error sending to ${data.to}:`, message)
    return { success: false, error: message }
  }
}
