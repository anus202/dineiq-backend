import { CustomerSearch } from '../components/admin/CustomerSearch'
import { PageHeader } from '../components/layout/AppLayout'

export function CustomerSearchPage() {
  return (
    <>
      <PageHeader title="Customer Search" subtitle="Look up customers, loyalty points and order history" />
      <CustomerSearch />
    </>
  )
}
