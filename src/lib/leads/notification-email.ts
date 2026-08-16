/**
 * Builds the HTML body for CRM lead-lifecycle emails: a document being
 * rejected (needs a corrected re-upload) and an account being activated
 * (lead successfully converted into a Store). Mirrors the visual style of
 * src/lib/subscription/alert-email.ts for consistency across the product.
 */

export function buildDocumentRejectedHtml(params: {
  ownerName: string
  storeName: string
  documentLabel: string
  reason: string
  supportPhone: string
}): string {
  const { ownerName, storeName, documentLabel, reason, supportPhone } = params

  const whatsappMessage = encodeURIComponent(
    `Hola, soy ${ownerName} de "${storeName}". Me avisaron que mi documento "${documentLabel}" fue rechazado. Aquí les envío la versión corregida.`
  )
  const whatsappLink = `https://wa.me/${supportPhone}?text=${whatsappMessage}`

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Documento rechazado — Sebwen POS</title>
</head>
<body style="margin:0; padding:0; background-color:#f0f2f5; font-family:Arial, Helvetica, sans-serif; color:#1a1a2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#f59e0b; padding:24px 32px; text-align:center;">
              <p style="margin:0; font-size:28px; line-height:1;">📄</p>
              <h1 style="margin:8px 0 0; font-size:18px; font-weight:700; color:#ffffff;">Documento por corregir</h1>
              <p style="margin:4px 0 0; font-size:13px; color:rgba(255,255,255,0.9);">Sebwen POS · Validación legal</p>
            </td>
          </tr>

          <!-- Alert Banner -->
          <tr>
            <td style="padding:20px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb; border-left:4px solid #f59e0b; border-radius:6px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="margin:0; font-size:15px; line-height:1.5; color:#1a1a2e;">
                      No pudimos aprobar tu documento <strong>${documentLabel}</strong>
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
                Estamos revisando el expediente legal de <strong>"${storeName}"</strong> y encontramos un problema con el documento <strong>${documentLabel}</strong> que enviaste:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fa; border-radius:6px; margin-bottom:16px;">
                <tr>
                  <td style="padding:14px 18px; font-size:14px; color:#495057; font-style:italic;">
                    "${reason}"
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#495057;">
                Responde a este mensaje por WhatsApp con una versión corregida para continuar con la activación de tu cuenta.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
                <tr>
                  <td align="center">
                    <a href="${whatsappLink}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block; padding:12px 28px; background-color:#25D366; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:600; font-size:14px;">
                      💬 Enviar documento corregido
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f9fa; padding:16px 32px; text-align:center; border-top:1px solid #e5e7eb;">
              <p style="margin:0; font-size:11px; color:#6c757d;">
                Este es un aviso automático de Sebwen POS sobre el estado de tu solicitud.
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

export function buildAccountActivatedHtml(params: {
  ownerName: string
  storeName: string
  ownerCedula: string
  trialEndFormatted: string
  loginUrl: string
  supportPhone: string
}): string {
  const { ownerName, storeName, ownerCedula, trialEndFormatted, loginUrl, supportPhone } = params

  const whatsappMessage = encodeURIComponent(
    `Hola, soy ${ownerName} de "${storeName}". Tengo una duda para empezar a usar mi cuenta de Sebwen POS.`
  )
  const whatsappLink = `https://wa.me/${supportPhone}?text=${whatsappMessage}`
  const hasLoginUrl = loginUrl.trim().length > 0

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cuenta activada — Sebwen POS</title>
</head>
<body style="margin:0; padding:0; background-color:#f0f2f5; font-family:Arial, Helvetica, sans-serif; color:#1a1a2e;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#059669; padding:24px 32px; text-align:center;">
              <p style="margin:0; font-size:28px; line-height:1;">🎉</p>
              <h1 style="margin:8px 0 0; font-size:18px; font-weight:700; color:#ffffff;">¡Tu cuenta ya está activa!</h1>
              <p style="margin:4px 0 0; font-size:13px; color:rgba(255,255,255,0.9);">Sebwen POS</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:24px 32px 0;">
              <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#495057;">
                ¡Bienvenido/a <strong>${ownerName}</strong>!
              </p>
              <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#495057;">
                Validamos el expediente legal de <strong>"${storeName}"</strong> y tu cuenta ya está lista para operar, con <strong>7 días de prueba gratis</strong> hasta el <strong>${trialEndFormatted}</strong>.
              </p>
            </td>
          </tr>

          <!-- Login info card -->
          <tr>
            <td style="padding:0 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">
                <tr>
                  <td style="padding:12px 18px; font-size:13px; color:#6c757d; border-bottom:1px solid #e5e7eb; width:40%;">Usuario (cédula)</td>
                  <td style="padding:12px 18px; font-size:14px; font-weight:700; border-bottom:1px solid #e5e7eb; text-align:right; font-family:'Courier New', Courier, monospace;">${ownerCedula}</td>
                </tr>
                <tr>
                  <td style="padding:12px 18px; font-size:13px; color:#6c757d;">Contraseña</td>
                  <td style="padding:12px 18px; font-size:13px; text-align:right; color:#495057;">La que creaste al registrarte</td>
                </tr>
              </table>
              <p style="margin:10px 0 0; font-size:12px; line-height:1.5; color:#6c757d;">
                ¿No la recuerdas? Puedes recuperarla desde la pantalla de inicio de sesión con la opción "Olvidé mi contraseña".
              </p>
            </td>
          </tr>

          <!-- Action buttons -->
          <tr>
            <td style="padding:0 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${hasLoginUrl ? `<tr>
                  <td align="center" style="padding:0 0 12px;">
                    <a href="${loginUrl}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block; padding:12px 28px; background-color:#059669; color:#ffffff; text-decoration:none; border-radius:8px; font-weight:600; font-size:14px;">
                      🚀 Ingresar a Sebwen POS
                    </a>
                  </td>
                </tr>` : ''}
                <tr>
                  <td align="center">
                    <a href="${whatsappLink}" target="_blank" rel="noopener noreferrer"
                       style="display:inline-block; padding:10px 28px; background-color:#ffffff; color:#495057; text-decoration:none; border:1px solid #dee2e6; border-radius:8px; font-weight:500; font-size:13px;">
                      💬 Tengo una duda
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f9fa; padding:16px 32px; text-align:center; border-top:1px solid #e5e7eb;">
              <p style="margin:0; font-size:11px; color:#6c757d;">
                Gracias por confiar en Sebwen POS para tu negocio.
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
