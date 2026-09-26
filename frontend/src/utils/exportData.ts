import * as XLSX from 'xlsx'

export interface ExportColumn<T> {
  header: string
  accessor: (row: T) => string | number | null | undefined
}

function toRows<T>(data: T[], columns: ExportColumn<T>[]): (string | number)[][] {
  const header = columns.map((c) => c.header)
  const body = data.map((row) => columns.map((c) => c.accessor(row) ?? ''))
  return [header, ...body]
}

function csvEscape(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Exports `data` as a CSV file, using `columns` to pick and label fields. */
export function exportToCsv<T>(filename: string, data: T[], columns: ExportColumn<T>[]): void {
  const rows = toRows(data, columns)
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n')
  downloadBlob(`${filename}.csv`, new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
}

/** Exports `data` as a genuine .xlsx workbook, using `columns` to pick and label fields. */
export function exportToExcel<T>(filename: string, data: T[], columns: ExportColumn<T>[]): void {
  const rows = toRows(data, columns)
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Report')
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  downloadBlob(`${filename}.xlsx`, new Blob([buffer], { type: 'application/octet-stream' }))
}
