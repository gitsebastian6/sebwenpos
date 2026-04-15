import * as nodemailer from 'nodemailer'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EmailConfig {
  host: string           // e.g., "smtp.gmail.com"
  port: number           // e.g., 587
  secure: boolean        // false for 587, true for 465
  user: string           // SMTP username
  pass: string           // SMTP password
  from: string           // "Bar La Terraza <facturacion@barlaterraza.com>"
  fromName?: string      // Display name
}

export interface InvoiceEmailData {
  to: string             // Customer email
  customerName: string
  invoiceNumber: string  // "FE-00000001"
  issueDate: string
  grandTotal: number
  currencyCode: string
  supplierName: string
  supplierPhone: string
  supplierEmail: string
  supplierNit: string
  cufe: string
  status: string
  xmlContent?: string    // XML to attach
  pdfBuffer?: Buffer     // PDF to attach
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Format number as Colombian pesos: $50.000
 * Uses dots as thousands separator (es-CO locale).
 */
function formatCOP(value: number): string {
  const rounded = Math.round(value)
  const formatted = rounded.toLocaleString('es-CO')
  return `$${formatted}`
}

/**
 * Format YYYY-MM-DD to a readable Colombian date.
 */
function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  return `${parseInt(d, 10)} de ${months[parseInt(m, 10) - 1]} de ${y}`
}

/**
 * Truncate the CUFE for display, keeping first and last segments.
 */
function truncateCUFE(cufe: string): string {
  if (cufe.length <= 40) return cufe
  return `${cufe.slice(0, 20)}…${cufe.slice(-16)}`
}

/**
 * Returns color and label for a DIAN invoice status.
 */
function getStatusBadge(status: string): { color: string; bgColor: string; label: string } {
  const normalized = status.toLowerCase().trim()

  if (
    normalized === 'validado' ||
    normalized === 'aceptado' ||
    normalized === 'validated' ||
    normalized === 'accepted'
  ) {
    return {
      color: '#155724',
      bgColor: '#d4edda',
      label: 'Validada',
    }
  }

  if (
    normalized === 'pendiente' ||
    normalized === 'pending' ||
    normalized === 'en proceso' ||
    normalized === 'processing'
  ) {
    return {
      color: '#856404',
      bgColor: '#fff3cd',
      label: 'Pendiente',
    }
  }

  if (
    normalized === 'rechazado' ||
    normalized === 'rejected' ||
    normalized === 'error'
  ) {
    return {
      color: '#721c24',
      bgColor: '#f8d7da',
      label: 'Rechazada',
    }
  }

  // Default / unknown status
  return {
    color: '#383d41',
    bgColor: '#e2e3e5',
    label: status,
  }
}

// ─── HTML Email Builder ─────────────────────────────────────────────────────

/**
 * Generate a professional HTML email body for an electronic invoice.
 * Uses only inline styles for maximum email-client compatibility.
 */
