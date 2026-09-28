import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import type { RoleName } from '../../types/api'
import { homeFor, type PermissionFlag } from '../../utils/roles'
import { ShimmerSkeleton } from '../ui'

export function ProtectedRoute({ roles, permission, children }: { roles: RoleName[]; permission?: PermissionFlag; children: ReactNode }) {
  const { user, restoring } = useAuth()
  const location = useLocation()

  if (restoring) {
    return (
      <div className="flex h-full items-center justify-center">
        <ShimmerSkeleton className="h-10 w-64" rounded="rounded-xl" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  if (!roles.includes(user.Role) && !(permission && user[permission])) return <Navigate to={homeFor(user.Role)} replace />
  return <>{children}</>
}
