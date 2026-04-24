import nodemailer from 'nodemailer'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EmailConfig {
  host: string          // SMTP host
  port: number          // SMTP port (587, 465)
  secure: boolean       // true for 465, false for 587
  user: string          // SMTP username
  pass: string          // SMTP password
  fromName: string      // "Bar La Terraza"
  fromEmail: string     // "facturacion@barlaterraza.com"
}

export interface InvoiceEmailData {
  to: string              // Customer email
  customerName: string
  invoiceNumber: string   // "FE-00000001"
  grandTotal: number      // In COP
  issueDate: string       // YYYY-MM-DD
  currencyCode: string
  xmlContent: string      // XML string
  pdfBuffer: Buffer       // PDF bytes
  qrCodeURL: string
  storeName: string
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  error?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Format number as COP currency string.
 */
function formatCOP(value: number): string {
  const rounded = Math.round(value)
  const withDots = rounded.toLocaleString('es-CO')
  return `$${withDots}`
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
 * Build the HTML email body for the invoice notification.
 */
function buildHTMLBody(data: InvoiceEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: Arial, Helvetica, sans-serif;
      background-color: #f4f4f7;
      color: #1a1a2e;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .header {
      background-color: #1a1a2e;
      color: #ffffff;
      padding: 24px 32px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }
    .header p {
      margin: 6px 0 0;
      font-size: 13px;
      opacity: 0.85;
    }
    .body {
      padding: 28px 32px;
    }
    .greeting {
      font-size: 15px;
      margin-bottom: 20px;
    }
    .summary-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    .summary-table td {
      padding: 10px 12px;
      font-size: 14px;
      border-bottom: 1px solid #dee2e6;
    }
    .summary-table .label {
      color: #6c757d;
      font-weight: 400;
    }
    .summary-table .value {
      text-align: right;
      font-weight: 600;
    }
    .summary-table .total-row td {
      border-top: 2px solid #e94560;
      border-bottom: none;
      padding-top: 14px;
      font-size: 18px;
      color: #e94560;
      font-weight: 700;
    }
    .verify-btn {
      display: inline-block;
      background-color: #e94560;
      color: #ffffff;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      margin: 8px 0 24px;
    }
    .attachments-notice {
      font-size: 13px;
      color: #6c757d;
      border-top: 1px solid #dee2e6;
      padding-top: 16px;
      line-height: 1.6;
    }
    .footer {
      background-color: #f8f9fa;
      padding: 16px 32px;
      text-align: center;
      font-size: 11px;
      color: #6c757d;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${data.storeName}</h1>
      <p>Factura Electrónica de Venta</p>
    </div>
    <div class="body">
      <p class="greeting">Estimado/a <strong>${data.customerName}</strong>,</p>
      <p style="font-size:14px; margin-bottom:20px;">
        Adjuntamos la factura electrónica correspondiente a su compra.
        A continuación encontrará el resumen de la transacción.
      </p>
      <table class="summary-table">
        <tr>
          <td class="label">Factura</td>
          <td class="value">${data.invoiceNumber}</td>
        </tr>
        <tr>
          <td class="label">Fecha</td>
          <td class="value">${formatDate(data.issueDate)}</td>
        </tr>
        <tr>
          <td class="label">Moneda</td>
          <td class="value">${data.currencyCode}</td>
        </tr>
        <tr class="total-row">
          <td class="label">Total</td>
          <td class="value">${formatCOP(data.grandTotal)}</td>
        </tr>
      </table>
      <div style="text-align: center;">
        <a href="${data.qrCodeURL}" target="_blank" class="verify-btn">
          Verificar Autenticidad en la DIAN
        </a>
      </div>
      <div class="attachments-notice">
        <strong>Archivos adjuntos:</strong><br />
        &bull; <strong>XML</strong> — Archivo electrónico de la factura (UBL 2.1)<br />
        &bull; <strong>PDF</strong> — Representación gráfica de la factura
      </div>
    </div>
    <div class="footer">
      Este correo fue enviado automáticamente por ${data.storeName}.<br />
      Si no solicitó esta factura, por favor ignore este mensaje.
    </div>
  </div>
</body>
</html>
  `.trim()
}

// ─── Main Functions ─────────────────────────────────────────────────────────

/**
 * Send an invoice email with XML and PDF attachments.
 *
 * @param config  SMTP configuration
 * @param data    Invoice data for the email
 * @returns       Result with messageId on success, or error string
 */
export async function sendInvoiceEmail(
  config: EmailConfig,
  data: InvoiceEmailData,
): Promise<SendEmailResult> {
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    })

    const subject = `Factura Electrónica #${data.invoiceNumber}`

    const info = await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: data.to,
      subject,
      html: buildHTMLBody(data),
      attachments: [
        {
          filename: `factura_${data.invoiceNumber}.xml`,
          content: data.xmlContent,
          contentType: 'application/xml',
        },
        {
          filename: `factura_${data.invoiceNumber}.pdf`,
          content: data.pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    })

    return {
      success: true,
      messageId: info.messageId,
    }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Create a test transporter using Ethereal Email.
 * Useful for development and testing — returns an EtherealEmail transport.
 *
 * Call `nodemailer.createTestAccount()` to generate credentials first,
 * then pass them to the returned transporter.
 */
export async function createTestTransport(): Promise<{
  transporter: nodemailer.Transporter
  account: { user: string; pass: string; smtp: { host: string; port: number; secure: boolean }; web: string }
}> {
  const account = await nodemailer.createTestAccount()
  const transporter = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: {
      user: account.user,
      pass: account.pass,
    },
  })
  return {
    transporter,
    account: {
      user: account.user,
      pass: account.pass,
      smtp: account.smtp,
      web: (nodemailer.getTestMessageUrl({} as nodemailer.SentMessageInfo) as string) || '',
    },
  }
}
