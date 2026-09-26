import type { DiningTable, Order } from '../../types/api'
import { Modal } from '../ui'
import { OrderBuilderBody } from './OrderBuilderBody'

interface Props {
  open: boolean
  table: DiningTable | null
  onClose: () => void
  onCreated: (order: Order) => void
}

/** Seating a party at a specific table is inherently tied to that table (picked on the
 * floor plan), so it stays a modal reached from the table itself rather than a generic
 * sidebar page. Standalone takeaway/delivery orders live at their own sidebar page
 * (NewTakeawayOrderPage), which renders the same OrderBuilderBody with table=null.
 */
export function OrderBuilder({ open, table, onClose, onCreated }: Props) {
  return (
    <Modal open={open} title={table ? `New order · Table ${table.TableNumber}` : 'New order'} onClose={onClose} size="xl">
      <OrderBuilderBody table={table} onCreated={onCreated} />
    </Modal>
  )
}
