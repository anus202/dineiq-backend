import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import type { RoleName } from '../../types/api'
import { homeFor } from '../../utils/roles'
import { ShimmerSkeleton } from '../ui'

/** Renders children only for a logged-in user with one of `roles`; otherwise redirects. */
export function ProtectedRoute({ roles, children }: { roles: RoleName[]; children: ReactNode }) {
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
  // Wrong role for this page: send them to their own dashboard (the API would 403 anyway).
  if (!roles.includes(user.Role)) return <Navigate to={homeFor(user.Role)} replace />
  return <>{children}</>
}
