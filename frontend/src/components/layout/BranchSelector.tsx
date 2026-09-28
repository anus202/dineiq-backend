import { useBranch } from '../../context/BranchContext'
import { useAuth } from '../../context/AuthContext'
import { useApi } from '../../hooks/useApi'
import { branchApi } from '../../services/endpoints'
import { Badge } from '../ui'

export function BranchSelector() {
  const { user } = useAuth()
  const { selectedBranchId, canSelectBranch, setSelectedBranchId } = useBranch()
  const branches = useApi(() => branchApi.list({ is_active: true }), [])

  if (!user || (user.Role !== 'ADMIN' && user.Role !== 'SUPER_ADMIN' && user.Role !== 'RESTAURANT_MANAGER' && user.Role !== 'INVENTORY_MANAGER')) {
    return null
  }

  if (!canSelectBranch) {
    return (
      <Badge tone="purple">
        🏢 {user.BranchName ?? 'No branch assigned'}
      </Badge>
    )
  }

  return (
    <select
      className="field-input w-auto py-1.5 text-sm"
      value={selectedBranchId ?? ''}
      onChange={(e) => setSelectedBranchId(e.target.value ? Number(e.target.value) : undefined)}
      aria-label="Select branch"
    >
      <option value="">🌐 All Branches</option>
      {(branches.data ?? []).map((b) => (
        <option key={b.Id} value={b.Id}>
          {b.BranchName}
        </option>
      ))}
    </select>
  )
}
