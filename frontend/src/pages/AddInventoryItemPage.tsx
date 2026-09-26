import { useNavigate } from 'react-router-dom'
import { InventoryItemForm } from '../components/inventory/InventoryItemForm'
import { PageHeader } from '../components/layout/AppLayout'

export function AddInventoryItemPage() {
  const navigate = useNavigate()
  return (
    <>
      <PageHeader title="Add New Stock Item" subtitle="Register a new raw material and its opening stock" />
      <InventoryItemForm item={null} onSaved={() => navigate('/inventory')} onCancel={() => navigate('/inventory')} />
    </>
  )
}
