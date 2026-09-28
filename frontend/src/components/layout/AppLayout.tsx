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
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  DollarSign,
  Flag,
  FolderTree,
  Globe,
  LayoutDashboard,
  LayoutGrid,
  Lightbulb,
  LogOut,
  Moon,
  Package,
  ReceiptText,
  Scale,
  Search,
  ScrollText,
  ShieldAlert,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Snail,
  Star,
  Sun,
  Trash2,
  UserCircle,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { useGlobalRevalidating } from '../../hooks/useApi'
import { hasNavAccess, NAV, NAV_GROUPS, roleLabel, type NavGroup } from '../../utils/roles'
import { Badge, ShimmerSkeleton } from '../ui'
import { BranchSelector } from './BranchSelector'

const ROUTE_ICONS: Record<string, LucideIcon> = {
  '/admin': LayoutDashboard,
  '/dashboard/restaurant-manager': LayoutDashboard,
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
  '/admin/users': UserCircle,
  '/admin/branch-comparison': Globe,
  '/admin/anomalies': ShieldAlert,
  '/customer': Award,
  '/customer/menu': BookOpen,
  '/customer/order': ShoppingCart,
  '/customer/ratings': Star,
}

const SIDEBAR_WIDTH = 288
const SIDEBAR_COLLAPSED_KEY = 'dineiq.sidebarCollapsed'

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {

    }
  }, [collapsed])
  return [collapsed, setCollapsed] as const
}

function SidebarCollapseToggle({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
      title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
      className="absolute top-20 -right-3 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      {collapsed ? <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />}
    </button>
  )
}

