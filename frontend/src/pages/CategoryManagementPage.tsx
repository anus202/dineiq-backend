import { CategoryManager } from '../components/admin/CategoryManager'
import { PageHeader } from '../components/layout/AppLayout'

export function CategoryManagementPage() {
  return (
    <>
      <PageHeader title="Category Management" subtitle="Create, rename and retire menu categories" />
      <CategoryManager />
    </>
  )
}
