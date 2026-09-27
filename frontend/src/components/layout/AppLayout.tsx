import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  GitCompare,
  Award,
  BookOpen,
  Building2,
  CalendarClock,
  CalendarRange,
  ChefHat,
  ChevronDown,
  ClipboardList,
  DollarSign,
  Flag,
  FolderTree,
  Globe,
  LayoutDashboard,
  LayoutGrid,
  Lightbulb,
  Package,
  PackagePlus,
  PieChart,
  PlusCircle,
  ReceiptText,
  Scale,
  Search,
  ScrollText,
  ShieldAlert,
  ShieldPlus,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Snail,
  Star,
  Trash2,
  UserCircle,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useGlobalRevalidating } from '../../hooks/useApi'
import { NAV, NAV_GROUPS, roleLabel, type NavGroup } from '../../utils/roles'
import { Badge, ShimmerSkeleton } from '../ui'
import { BranchSelector } from './BranchSelector'

// One distinct lucide icon per sidebar route, keyed by `to` — every child link must carry
// its own icon rather than reusing a single generic marker.
const ROUTE_ICONS: Record<string, LucideIcon> = {
  '/admin': LayoutDashboard,
  '/dashboard/restaurant-manager': LayoutDashboard,
  '/dashboard/restaurant-manager/channel-mix': PieChart,
  '/dashboard/restaurant-manager/menu-performance': UtensilsCrossed,
  '/dashboard/restaurant-manager/recommendations': Lightbulb,
  '/ml-insights/recommendations': Lightbulb,
  '/ml-insights/market-basket': ShoppingBag,
  '/ml-insights/price-sensitivity': DollarSign,
  '/ml-insights/promotion-traps': AlertTriangle,
  '/ml-insights/churn-risk': Users,
  '/ml-insights/rating-anomalies': Flag,
  '/ml-insights/slow-moving-dishes': Snail,
  '/ml-insights/forecast-dashboard': CalendarClock,
  '/ml-insights/what-if': SlidersHorizontal,
  '/ml-insights/dual-pipeline-comparison': GitCompare,
  '/inventory': Package,
  '/inventory/new-item': PackagePlus,
  '/inventory/adjust-stock': Scale,
  '/inventory/recipes': ChefHat,
  '/inventory/movement-log': ClipboardList,
  '/dashboard/inventory-manager/wastage': Trash2,
  '/dashboard/inventory-manager/demand-forecast': CalendarRange,
  '/admin/categories': FolderTree,
  '/admin/menu-mapper': UtensilsCrossed,
  '/pos': LayoutGrid,
  '/pos/new-order': ReceiptText,
  '/admin/customers': Search,
  '/admin/audit': ScrollText,
  '/admin/branches': Building2,
  '/admin/branches/new': PlusCircle,
  '/admin/users': UserCircle,
  '/admin/users/new': ShieldPlus,
  '/admin/branch-comparison': Globe,
  '/admin/anomalies': ShieldAlert,
  '/customer': Award,
  '/customer/menu': BookOpen,
  '/customer/order': ShoppingCart,
  '/customer/ratings': Star,
}

function SidebarGroup({ group, isExactMatchOnly }: { group: NavGroup; isExactMatchOnly: (to: string) => boolean }) {
  const location = useLocation()
  const isGroupActive = group.items.some((item) =>
    isExactMatchOnly(item.to) ? location.pathname === item.to : location.pathname.startsWith(item.to),
  )
  // Default-open the section that contains the current route, so the user's location is
  // always visible; collapsed by default otherwise to keep the list scannable. Re-syncs
  // whenever navigation moves the active route into this group (it never force-closes a
  // group the user opened manually).
  const [open, setOpen] = useState(isGroupActive)
  useEffect(() => {
    if (isGroupActive) setOpen(true)
  }, [isGroupActive])

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 pt-4 pb-2 text-[11px] font-bold tracking-wider text-slate-400 uppercase transition-colors hover:text-slate-100"
      >
        <span>{group.title}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`} aria-hidden="true" />
      </button>
      <div className={`grid overflow-hidden transition-all duration-200 ease-in-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="min-h-0 space-y-0.5 border-l border-slate-800 py-1 pl-6">
          {group.items.map((item) => {
            const Icon = ROUTE_ICONS[item.to] ?? LayoutDashboard
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={isExactMatchOnly(item.to)}
                className={({ isActive }) =>
                  `-ml-px flex items-center gap-3 border-l-4 py-2 pr-3 pl-3 text-sm transition-all duration-150 ${
                    isActive
                      ? 'border-indigo-500 bg-indigo-600/20 font-semibold text-indigo-400'
                      : 'border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-100'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// A small, non-blocking presence in the header instead of a full-page loader: pulses
// while any page's data is being silently refreshed in the background (see the
// stale-while-revalidate behaviour in useApi), and is otherwise invisible.
function SyncIndicator() {
  const isRevalidating = useGlobalRevalidating()
  if (!isRevalidating) return null
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-400" title="Refreshing data in the background">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
      </span>
      Syncing
    </span>
  )
}

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
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-950 md:flex">
        <div className="flex items-center gap-3 px-6 py-6">
          <img src="/favicon.svg" alt="" className="h-9 w-9" />
          <div>
            <p className="text-lg font-semibold text-white">DineIQ</p>
            <p className="text-xs text-slate-500">Dining Intelligence</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto pb-4">
          {visibleGroups.map((group) => (
            <SidebarGroup key={group.title} group={group} isExactMatchOnly={isExactMatchOnly} />
          ))}
        </nav>
        <div className="border-t border-slate-800 px-6 py-4 text-xs text-slate-500">API: {import.meta.env.VITE_API_BASE_URL}</div>
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
            <SyncIndicator />
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
