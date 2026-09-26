import { useNavigate } from 'react-router-dom'
import { AddUserForm } from '../components/admin/AddUserForm'
import { PageHeader } from '../components/layout/AppLayout'

export function CreateUserPage() {
  const navigate = useNavigate()
  return (
    <>
      <PageHeader title="Create User & Assign Role" subtitle="Add a new staff account with a role, branch scope and permissions" />
      <AddUserForm onSaved={() => navigate('/admin/users')} onCancel={() => navigate('/admin/users')} />
    </>
  )
}