export function buildEmailHTML(data: InvoiceEmailData): string {
  const badge = getStatusBadge(data.status)
  const formattedTotal = formatCOP(data.grandTotal)
  const formattedDate = formatDate(data.issueDate)
  const truncatedCUFE = truncateCUFE(data.cufe)

  const hasXml = typeof data.xmlContent === 'string' && data.xmlContent.length > 0
  const hasPdf = data.pdfBuffer instanceof Buffer && data.pdfBuffer.length > 0

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Factura Electrónica ${data.invoiceNumber}</title>
</head>
<body style="margin:0; padding:0; background-color:#f0f2f5; font-family:Arial, Helvetica, sans-serif; color:#1a1a2e;">
  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f2f5; padding:32px 16px;">
    <tr>
      <td align="center">
        <!-- Main card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px; background-color:#ffffff; border-radius:8px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#16213e; padding:28px 32px; text-align:center;">
              <h1 style="margin:0; font-size:22px; font-weight:700; color:#ffffff; letter-spacing:0.5px;">${data.supplierName}</h1>
              <p style="margin:6px 0 0; font-size:13px; color:rgba(255,255,255,0.85);">Factura Electrónica de Venta</p>
            </td>
          </tr>

          <!-- Status badge -->
          <tr>
            <td style="padding:20px 32px 0; text-align:center;">
              <span style="display:inline-block; padding:6px 18px; border-radius:20px; font-size:13px; font-weight:600; color:${badge.color}; background-color:${badge.bgColor};">
                ${badge.label}
              </span>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:24px 32px 0;">
              <p style="margin:0; font-size:15px; line-height:1.6;">Estimado/a <strong>${data.customerName}</strong>,</p>
              <p style="margin:8px 0 0; font-size:14px; line-height:1.6; color:#495057;">
                Adjuntamos la factura electrónica correspondiente a su compra. A continuación encontrará el resumen de la transacción.
              </p>
            </td>
          </tr>

          <!-- Invoice summary card -->
          <tr>
            <td style="padding:24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #dee2e6; border-radius:8px; overflow:hidden;">
                <!-- Row: Factura -->
                <tr>
                  <td style="padding:14px 18px; font-size:14px; color:#6c757d; border-bottom:1px solid #dee2e6; width:40%;">
                    Factura
                  </td>
                  <td style="padding:14px 18px; font-size:14px; font-weight:600; border-bottom:1px solid #dee2e6; text-align:right;">
                    ${data.invoiceNumber}
                  </td>
                </tr>
                <!-- Row: Fecha -->
                <tr>
                  <td style="padding:14px 18px; font-size:14px; color:#6c757d; border-bottom:1px solid #dee2e6;">
                    Fecha de emisión
                  </td>
                  <td style="padding:14px 18px; font-size:14px; font-weight:600; border-bottom:1px solid #dee2e6; text-align:right;">
                    ${formattedDate}
                  </td>
                </tr>
                <!-- Row: Moneda -->
                <tr>
                  <td style="padding:14px 18px; font-size:14px; color:#6c757d; border-bottom:1px solid #dee2e6;">
                    Moneda
                  </td>
                  <td style="padding:14px 18px; font-size:14px; font-weight:600; border-bottom:1px solid #dee2e6; text-align:right;">
                    ${data.currencyCode}
                  </td>
                </tr>
                <!-- Row: Total (highlighted) -->
                <tr>
                  <td style="padding:18px; font-size:18px; font-weight:700; color:#16213e;">
                    Total
                  </td>
                  <td style="padding:18px; font-size:18px; font-weight:700; color:#e94560; text-align:right;">
                    ${formattedTotal}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CUFE section -->
          <tr>
            <td style="padding:0 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fa; border-radius:6px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="margin:0 0 4px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.8px; color:#6c757d;">
                      Código CUFE
                    </p>
                    <p style="margin:0; font-size:12px; font-family:'Courier New', Courier, monospace; color:#495057; word-break:break-all; line-height:1.5;">
                      ${truncatedCUFE}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Supplier info -->
          <tr>
            <td style="padding:24px 32px;">
              <p style="margin:0 0 12px; font-size:13px; font-weight:600; text-transform:uppercase; letter-spacing:0.8px; color:#6c757d;">
                Información del emisor
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:4px 0; font-size:14px; color:#495057; width:35%;">Razón social</td>
                  <td style="padding:4px 0; font-size:14px; font-weight:600; text-align:right;">${data.supplierName}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0; font-size:14px; color:#495057;">NIT</td>
                  <td style="padding:4px 0; font-size:14px; font-weight:600; text-align:right;">${data.supplierNit}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0; font-size:14px; color:#495057;">Teléfono</td>
                  <td style="padding:4px 0; font-size:14px; font-weight:600; text-align:right;">${data.supplierPhone}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0; font-size:14px; color:#495057;">Correo</td>
                  <td style="padding:4px 0; font-size:14px; font-weight:600; text-align:right;">${data.supplierEmail}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Attachments notice -->
          <tr>
            <td style="padding:0 32px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #dee2e6;">
                <tr>
                  <td style="padding:16px 0 0;">
                    <p style="margin:0 0 8px; font-size:13px; font-weight:600; color:#495057;">Archivos adjuntos:</p>
                    ${hasXml ? `<p style="margin:0 0 4px; font-size:13px; color:#6c757d; line-height:1.5;">&#8226; <strong>XML</strong> &mdash; Documento electrónico de la factura (UBL 2.1)</p>` : ''}
                    ${hasPdf ? `<p style="margin:0; font-size:13px; color:#6c757d; line-height:1.5;">&#8226; <strong>PDF</strong> &mdash; Representación gráfica de la factura</p>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f9fa; padding:20px 32px; text-align:center; border-top:1px solid #dee2e6;">
              <p style="margin:0 0 6px; font-size:12px; color:#495057; line-height:1.5;">
                Este correo contiene un <strong>documento electrónico con validez tributaria</strong>
                respaldado por la DIAN.
              </p>
              <p style="margin:0 0 12px; font-size:11px; color:#6c757d; line-height:1.5;">
                Puede consultar el estado del documento en el catálogo de la DIAN:<br />
                <a href="https://catalogo-vpfe.dian.gov.co" target="_blank" rel="noopener noreferrer" style="color:#e94560; text-decoration:underline;">
                  https://catalogo-vpfe.dian.gov.co
                </a>
              </p>
              <p style="margin:0; font-size:10px; color:#adb5bd; line-height:1.5;">
                Si no solicitó esta factura, por favor ignore este mensaje.
              </p>
            </td>
          </tr>

        </table>
        <!-- End main card -->
      </td>
    </tr>
  </table>
  <!-- End outer wrapper -->
</body>
</html>`
}

// ─── SMTP Configuration ─────────────────────────────────────────────────────

/**
 * Read SMTP configuration from environment variables.
 * Returns null if SMTP_HOST is not configured.
 */
export function getSmtpConfig(): EmailConfig | null {
  const host = process.env.SMTP_HOST

  if (!host) {
    return null
  }

  const port = parseInt(process.env.SMTP_PORT ?? '587', 10)
  const secure = (process.env.SMTP_SECURE ?? 'false').toLowerCase() === 'true'
  const user = process.env.SMTP_USER ?? ''
  const pass = process.env.SMTP_PASS ?? ''
  const from = process.env.SMTP_FROM ?? 'facturacion@localhost'
  const fromName = process.env.SMTP_FROM_NAME ?? 'Facturación'

  return {
    host,
    port: isNaN(port) ? 587 : port,
    secure,
    user,
    pass,
    from,
    fromName,
  }
}

// ─── Transporter ────────────────────────────────────────────────────────────

/**
 * Create a nodemailer Transporter from the given SMTP configuration.
 */
export function createTransport(config: EmailConfig): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  })
}

