import { type ExportColumn, exportToCsv, exportToExcel } from '../../utils/exportData'
import { Button } from '../ui'

interface ExportButtonsProps<T> {
  filename: string
  data: T[] | undefined
  columns: ExportColumn<T>[]
}

/** Two small buttons that export the given tabular data as CSV or Excel (.xlsx). */
export function ExportButtons<T>({ filename, data, columns }: ExportButtonsProps<T>) {
  const disabled = !data || data.length === 0

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" disabled={disabled} onClick={() => data && exportToCsv(filename, data, columns)}>
        Export CSV
      </Button>
      <Button variant="secondary" size="sm" disabled={disabled} onClick={() => data && exportToExcel(filename, data, columns)}>
        Export Excel
      </Button>
    </div>
  )
}
