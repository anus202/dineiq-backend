import { UserManagementView } from '../components/admin/UserManagementView'
import { PageHeader } from '../components/layout/AppLayout'

export function UserAccountsPage() {
  return (
    <>
      <PageHeader title="User Accounts" subtitle="Every system account, its role and branch scope" />
      <UserManagementView />
    </>
  )
}
