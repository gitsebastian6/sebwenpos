import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireStoreAccess } from '@/lib/api-auth'
import { formatInvoiceNumber, getAppBaseUrl } from '@/lib/invoice-utils'
import QRCode from 'qrcode'

export const dynamic = 'force-dynamic'

const fmt = (n: number, cur = 'COP') =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: cur, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)

const returnCodeLabels: Record<string, string> = {
  '01': 'Devolución Parcial', '02': 'Anulación', '03': 'Descuento', '04': 'Bonificación', '05': 'Ajuste',
}

// ─── GET: Generar HTML para PDF de Nota Crédito ──────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const storeId = Number(searchParams.get('storeId'))

    if (!storeId) {
      return NextResponse.json({ error: 'storeId es requerido' }, { status: 400 })
    }

    const authError = requireStoreAccess(request, storeId)
    if (authError) return authError

    const creditNote = await db.creditNote.findFirst({
      where: { id: Number(id), storeId },
      include: {
        store: true,
        invoice: { select: { prefix: true, consecutive: true } },
      },
    })

    if (!creditNote) {
      return NextResponse.json({ error: 'Nota crédito no encontrada' }, { status: 404 })
    }

    const store = creditNote.store
    const createdAt = creditNote.createdAt
    const items: Array<{ productName?: string; quantity: number; unitPrice: number }> = JSON.parse(creditNote.items || '[]')
    const taxBreakdown: Array<{ code: string; rate: number; amount: number }> = JSON.parse(creditNote.taxBreakdown || '[]')
    const cnNumber = formatInvoiceNumber(creditNote.prefix, creditNote.consecutive)
    const invNumber = formatInvoiceNumber(creditNote.invoice?.prefix ?? '', creditNote.invoice?.consecutive ?? 0)

    // Generate QR code as inline data URL for DIAN validation
    let qrDataUrl = ''
    if (creditNote.cufe) {
      // QR usa nuestra página intermedia que copia el CUDE y redirige a la DIAN
      const appBaseUrl = getAppBaseUrl(request)
      if (appBaseUrl) {
        const redirectUrl = `${appBaseUrl}/dian-redirect?cufe=${encodeURIComponent(creditNote.cufe)}&test=${creditNote.testMode ? 'true' : 'false'}`
        qrDataUrl = await QRCode.toDataURL(redirectUrl, { type: 'image/png', width: 200, margin: 1 })
      } else {
        // Fallback: ir directamente a la DIAN
        const dianBaseUrl = creditNote.testMode
          ? 'https://catalogo-vpfe-hab.dian.gov.co'
          : 'https://catalogo-vpfe.dian.gov.co'
        qrDataUrl = await QRCode.toDataURL(`${dianBaseUrl}/User/SearchDocument`, { type: 'image/png', width: 200, margin: 1 })
      }
    }

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Nota Crédito ${cnNumber}</title>
<style>
@page{margin:12mm 10mm;size:A4}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1a1a1a;line-height:1.4}
.page{max-width:210mm;margin:0 auto;padding:10mm}
.accent-bar{height:5px;background:linear-gradient(90deg,#ea580c,#f97316);margin-bottom:10px;border-radius:3px}
.header{text-align:center;margin-bottom:14px}
.supplier-name{font-size:18px;font-weight:800;letter-spacing:1px;color:#0f172a;text-transform:uppercase}
.supplier-legal{font-size:9px;color:#64748b;margin-top:1px}
.supplier-info{font-size:9px;color:#475569;margin-top:2px}
.section{margin-bottom:12px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden}
.section-title{background:#f1f5f9;font-weight:700;font-size:10px;padding:6px 10px;letter-spacing:0.5px;text-transform:uppercase;color:#334155}
.section-body{padding:8px 10px}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.field{margin-bottom:4px}.field-label{font-size:8px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.3px}.field-value{font-size:10px;font-weight:600}
.inv-number{text-align:center;font-size:20px;font-weight:800;color:#0f172a;padding:6px 0;letter-spacing:1px}
.invoice-ref{background:#fef3c7;border:2px solid #fbbf24;border-radius:8px;padding:10px;text-align:center;margin-bottom:12px}
.invoice-ref-label{font-size:8px;color:#92400e;text-transform:uppercase;font-weight:700;letter-spacing:1px}
.invoice-ref-value{font-size:16px;font-weight:800;color:#0f172a;margin-top:2px}
.return-info{background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:10px;margin-bottom:12px}
.return-info-label{font-size:8px;color:#9a3412;text-transform:uppercase;font-weight:700;letter-spacing:0.5px}
table{width:100%;border-collapse:collapse;font-size:9.5px}
th{background:#f8fafc;font-weight:700;text-align:left;padding:6px 8px;border-bottom:2px solid #cbd5e1;font-size:8.5px;text-transform:uppercase;letter-spacing:0.3px;color:#475569}
td{padding:5px 8px;border-bottom:1px solid #f1f5f9}
tr:nth-child(even) td{background:#fafbfc}
.text-right{text-align:right}.text-center{text-align:center}
.total-final{display:flex;justify-content:space-between;padding:8px 10px;background:#dc2626;color:#fff;border-radius:6px;font-size:14px;font-weight:800;margin-top:8px}
.cufe-box{background:#f8fafc;border:1px dashed #94a3b8;border-radius:6px;padding:10px;text-align:center;margin-top:12px}
.cufe-label{font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700}
.cufe-value{font-size:7.5px;color:#475569;word-break:break-all;margin-top:4px;font-family:'Courier New',monospace;line-height:1.4}
.qr-container img{width:120px;height:120px;display:inline-block;}
.dian-status{margin-top:10px;padding:8px 12px;border-radius:6px;text-align:center;font-size:10px;font-weight:600}
.status-draft{background:#f1f5f9;color:#475569;border:1px solid #cbd5e1}
.footer-text{margin-top:14px;text-align:center;font-size:8px;color:#94a3b8}
.test-badge{display:inline-block;background:#fef3c7;color:#92400e;font-size:8px;font-weight:700;padding:2px 8px;border-radius:99px;border:1px solid #fcd34d}
</style>
</head><body>
<div class="page">
  <div class="accent-bar"></div>

  <div class="header">
    <div class="supplier-name">${store.name || store.legalName || 'NEGOCIO'}</div>
    ${store.legalName && store.legalName !== store.name ? `<div class="supplier-legal">${store.legalName}</div>` : ''}
    <div class="supplier-info">NIT: ${store.nit || '—'} ${store.address ? '· ' + store.address : ''} ${store.phone ? '· Tel: ' + store.phone : ''}</div>
  </div>

  <div class="inv-number" style="color:#ea580c">NOTA CRÉDITO ELECTRÓNICA<br><span style="font-size:14px;color:#334155">${cnNumber}</span></div>

  <div class="invoice-ref">
    <div class="invoice-ref-label">Factura Afectada</div>
    <div class="invoice-ref-value">${invNumber}</div>
  </div>

  <div class="return-info">
    <div class="return-info-label">Concepto de Devolución</div>
    <div style="font-size:12px;font-weight:700;color:#0f172a;margin-top:2px">${returnCodeLabels[creditNote.returnCode] || creditNote.returnCode || 'Devolución'}</div>
    ${creditNote.reason ? `<div style="font-size:10px;color:#9a3412;margin-top:2px">${creditNote.reason}</div>` : ''}
  </div>

  <div class="section">
    <div class="section-title">Información de la Nota Crédito</div>
    <div class="section-body">
      <div class="two-col">
        <div><div class="field"><div class="field-label">Fecha de Emisión</div><div class="field-value">${createdAt.toISOString().slice(0,10)}</div></div></div>
        <div><div class="field"><div class="field-label">Hora</div><div class="field-value">${String(createdAt.getHours()).padStart(2,'0')}:${String(createdAt.getMinutes()).padStart(2,'0')}</div></div></div>
        <div><div class="field"><div class="field-label">Resolución DIAN</div><div class="field-value">${creditNote.resolutionNumber || 'N/A'}</div></div></div>
        <div><div class="field"><div class="field-label">Rango Autorizado</div><div class="field-value">${creditNote.prefix}${creditNote.startNumber || 1} al ${creditNote.prefix}${creditNote.endNumber || 99999}</div></div></div>
      </div>
      ${creditNote.testMode ? '<div style="margin-top:6px"><span class="test-badge">MODO PRUEBA</span></div>' : ''}
    </div>
  </div>

  <div class="two-col">
    <div class="section">
      <div class="section-title">Datos del Emisor</div>
      <div class="section-body">
        <div class="field"><div class="field-label">Razón Social</div><div class="field-value">${creditNote.supplierName || store.legalName || store.name || '—'}</div></div>
        <div class="field"><div class="field-label">NIT</div><div class="field-value">${creditNote.supplierNit || store.nit || '—'}</div></div>
        <div class="field"><div class="field-label">Dirección</div><div class="field-value">${creditNote.supplierAddress || store.address || '—'}</div></div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Datos del Receptor</div>
      <div class="section-body">
        <div class="field"><div class="field-label">Nombre / Razón Social</div><div class="field-value">${creditNote.customerName || 'Consumidor Final'}</div></div>
        <div class="field"><div class="field-label">NIT / CC</div><div class="field-value">${creditNote.customerNit || '222.222.222-222'}</div></div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Items Devueltos</div>
    <div class="section-body" style="padding:0">
      <table>
        <thead><tr><th>#</th><th>Descripción</th><th class="text-center">Cant.</th><th class="text-right">P. Unitario</th><th class="text-right">Total</th></tr></thead>
        <tbody>${items.map((i, idx) => `<tr><td>${idx + 1}</td><td>${i.productName || 'Producto'}</td><td class="text-center">${i.quantity}</td><td class="text-right">${fmt(i.unitPrice)}</td><td class="text-right">${fmt(i.unitPrice * i.quantity)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Totales</div>
    <div class="section-body">
      <div class="total-row" style="display:flex;justify-content:space-between;padding:3px 0"><span>Subtotal Base</span><span>${fmt(Number(creditNote.subtotalBase))}</span></div>
      ${taxBreakdown.length > 0 ? taxBreakdown.map(t => `<div class="total-row" style="display:flex;justify-content:space-between;padding:3px 0"><span>IVA (${t.rate}%)</span><span>-${fmt(t.amount)}</span></div>`).join('') : ''}
      <div class="total-final" style="background:#dc2626"><span>TOTAL NOTA CRÉDITO</span><span>-${fmt(Number(creditNote.grandTotal))}</span></div>
    </div>
  </div>

  ${creditNote.cufe ? `<div class="cufe-box">
    <div class="cufe-label">CUDE — Código Único de Documento Electrónico</div>
    <div class="cufe-value">${creditNote.cufe}</div>
    ${qrDataUrl ? `<div class="qr-container" style="text-align:center;margin-top:8px;"><img src="${qrDataUrl}" alt="QR DIAN" style="width:120px;height:120px;" /></div>` : ''}
    <div style="font-size:7px;color:#94a3b8;margin-top:4px">Escanee el QR para buscar la nota crédito en la DIAN</div>
  </div>` : '<div style="text-align:center;padding:10px;color:#94a3b8;font-size:9px;">Sin CUDE</div>'}

  <div class="dian-status status-draft">
    ● NOTA CRÉDITO ELECTRÓNICA — ${creditNote.testMode ? 'MODO PRUEBA' : 'PENDIENTE DE ENVÍO A DIAN'}
  </div>

  <div class="footer-text">
    Representación gráfica de la nota crédito electrónica<br>
    Generada por VIVA POS — ${new Date().toLocaleDateString('es-CO')}
  </div>
</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="NotaCredito_${cnNumber}.html"`,
      },
    })
  } catch (error) {
    console.error('GET /api/credit-notes/[id]/pdf error:', error)
    return NextResponse.json(
      { error: 'Error al generar el PDF de la nota crédito', detail: String(error) },
      { status: 500 },
    )
  }
}
