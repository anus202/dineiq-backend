import { useNavigate, useParams } from 'react-router-dom'
import { AddBranchForm } from '../components/admin/AddBranchForm'
import { PageHeader } from '../components/layout/AppLayout'
import { ErrorBanner, ShimmerSkeleton } from '../components/ui'
import { useApi } from '../hooks/useApi'
import { branchApi } from '../services/endpoints'

export function EditBranchPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const branches = useApi(() => branchApi.list(), [])
  const branch = branches.data?.find((b) => b.Id === Number(id)) ?? null

  return (
    <>
      <PageHeader title="Edit Branch" subtitle="Update branch details or reassign its manager" />
      {branches.error && <ErrorBanner message={branches.error} onRetry={branches.reload} />}
      {branches.loading && !branches.data && <ShimmerSkeleton className="h-96 max-w-2xl" rounded="rounded-2xl" />}
      {branches.data && !branch && <ErrorBanner message="Branch not found." onRetry={() => navigate('/admin/branches')} />}
      {branch && <AddBranchForm branch={branch} onSaved={() => navigate('/admin/branches')} onCancel={() => navigate('/admin/branches')} />}
    </>
  )
}
