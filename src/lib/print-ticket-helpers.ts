// ─── Print Ticket Helpers ─────────────────────────────────────────────────────
// Shared utility functions and constants for thermal receipt printing

export function fmt(amount: number, currencyCode: string): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function fmtDate(isoDate: string): string {
  const d = new Date(isoDate)
  return d.toLocaleString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

// ─── Shared thermal styles ────────────────────────────────────────────────────

export const THERMAL_STYLE = `
  @page { margin: 0; size: 80mm auto; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Courier New', 'Lucida Console', monospace;
    font-size: 11px;
    line-height: 1.35;
    width: 72mm;
    max-width: 280px;
    padding: 4mm 3mm;
    color: #111;
    background: #fff;
  }
  .header {
    text-align: center;
    padding-bottom: 6px;
    border-bottom: 2px solid #111;
    margin-bottom: 6px;
  }
  .store-name {
    font-size: 15px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 2px;
  }
  .store-subtitle {
    font-size: 9px;
    letter-spacing: 0.5px;
    color: #555;
    margin-bottom: 4px;
  }
  .store-detail {
    font-size: 10px;
    color: #333;
    margin: 1px 0;
  }
  .title {
    text-align: center;
    font-size: 13px;
    font-weight: bold;
    letter-spacing: 1px;
    margin: 6px 0;
    padding: 3px 0;
  }
  .row {
    display: flex;
    justify-content: space-between;
    padding: 1px 0;
    font-size: 11px;
  }
  .row span:first-child { color: #555; }
  .row span:last-child { font-weight: 600; text-align: right; }
  .dashed { border: none; border-top: 1px dashed #999; margin: 4px 0; }
  .solid { border: none; border-top: 2px solid #111; margin: 4px 0; }
  .section-title {
    font-size: 10px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #999;
    padding-bottom: 2px;
    margin-bottom: 2px;
    color: #555;
  }
  .table-row {
    display: flex;
    padding: 1px 0;
    font-size: 10px;
  }
  .table-header {
    font-weight: bold;
    text-transform: uppercase;
    font-size: 9px;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #999;
    padding-bottom: 2px;
    margin-bottom: 2px;
    color: #555;
  }
  .footer {
    text-align: center;
    padding-top: 6px;
  }
  .footer-msg {
    font-size: 10px;
    color: #555;
    margin: 2px 0;
  }
  .footer-brand {
    font-size: 8px;
    color: #bbb;
    margin-top: 4px;
    letter-spacing: 0.5px;
  }
  .notes {
    font-size: 10px;
    color: #666;
    font-style: italic;
    padding: 4px 0;
    border-bottom: 1px dashed #ccc;
    margin-bottom: 4px;
  }
  @media print { body { padding: 2mm; } }
`

export function openPrintWindow(title: string, body: string) {
  const win = window.open('', '_blank', 'width=400,height=700')
  if (!win) {
    alert('Permite las ventanas emergentes para imprimir')
    return
  }
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><style>${THERMAL_STYLE}</style></head><body>${body}<script>window.onload=function(){window.print();}</script></body></html>`
  win.document.write(html)
  win.document.close()
}
