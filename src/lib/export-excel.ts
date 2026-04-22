import * as XLSX from 'xlsx'

export function exportToExcel(options: {
  filename: string
  sheetName: string
  headers: string[]
  rows: (string | number)[][]
  columnWidths?: number[]
}) {
  const wb = XLSX.utils.book_new()
  const wsData = [options.headers, ...options.rows]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  if (options.columnWidths) {
    ws['!cols'] = options.columnWidths.map(w => ({ wch: w }))
  }
  XLSX.utils.book_append_sheet(wb, ws, options.sheetName)
  XLSX.writeFile(wb, `${options.filename}.xlsx`)
}
