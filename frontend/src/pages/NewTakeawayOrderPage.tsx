import { useNavigate } from 'react-router-dom'
import { OrderBuilderBody } from '../components/pos/OrderBuilderBody'
import { PageHeader } from '../components/layout/AppLayout'

export function NewTakeawayOrderPage() {
  const navigate = useNavigate()
  return (
    <>
      <PageHeader title="New Takeaway / Delivery Order" subtitle="Build an order that isn't tied to a dine-in table" />
      <div className="card p-6">
        <OrderBuilderBody table={null} onCreated={() => navigate('/pos')} />
      </div>
    </>
  )
}
