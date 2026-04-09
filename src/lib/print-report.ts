/**
 * Opens a printable report in a new browser window.
 * The window stays within the same browser tab.
 */

interface PrintRow {
  [key: string]: string | number | null | undefined
}

interface PrintOptions {
  title: string
  subtitle?: string
  headers: string[]
  rows: PrintRow[][]
  columnAligns?: ('left' | 'center' | 'right')[]
  columnWidths?: string[]
  footer?: string
  orientation?: 'landscape' | 'portrait'
}

export function printReport({
  title,
  subtitle,
  headers,
  rows,
  columnAligns,
  columnWidths,
  footer,
  orientation = 'landscape',
}: PrintOptions) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const thAlign = (i: number) => {
    if (columnAligns?.[i]) return columnAligns[i]
    const val = columnWidths?.[i] || ''
    if (/^\d+px$/.test(val) && parseInt(val) <= 80) return 'center'
    return 'left'
  }

  const tdAlign = (i: number, cell: string | number | null | undefined) => {
    if (columnAligns?.[i]) return columnAligns[i]
    if (typeof cell === 'number') return 'right'
    return 'left'
  }

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    @page {
      margin: 15mm 10mm;
      size: ${orientation};
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      font-size: 11px;
      color: #1a1a1a;
      padding: 10px 20px;
    }
    .header {
      text-align: center;
      margin-bottom: 20px;
      border-bottom: 2px solid #333;
      padding-bottom: 12px;
    }
    .header h1 {
      font-size: 18px;
      font-weight: 700;
      color: #111;
      margin-bottom: 4px;
    }
    .header .subtitle {
      font-size: 12px;
      color: #555;
    }
    .header .date {
      font-size: 10px;
      color: #888;
      margin-top: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    thead th {
      background: #333;
      color: #fff;
      font-weight: 600;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      padding: 8px 6px;
      text-align: left;
      border: 1px solid #222;
    }
    thead th.right { text-align: right; }
    thead th.center { text-align: center; }
    tbody td {
      padding: 6px;
      border: 1px solid #ddd;
      font-size: 10px;
      vertical-align: top;
    }
    tbody td.right { text-align: right; }
    tbody td.center { text-align: center; }
    tbody tr:nth-child(even) {
      background: #f9f9f9;
    }
    tbody tr:hover {
      background: #f0f0f0;
    }
    .footer {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px solid #ccc;
      text-align: center;
      font-size: 9px;
      color: #999;
    }
    .footer .total-row {
      text-align: right;
      font-size: 11px;
      font-weight: 600;
      color: #333;
      margin-top: 8px;
    }
    @media print {
      .no-print { display: none; }
      body { padding: 0; }
    }
    .print-btn {
      display: inline-block;
      margin: 0 8px 20px;
      padding: 10px 24px;
      background: #333;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
    }
    .print-btn:hover { background: #555; }
    .print-btn.primary { background: #16a34a; }
    .print-btn.primary:hover { background: #15803d; }
  </style>
</head>
<body>
  <div class="no-print" style="text-align:center; padding: 20px 0;">
    <button class="print-btn" onclick="window.print()">
      🖨️ Imprimir Reporte
    </button>
  </div>

  <div class="header">
    <h1>${title}</h1>
    ${subtitle ? `<p class="subtitle">${subtitle}</p>` : ''}
    <p class="date">Generado: ${dateStr}</p>
  </div>

  <table>
    <thead>
      <tr>
        ${headers.map((h, i) => `<th class="${thAlign(i)}" style="${columnWidths?.[i] ? `width: ${columnWidths[i]};` : ''}">${h}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${rows.map((row) => `
        <tr>
          ${row.map((cell, i) => `<td class="${tdAlign(i, cell)}">${cell ?? ''}</td>`).join('')}
        </tr>
      `).join('')}
    </tbody>
  </table>

  ${footer ? `<div class="footer">${footer}</div>` : ''}
</body>
</html>`

  const printWindow = window.open('', '_blank', 'width=1024,height=700')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
  }
}

/**
 * Opens a thermal 80mm printer receipt in a new browser window.
 * Optimized for small POS thermal printers (72mm printable width).
 */
export function printThermal80mm(options: {
  title: string
  subtitle?: string
  lines: { left: string; right?: string; bold?: boolean; separator?: boolean }[]
  footer?: string
}) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title}</title>
  <style>
    @page {
      margin: 0;
      size: 80mm auto;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', 'Lucida Console', monospace;
      font-size: 9px;
      color: #000;
      width: 72mm;
      margin: 0 auto;
      padding: 4mm 2mm;
    }
    .center { text-align: center; }
    .right { text-align: right; }
    .bold { font-weight: bold; font-size: 10px; }
    .title {
      font-size: 12px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .subtitle {
      font-size: 8px;
      color: #444;
      margin-top: 2px;
    }
    .separator {
      border: none;
      border-top: 1px dashed #333;
      margin: 4px 0;
    }
    .line {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 1px 0;
      font-size: 8px;
      line-height: 1.3;
    }
    .line .left { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .line .right { flex-shrink: 0; margin-left: 4px; text-align: right; font-weight: bold; }
    .line .right.normal { font-weight: normal; }
    .line.bold .left, .line.bold .right { font-weight: bold; font-size: 9px; }
    .line.total {
      font-size: 10px;
      font-weight: bold;
      padding: 3px 0;
      border-top: 1px solid #000;
      margin-top: 3px;
    }
    .header-section {
      text-align: center;
      margin-bottom: 6px;
    }
    .date-section {
      text-align: center;
      font-size: 8px;
      color: #555;
      margin-bottom: 6px;
    }
    .footer-section {
      text-align: center;
      margin-top: 8px;
      font-size: 7px;
      color: #666;
    }
    @media print {
      .no-print { display: none !important; }
      body { padding: 0; }
    }
    .print-btn {
      display: block;
      margin: 10px auto;
      padding: 12px 32px;
      background: #16a34a;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
    }
    .print-btn:hover { background: #15803d; }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="print-btn" onclick="window.print()">
      🖨️ Imprimir en Térmica 80mm
    </button>
    <p style="text-align:center; font-size:10px; color:#888; margin-bottom:10px;">
      Selecciona "80mm" o "Recibo" en el diálogo de impresión
    </p>
  </div>

  <div class="header-section">
    <div class="title">${options.title}</div>
    ${options.subtitle ? `<div class="subtitle">${options.subtitle}</div>` : ''}
  </div>

  <div class="date-section">${dateStr}</div>

  <hr class="separator">

  ${options.lines.map((line) => {
    if (line.separator) return '<hr class="separator">'
    return `<div class="line${line.bold ? ' bold' : ''}">
      <span class="left">${line.left}</span>
      ${line.right !== undefined ? `<span class="right${line.bold ? '' : ' normal'}">${line.right}</span>` : ''}
    </div>`
  }).join('\n')}

  <hr class="separator">

  ${options.footer ? `<div class="footer-section">${options.footer}</div>` : ''}
</body>
</html>`

  const printWindow = window.open('', '_blank', 'width=350,height=600')
  if (printWindow) {
    printWindow.document.write(html)
    printWindow.document.close()
  }
}