// ─── Test SMTP Connection ───────────────────────────────────────────────────

/**
 * Verify that the SMTP connection is working.
 * Calls transporter.verify() and returns a success/error result.
 */
export async function testSmtpConnection(
  config: EmailConfig,
): Promise<{ success: boolean; error?: string }> {
  try {
    const transporter = createTransport(config)
    await transporter.verify()
    return { success: true }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err)
    console.error('[email-sender] Error al verificar conexión SMTP:', message)
    return {
      success: false,
      error: `No se pudo establecer conexión con el servidor SMTP: ${message}`,
    }
  }
}

// ─── Send Invoice Email ─────────────────────────────────────────────────────

/**
 * Send an electronic invoice email with XML and PDF attachments.
 *
 * Reads SMTP config from environment variables via getSmtpConfig().
 * Returns success with messageId, or a descriptive Spanish error.
 */
export async function sendInvoiceEmail(
  data: InvoiceEmailData,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  // 1. Obtain SMTP configuration
  const config = getSmtpConfig()

  if (!config) {
    return {
      success: false,
      error:
        'SMTP no configurado. Configure las variables de entorno SMTP_HOST, SMTP_USER, SMTP_PASS.',
    }
  }

  // 2. Validate recipient email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!data.to || !emailRegex.test(data.to)) {
    console.error(
      '[email-sender] Correo de destinatario inválido:',
      data.to,
    )
    return {
      success: false,
      error: `El correo del destinatario no es válido: "${data.to}". Verifique la dirección e intente nuevamente.`,
    }
  }

  try {
    const transporter = createTransport(config)

    // Build the from header
    const fromName = config.fromName ?? 'Facturación'
    // If config.from already includes angle brackets, use as-is; otherwise wrap it
    let fromHeader: string
    if (config.from.includes('<') && config.from.includes('>')) {
      fromHeader = `${fromName} ${config.from}`
    } else {
      fromHeader = `"${fromName}" <${config.from}>`
    }

    // 3. Build attachments array
    const attachments: Array<{
      filename: string
      content: string | Buffer
      contentType: string
    }> = []

    if (data.xmlContent) {
      attachments.push({
        filename: `${data.invoiceNumber}.xml`,
        content: data.xmlContent,
        contentType: 'application/xml',
      })
    }

    if (data.pdfBuffer) {
      attachments.push({
        filename: `${data.invoiceNumber}.pdf`,
        content: data.pdfBuffer,
        contentType: 'application/pdf',
      })
    }

    // 4. Build email message
    const mailOptions: nodemailer.SendMailOptions = {
      from: fromHeader,
      to: data.to,
      subject: `Factura Electrónica #${data.invoiceNumber}`,
      html: buildEmailHTML(data),
      attachments,
    }

    // 5. Send the email
    const info = await transporter.sendMail(mailOptions)

    return {
      success: true,
      messageId: info.messageId,
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err)
    console.error('[email-sender] Error al enviar factura por correo:', message)

    // Provide a descriptive Spanish error based on common failure types
    if (message.toLowerCase().includes('auth') || message.toLowerCase().includes('login')) {
      return {
        success: false,
        error: `Error de autenticación SMTP: verifique el usuario y la contraseña del servidor de correo. Detalle: ${message}`,
      }
    }

    if (message.toLowerCase().includes('enotfound') || message.toLowerCase().includes('econnrefused') || message.toLowerCase().includes('timeout')) {
      return {
        success: false,
        error: `No se pudo conectar al servidor de correo SMTP (${config.host}:${config.port}). Verifique la configuración de red. Detalle: ${message}`,
      }
    }

    if (message.toLowerCase().includes('attachment') || message.toLowerCase().includes('file')) {
      return {
        success: false,
        error: `Error al adjuntar los archivos de la factura. Verifique que los archivos XML y PDF sean válidos. Detalle: ${message}`,
      }
    }

    if (message.toLowerCase().includes('invalid') && message.toLowerCase().includes('email')) {
      return {
        success: false,
        error: `La dirección de correo electrónico del destinatario no es válida: "${data.to}". Detalle: ${message}`,
      }
    }

    return {
      success: false,
      error: `Error inesperado al enviar la factura por correo electrónico: ${message}`,
    }
  }
}
