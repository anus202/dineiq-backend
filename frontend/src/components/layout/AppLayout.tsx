import { AnimatePresence, motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { NAV, NAV_GROUPS, roleLabel } from '../../utils/roles'
import { Badge, ShimmerSkeleton } from '../ui'
import { BranchSelector } from './BranchSelector'

export function AppLayout() {
  const { user, restoring, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  if (restoring) {
    return (
      <div className="flex h-full items-center justify-center">
        <ShimmerSkeleton className="h-10 w-64" rounded="rounded-xl" />
      </div>
    )
  }
  // Not signed in (or the session just expired): back to login, returning here afterwards.
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(user.Role)),
  })).filter((group) => group.items.length > 0)
  const links = NAV.filter((item) => item.roles.includes(user.Role))
  // A nav item should only highlight for an exact-path match when some other listed
  // route sits underneath it (e.g. "/inventory" vs. "/inventory/new-item") — otherwise
  // both would light up together.
  const isExactMatchOnly = (to: string) => !NAV.some((other) => other.to !== to && other.to.startsWith(`${to}/`))

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-ink text-slate-300 md:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <img src="/favicon.svg" alt="" className="h-9 w-9" />
          <div>
            <p className="text-lg font-semibold text-white">DineIQ</p>
            <p className="text-xs text-slate-400">Dining Intelligence</p>
          </div>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
          {visibleGroups.map((group) => (
            <div key={group.title}>
              <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{group.title}</p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={isExactMatchOnly(item.to)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white'}`
                    }
                  >
                    <span className="w-5 text-center text-base" aria-hidden="true">
                      {item.icon}
                    </span>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 px-6 py-4 text-xs text-slate-500">API: {import.meta.env.VITE_API_BASE_URL}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-6 py-3 backdrop-blur">
          <nav className="flex gap-1 overflow-x-auto md:hidden">
            {links.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={isExactMatchOnly(item.to)}
                className={({ isActive }) => `rounded-lg px-2 py-1 text-sm whitespace-nowrap ${isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600'}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden md:block" />
          <div className="flex items-center gap-3">
            <BranchSelector />
            <div className="text-right">
              <p className="text-sm font-medium text-ink">{user.FullName}</p>
              <p className="text-xs text-slate-500">{user.Email}</p>
            </div>
            <Badge tone="teal">{roleLabel[user.Role]}</Badge>
            <button
              onClick={() => {
                logout()
                navigate('/login', { replace: true })
              }}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8">
          <AnimatePresence mode="wait">
            <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
