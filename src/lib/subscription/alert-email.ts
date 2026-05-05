/**
 * Builds the HTML body for the subscription expiry alert email.
 *
 * The urgency level is derived from `daysRemaining`:
 *   - 1 day  → urgent style (red)
 *   - 3 days → warning style (amber)
 */
export function buildExpiryAlertHtml(params: {
  ownerName: string
  storeName: string
  planName: string
  daysRemaining: number
  endDate: string
  supportPhone: string
  supportWhatsApp: string
}): string {
  const {
    ownerName,
    storeName,
    planName,
    daysRemaining,
    endDate,
    supportPhone,
    supportWhatsApp,
  } = params

  const isUrgent = daysRemaining <= 1

  const whatsappMessage = encodeURIComponent(
    `Hola, soy ${ownerName} de "${storeName}". Mi suscripción ${planName} en Ventify POS vence ${isUrgent ? 'mañana' : `en ${daysRemaining} días`}. Quisiera renovar/actualizar mi plan.`
  )
  const whatsappLink = `https://wa.me/${supportWhatsApp}?text=${whatsappMessage}`

  const accentColor = isUrgent ? '#dc2626' : '#f59e0b'
  const bgColor = isUrgent ? '#fef2f2' : '#fffbeb'
  const borderAccent = isUrgent ? '#ef4444' : '#f59e0b'
  const iconEmoji = isUrgent ? '🔴' : '🟡'
  const urgencyText = isUrgent
    ? `Tu suscripción <strong>vence mañana</strong>`
    : `Tu suscripción vence en <strong>${daysRemaining} días</strong>`

  return `<!DOCTYPE html>
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
                Estimado/a <strong>${ownerName}</strong>,
              </p>
              <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#495057;">
                Le recordamos que la suscripción de su negocio <strong>"${storeName}"</strong> al plan <strong>${planName}</strong> finaliza el <strong>${endDate}</strong>.
              </p>
              <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#495057;">
                ${isUrgent
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
                  <td style="padding:12px 18px; font-size:13px; font-weight:600; border-bottom:1px solid #e5e7eb; text-align:right;">${storeName}</td>
                </tr>
                <tr>
                  <td style="padding:12px 18px; font-size:13px; color:#6c757d; border-bottom:1px solid #e5e7eb;">Plan actual</td>
                  <td style="padding:12px 18px; font-size:13px; font-weight:600; border-bottom:1px solid #e5e7eb; text-align:right;">${planName}</td>
                </tr>
                <tr>
                  <td style="padding:12px 18px; font-size:13px; color:#6c757d; border-bottom:1px solid #e5e7eb;">Fecha de vencimiento</td>
                  <td style="padding:12px 18px; font-size:13px; font-weight:600; border-bottom:1px solid #e5e7eb; text-align:right; color:${accentColor};">${endDate}</td>
                </tr>
                <tr>
                  <td style="padding:12px 18px; font-size:13px; color:#6c757d;">Días restantes</td>
                  <td style="padding:12px 18px; font-size:14px; font-weight:700; text-align:right; color:${accentColor};">${daysRemaining} día${daysRemaining > 1 ? 's' : ''}</td>
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
}
