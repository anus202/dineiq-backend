import { MenuItemMapper } from '../components/admin/MenuItemMapper'
import { PageHeader } from '../components/layout/AppLayout'

export function MenuItemMapperPage() {
  return (
    <>
      <PageHeader title="Menu Item Mapper" subtitle="Manage menu items, pricing and category assignment" />
      <MenuItemMapper />
    </>
  )
}
