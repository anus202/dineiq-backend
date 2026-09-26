import { RestaurantBranchesView } from '../components/admin/RestaurantBranchesView'
import { PageHeader } from '../components/layout/AppLayout'

export function RestaurantBranchesPage() {
  return (
    <>
      <PageHeader title="Restaurant Branches" subtitle="All branch locations, their manager and status" />
      <RestaurantBranchesView />
    </>
  )
}
