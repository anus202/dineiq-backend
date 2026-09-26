import { useNavigate } from 'react-router-dom'
import { AddBranchForm } from '../components/admin/AddBranchForm'
import { PageHeader } from '../components/layout/AppLayout'

export function AddBranchPage() {
  const navigate = useNavigate()
  return (
    <>
      <PageHeader title="Add Branch" subtitle="Register a new restaurant branch location" />
      <AddBranchForm branch={null} onSaved={() => navigate('/admin/branches')} onCancel={() => navigate('/admin/branches')} />
    </>
  )
}