function SidebarGroup({ group, isExactMatchOnly }: { group: NavGroup; isExactMatchOnly: (to: string) => boolean }) {
  const location = useLocation()
  const isGroupActive = group.items.some((item) =>
    isExactMatchOnly(item.to) ? location.pathname === item.to : location.pathname.startsWith(item.to),
  )

  const [open, setOpen] = useState(isGroupActive)
  useEffect(() => {
    if (isGroupActive) setOpen(true)
  }, [isGroupActive])

  return (
    <div className="mb-1.5 px-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-r-lg border-l-[2.5px] border-teal-200 py-2.5 pr-2.5 pl-3 text-left transition-colors hover:bg-slate-50 dark:bg-slate-800 dark:border-teal-900 dark:hover:bg-slate-800/60"
      >
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-slate-700 dark:text-slate-300">{group.title}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="shrink-0"
        >
          <ChevronDown className="h-4 w-4 text-slate-300 dark:text-slate-600" aria-hidden="true" />
        </motion.span>
      </button>
      <div className={`grid overflow-hidden transition-all duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="min-h-0">
          <div className="mt-0.5 space-y-0.5 rounded-xl bg-slate-50 p-1.5 dark:bg-slate-900/60">
            {group.items.map((item, i) => {
              const Icon = ROUTE_ICONS[item.to] ?? LayoutDashboard
              return (
                <motion.div
                  key={item.to}
                  initial={false}
                  animate={open ? { opacity: 1, x: 0 } : { opacity: 0, x: -6 }}
                  transition={{ delay: open ? i * 0.03 : 0, duration: 0.2 }}
                >
                <NavLink
                  to={item.to}
                  end={isExactMatchOnly(item.to)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-150 hover:translate-x-0.5 ${
                      isActive
                        ? 'bg-white text-brand-700 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-800 dark:text-brand-300 dark:ring-slate-700'
                        : 'text-slate-500 hover:bg-white/70 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                          isActive ? 'bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-200' : 'bg-slate-200/70 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span className="truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function SidebarSignOutButton() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => {
        logout()
        navigate('/login', { replace: true })
      }}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-100 bg-rose-50 py-2.5 text-sm font-semibold text-rose-600 transition hover:border-rose-200 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-950/70"
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      Sign out
    </button>
  )
}

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

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  return (
    <motion.button
      type="button"
      onClick={toggleTheme}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9, rotate: 15 }}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={isDark ? 'sun' : 'moon'}
          initial={{ rotate: -90, opacity: 0, scale: 0.4 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 90, opacity: 0, scale: 0.4 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          className="flex"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  )
}

function SearchBox() {
  return (
    <label className="relative flex min-w-0 flex-1 items-center justify-center">
      <span className="sr-only">Search</span>
      <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
      <input
        type="search"
        placeholder="Search…"
        className="w-9 min-w-0 rounded-lg border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-sm text-slate-700 placeholder:text-slate-400 transition-[width] outline-none focus:w-full focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-100 lg:w-48 lg:focus:w-72 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:bg-slate-800"
      />
    </label>
  )
}

function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => setOpen(false), [location.pathname])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!user) return null

  const handleSignOut = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${user.FullName}, ${roleLabel[user.Role]}. Open account menu`}
        className="flex items-center gap-2.5 rounded-lg border border-transparent py-1.5 pr-2 pl-1.5 transition hover:border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-800 dark:hover:border-slate-700 dark:hover:bg-slate-800"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-100">
          {user.FullName.charAt(0).toUpperCase()}
        </span>
        <span className="hidden text-left lg:block">
          <span className="block text-sm font-medium text-ink dark:text-slate-100">{user.FullName}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">{user.Email}</span>
        </span>
        <span className="hidden lg:inline-flex">
          <Badge tone="teal">{roleLabel[user.Role]}</Badge>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="absolute top-full right-0 z-40 mt-2 w-64 origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="px-4 py-2.5">
              <p className="truncate text-sm font-medium text-ink dark:text-slate-100">{user.FullName}</p>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.Email}</p>
              <span className="mt-1.5 inline-block">
                <Badge tone="teal">{roleLabel[user.Role]}</Badge>
              </span>
            </div>
            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:hover:bg-rose-950/40"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function AppLayout() {
  const { user, restoring } = useAuth()
  const location = useLocation()
  const [sidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsed()
  if (restoring) {
    return (
      <div className="flex h-full items-center justify-center">
        <ShimmerSkeleton className="h-10 w-64" rounded="rounded-xl" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasNavAccess(user, item)),
  })).filter((group) => group.items.length > 0)
  const links = NAV.filter((item) => hasNavAccess(user, item))

  const isExactMatchOnly = (to: string) => !NAV.some((other) => other.to !== to && other.to.startsWith(`${to}/`))

  return (
    <div className="flex min-h-full">
      <div className="relative hidden md:block">
        <motion.aside
          animate={{ width: sidebarCollapsed ? 0 : SIDEBAR_WIDTH }}
          initial={false}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="sticky top-0 h-screen shrink-0 overflow-hidden border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
        >

          <div className="flex h-full flex-col" style={{ width: SIDEBAR_WIDTH }}>
            <div className="flex items-center gap-2.5 px-5 py-5">
              <img src="/favicon.svg" alt="" className="h-7 w-7" />
              <div>
                <p className="text-[15px] leading-tight font-bold text-ink dark:text-white">DineIQ</p>
                <p className="text-[10.5px] leading-tight text-slate-400 dark:text-slate-500">Dining Intelligence</p>
              </div>
            </div>

            <nav className="sidebar-scroll flex-1 overflow-y-auto pt-1 pb-2">
              {visibleGroups.map((group) => (
                <SidebarGroup key={group.title} group={group} isExactMatchOnly={isExactMatchOnly} />
              ))}
            </nav>
            <div className="px-3 pt-1 pb-2">
              <SidebarSignOutButton />
            </div>
            <div className="flex items-center gap-2 border-t border-slate-100 px-5 py-3.5 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]" />
              <span className="truncate">API: {import.meta.env.VITE_API_BASE_URL}</span>
            </div>
          </div>
        </motion.aside>

        <SidebarCollapseToggle collapsed={sidebarCollapsed} onClick={() => setSidebarCollapsed((c) => !c)} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur sm:gap-4 sm:px-6 dark:border-slate-800 dark:bg-slate-950/80">

          <nav className="flex min-w-0 max-w-[38%] shrink gap-1 overflow-x-auto md:hidden">
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
          <div className="flex min-w-0 flex-1 justify-end sm:justify-center">
            <SearchBox />
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <SyncIndicator />
            <div className="max-w-[108px] lg:max-w-none [&_select]:w-full">
              <BranchSelector />
            </div>
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 24, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.99 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
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
        <h1 className="text-2xl font-semibold tracking-tight text-ink dark:text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}
