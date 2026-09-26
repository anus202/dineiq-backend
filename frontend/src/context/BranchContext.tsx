import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'

interface BranchState {
  /** undefined = "All Branches" (ADMIN/SUPER_ADMIN only). Always the user's own branch for
   * RESTAURANT_MANAGER / INVENTORY_MANAGER — the backend enforces this regardless, but the
   * UI mirrors it so a manager never even sees a selector that implies they could change it. */
  selectedBranchId: number | undefined
  /** True for ADMIN/SUPER_ADMIN: they may pick any branch or "All Branches". */
  canSelectBranch: boolean
  setSelectedBranchId: (id: number | undefined) => void
}

const BranchContext = createContext<BranchState | null>(null)

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const canSelectBranch = user?.Role === 'ADMIN' || user?.Role === 'SUPER_ADMIN'
  const [selected, setSelected] = useState<number | undefined>(undefined)

  // A branch-scoped manager's selection always mirrors their own assigned branch.
  useEffect(() => {
    if (!canSelectBranch) setSelected(user?.BranchId ?? undefined)
  }, [canSelectBranch, user?.BranchId])

  const value = useMemo<BranchState>(
    () => ({
      selectedBranchId: canSelectBranch ? selected : (user?.BranchId ?? undefined),
      canSelectBranch,
      setSelectedBranchId: canSelectBranch ? setSelected : () => {},
    }),
    [canSelectBranch, selected, user?.BranchId],
  )

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>
}

export function useBranch(): BranchState {
  const context = useContext(BranchContext)
  if (!context) throw new Error('useBranch must be used inside <BranchProvider>')
  return context
}
