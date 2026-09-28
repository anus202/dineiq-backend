import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'

interface BranchState {

  selectedBranchId: number | undefined

  canSelectBranch: boolean
  setSelectedBranchId: (id: number | undefined) => void
}

const BranchContext = createContext<BranchState | null>(null)

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const canSelectBranch = user?.Role === 'ADMIN' || user?.Role === 'SUPER_ADMIN'
  const [selected, setSelected] = useState<number | undefined>(undefined)

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
