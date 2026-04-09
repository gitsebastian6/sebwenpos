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
  columnWidths?: string[]
  footer?: string
}

export function printReport({
  title,
  subtitle,
  headers,
  rows,
  columnWidths,
  footer,
}: PrintOptions) {
  const colWidthStyle = columnWidths
    ? columnWidths.map((w) => `width: ${w};`).join('')
    : ''

  const now = new Date()
  const dateStr = now.toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    @page {
      margin: 15mm 10mm;
      size: landscape;
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
      display: block;
      margin: 0 auto 20px;
      padding: 10px 32px;
      background: #333;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
    }
    .print-btn:hover { background: #555; }
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
        ${headers.map((h, i) => {
          let cls = ''
          if (i >= 1 && [
            ...headers.slice(0, -1).map((_, j) => j),
          ].filter((_, j) => {
            const lastNum = headers.length - 1
            return j === lastNum
          }).length > 0 && i === headers.length - 1) cls = 'right'
          return `<th${cls ? ` class="${cls}"` : ''} style="${columnWidths?.[i] ? `width: ${columnWidths[i]};` : ''}">${h}</th>`
        }).join('')}
      </tr>
    </thead>
    <tbody>
      ${rows.map((row) => `
        <tr>
          ${row.map((cell, i) => {
            const isLast = i === row.length - 1
            const isNumeric = typeof cell === 'number'
            const cls = (isLast || isNumeric) ? 'right' : ''
            return `<td class="${cls}">${cell ?? ''}</td>`
          }).join('')}
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
