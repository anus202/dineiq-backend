import {
  animate,
  AnimatePresence,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion'
import {
  ArrowRight,
  BarChart3,
  Bot,
  Boxes,
  Brain,
  Building2,
  Check,
  ChefHat,
  Gauge,
  Layers,
  LogIn,
  Menu,
  Moon,
  MousePointer2,
  Package,
  Receipt,
  ShieldCheck,
  Sparkles,
  Store,
  Sun,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { homeFor, roleLabel } from '../utils/roles'

const HeroScene = lazy(() => import('../components/landing/Landing3D').then((m) => ({ default: m.HeroScene })))
const NeuralScene = lazy(() => import('../components/landing/Landing3D').then((m) => ({ default: m.NeuralScene })))

const EASE = [0.16, 1, 0.3, 1] as const

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#product', label: 'Product' },
  { href: '#roles', label: 'Roles' },
  { href: '#intelligence', label: 'AI & ML' },
]

const STATS = [
  { value: 6, suffix: '', label: 'Role-based portals' },
  { value: 30, suffix: '+', label: 'Dashboard screens' },
  { value: 10, suffix: '', label: 'ML insight modules' },
  { value: 2, suffix: '', label: 'Parallel ML pipelines' },
]

const HEADLINE: { text: string; accent?: boolean }[] = [
  { text: 'Run' },
  { text: 'every' },
  { text: 'branch' },
  { text: 'from' },
  { text: 'one' },
  { text: 'intelligent', accent: true },
  { text: 'dashboard.' },
]

const FEATURES: { icon: LucideIcon; title: string; text: string; tone: string }[] = [
  {
    icon: Receipt,
    title: 'Point of sale & tables',
    text: 'Live floor plan, dine-in, takeaway and delivery orders, split settlement, invoices and loyalty discounts at checkout.',
    tone: 'from-teal-400 to-emerald-500',
  },
  {
    icon: Boxes,
    title: 'Inventory & recipes',
    text: 'Recipe-linked stock that deducts automatically with every order, reorder alerts, adjustments and a full movement log.',
    tone: 'from-amber-400 to-orange-500',
  },
  {
    icon: BarChart3,
    title: 'Branch analytics',
    text: 'Revenue, profit margin, channel mix, menu-performance quadrants and evidence-backed recommendations per branch.',
    tone: 'from-sky-400 to-indigo-500',
  },
  {
    icon: Brain,
    title: 'Machine learning insights',
    text: 'Demand forecasting, churn risk, market-basket rules, price sensitivity, promotion traps and rating anomalies.',
    tone: 'from-violet-400 to-fuchsia-500',
  },
  {
    icon: Building2,
    title: 'Multi-branch control',
    text: 'Compare every branch side by side, spot sales anomalies, and keep managers scoped to exactly their own branch.',
    tone: 'from-rose-400 to-pink-500',
  },
  {
    icon: ShieldCheck,
    title: 'Secure by role',
    text: 'JWT sessions, per-role routing, branch-scoped APIs and grantable permissions, with every change recorded in an audit log.',
    tone: 'from-slate-400 to-slate-600',
  },
]

const SHOWCASE = [
  { key: 'admin', label: 'Executive', icon: Gauge, src: '/landing/admin.jpg', caption: 'Live KPIs, revenue trend, demand heatmap, recent orders and customer segments.' },
  { key: 'branch', label: 'Branch Manager', icon: Store, src: '/landing/branch.jpg', caption: 'Everything about one branch: today’s sales, cashier activity, wastage and channel mix.' },
  { key: 'inventory', label: 'Inventory', icon: Package, src: '/landing/inventory.jpg', caption: 'Stock health matrix with reorder levels, valuation and one-click adjustments.' },
  { key: 'pos', label: 'Cashier', icon: Receipt, src: '/landing/pos.jpg', caption: 'Floor plan and order flow built for speed during the busiest hour.' },
]

const ROLES: { icon: LucideIcon; role: keyof typeof roleLabel; points: string[] }[] = [
  { icon: ShieldCheck, role: 'ADMIN', points: ['Executive overview', 'Users, branches & menu', 'Anomaly & audit trail'] },
  { icon: Building2, role: 'RESTAURANT_MANAGER', points: ['Branch sales & profit', 'Live cashier activity', 'ML recommendations'] },
  { icon: Package, role: 'INVENTORY_MANAGER', points: ['Stock health & alerts', 'Recipes & adjustments', 'Wastage & forecasts'] },
  { icon: Receipt, role: 'CASHIER', points: ['Floor plan & tables', 'Takeaway & delivery', 'Settlement & invoices'] },
  { icon: Users, role: 'CUSTOMER', points: ['Rewards & tiers', 'Browse & order', 'Ratings & feedback'] },
]

const ML_MODULES = [
  'Demand forecasting',
  'Wastage-risk scoring',
  'Customer churn risk',
  'Market-basket analysis',
  'Price sensitivity',
  'Promotion traps',
  'Rating anomalies',
  'Slow-moving dishes',
  'What-if simulator',
  'Spark MLlib vs XGBoost',
]

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Receipt, title: 'Take the order', text: 'Cashiers ring up dine-in, takeaway or delivery from the POS in seconds.' },
  { icon: ChefHat, title: 'Stock moves itself', text: 'Recipes deduct ingredients automatically and raise reorder alerts.' },
  { icon: Workflow, title: 'Insights update', text: 'Dashboards and ML models turn every order into decisions for tomorrow.' },
]

const reveal3d = {
  initial: { opacity: 0, y: 40, rotateX: 25 },
  whileInView: { opacity: 1, y: 0, rotateX: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.8, ease: EASE },
  style: { transformPerspective: 1000 } as CSSProperties,
}

function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/40">
        <img src="/favicon.svg" alt="" className="h-5 w-5" />
      </span>
      <span className="leading-tight">
        <span className="block text-base font-bold tracking-tight text-white">DineIQ</span>
        <span className="block text-[10px] font-semibold tracking-[0.18em] text-teal-300 uppercase">Dining Intelligence</span>
      </span>
    </span>
  )
}

function useDashboardLink() {
  const { user } = useAuth()
  return { to: user ? homeFor(user.Role) : '/login', signedIn: !!user }
}

function TiltCard({ children, className = '', max = 10 }: { children: ReactNode; className?: string; max?: number }) {
  const reduced = useReducedMotion()
  const rx = useMotionValue(0)
  const ry = useMotionValue(0)
  const gx = useMotionValue(50)
  const gy = useMotionValue(50)
  const springRx = useSpring(rx, { stiffness: 180, damping: 16 })
  const springRy = useSpring(ry, { stiffness: 180, damping: 16 })
  const glare = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,0.28), transparent 55%)`

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    ry.set((px - 0.5) * max * 2)
    rx.set(-(py - 0.5) * max * 2)
    gx.set(px * 100)
    gy.set(py * 100)
  }
  const onLeave = () => {
    rx.set(0)
    ry.set(0)
  }

  return (
    <motion.div
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ rotateX: springRx, rotateY: springRy, transformPerspective: 1100, transformStyle: 'preserve-3d' }}
      className={`group relative ${className}`}
    >
      {children}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: glare }}
      />
    </motion.div>
  )
}

function CountUp({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (!inView) return
    const controls = animate(0, value, { duration: 1.8, ease: EASE, onUpdate: (v) => setDisplay(Math.round(v)) })
    return () => controls.stop()
  }, [inView, value])
  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  )
}

function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 24 })
  return <motion.div style={{ scaleX }} className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-teal-300 via-brand-500 to-amber-300" />
}

function LandingNav() {
  const { to, signedIn } = useDashboardLink()
  const { theme, toggleTheme } = useTheme()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const solid = scrolled || open
  return (
    <motion.header
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.7, ease: EASE }}
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        solid ? 'border-b border-white/10 bg-ink/80 shadow-lg shadow-black/20 backdrop-blur-xl' : 'bg-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
        <a href="#top" aria-label="DineIQ home">
          <Logo />
        </a>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="group relative rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:text-white">
              {l.label}
              <span className="absolute inset-x-3 -bottom-0.5 h-px origin-left scale-x-0 bg-teal-300 transition-transform duration-300 group-hover:scale-x-100" />
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <Link
            to={to}
            className="hidden items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:-translate-y-0.5 hover:bg-teal-50 sm:inline-flex"
          >
            <LogIn className="h-4 w-4" />
            {signedIn ? 'Dashboard' : 'Sign in'}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-slate-200 md:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-white/10 px-4 md:hidden"
          >
            <div className="flex flex-col gap-1 py-3">
              {NAV_LINKS.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10">
                  {l.label}
                </a>
              ))}
              <Link to={to} className="mt-1 rounded-lg bg-white px-3 py-2.5 text-center text-sm font-semibold text-ink">
                {signedIn ? 'Open dashboard' : 'Sign in'}
              </Link>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </motion.header>
  )
}

function GradientBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(15,118,110,0.7),transparent_50%),radial-gradient(circle_at_88%_20%,rgba(19,78,74,0.65),transparent_45%),radial-gradient(circle_at_60%_100%,rgba(12,74,68,0.7),transparent_55%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black,transparent)]" />
    </div>
  )
}

function Hero() {
  const ref = useRef<HTMLElement>(null)
  const active = useInView(ref)
  const reduced = !!useReducedMotion()
  const { to, signedIn } = useDashboardLink()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] })
  const contentY = useTransform(scrollYProgress, [0, 1], [0, 140])
  const contentOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0])
  const sceneScale = useTransform(scrollYProgress, [0, 1], [1, 1.15])

  return (
    <section ref={ref} id="top" className="relative flex min-h-[100svh] items-center overflow-hidden bg-ink pt-24 pb-28">
      <GradientBackdrop />
      <motion.div className="absolute inset-0" style={{ scale: sceneScale }}>
        <Suspense fallback={null}>
          <HeroScene active={active} reduced={reduced} />
        </Suspense>
      </motion.div>
      <div className="pointer-events-none absolute inset-0 bg-ink/45 lg:bg-transparent lg:bg-gradient-to-r lg:from-ink lg:via-ink/70 lg:to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink to-transparent" />

      <motion.div style={{ y: contentY, opacity: contentOpacity }} className="relative mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <motion.span
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="inline-flex items-center gap-2 rounded-full border border-teal-300/30 bg-teal-300/10 px-3 py-1 text-xs font-semibold text-teal-200 backdrop-blur"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-300 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-300" />
            </span>
            Restaurant intelligence platform
          </motion.span>

          <h1 className="mt-6 text-4xl leading-[1.08] font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl" style={{ perspective: 900 }}>
            {HEADLINE.map((w, i) => (
              <motion.span
                key={w.text}
                initial={{ opacity: 0, rotateX: -95, y: 40 }}
                animate={{ opacity: 1, rotateX: 0, y: 0 }}
                transition={{ delay: 0.15 + i * 0.08, type: 'spring', stiffness: 110, damping: 14 }}
                style={{ transformOrigin: '50% 100%' }}
                className={`mr-[0.25em] inline-block ${
                  w.accent ? 'bg-gradient-to-r from-teal-200 via-teal-300 to-amber-200 bg-clip-text text-transparent drop-shadow-[0_0_24px_rgba(45,212,191,0.35)]' : ''
                }`}
              >
                {w.text}
              </motion.span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.8, ease: EASE }}
            className="mt-6 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg"
          >
            DineIQ connects your POS, kitchen stock and customers, then turns every order into forecasts, alerts and decisions — for admins, branch
            managers, inventory teams, cashiers and diners alike.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.95, duration: 0.8, ease: EASE }}
            className="mt-9 flex flex-col gap-3 sm:flex-row"
          >
            <Link
              to={to}
              className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-brand-500/40 transition hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-brand-500/50"
            >
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <span className="relative">{signedIn ? 'Open my dashboard' : 'Launch live demo'}</span>
              <ArrowRight className="relative h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
            <a
              href="#product"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/10"
            >
              See the product
            </a>
          </motion.div>

          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.15 }}
            className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300"
          >
            {['Role-based access', 'Live POS & stock', 'ML forecasting'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-teal-300" />
                {t}
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.3, duration: 0.8, ease: EASE }}
          className="mt-14 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 backdrop-blur-md sm:grid-cols-4"
        >
          {STATS.map((s) => (
            <div key={s.label} className="bg-ink/60 px-5 py-5">
              <p className="bg-gradient-to-b from-white to-teal-200 bg-clip-text text-3xl font-extrabold text-transparent">
                <CountUp value={s.value} suffix={s.suffix} />
              </p>
              <p className="mt-1 text-[11px] font-medium tracking-wide text-slate-400 uppercase">{s.label}</p>
            </div>
          ))}
        </motion.div>
      </motion.div>

      <motion.a
        href="#reveal"
        aria-label="Scroll to explore"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8 }}
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-[11px] font-medium tracking-[0.2em] text-slate-400 uppercase sm:flex"
      >
        <span className="flex h-9 w-5 justify-center rounded-full border border-white/25 pt-1.5">
          <motion.span animate={{ y: [0, 12, 0], opacity: [1, 0.2, 1] }} transition={{ duration: 1.8, repeat: Infinity }} className="h-1.5 w-1 rounded-full bg-teal-300" />
        </span>
        Scroll
      </motion.a>
    </section>
  )
}

function DepthChip({ icon: Icon, text, className, z }: { icon: LucideIcon; text: string; className: string; z: number }) {
  return (
    <div className={`absolute hidden md:block ${className}`} style={{ transform: `translateZ(${z}px)` }}>
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 5 + z / 40, repeat: Infinity, ease: 'easeInOut' }}
        className="flex items-center gap-2 rounded-xl border border-white/15 bg-slate-900/85 px-3.5 py-2.5 text-xs font-semibold whitespace-nowrap text-white shadow-2xl shadow-black/40 backdrop-blur-md"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-teal-300 to-brand-600">
          <Icon className="h-4 w-4" />
        </span>
        {text}
      </motion.div>
    </div>
  )
}

function DashboardReveal() {
  const ref = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'center center'] })
  const rotateX = useTransform(scrollYProgress, [0, 1], [reduced ? 0 : 40, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [0.82, 1])
  const y = useTransform(scrollYProgress, [0, 1], [120, 0])
  const opacity = useTransform(scrollYProgress, [0, 0.6], [0.2, 1])

  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const tiltY = useSpring(useTransform(mx, [-0.5, 0.5], [-9, 9]), { stiffness: 120, damping: 18 })
  const tiltX = useSpring(useTransform(my, [-0.5, 0.5], [7, -7]), { stiffness: 120, damping: 18 })

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (reduced) return
    const rect = e.currentTarget.getBoundingClientRect()
    mx.set((e.clientX - rect.left) / rect.width - 0.5)
    my.set((e.clientY - rect.top) / rect.height - 0.5)
  }

  return (
    <section ref={ref} id="reveal" className="relative overflow-hidden bg-gradient-to-b from-ink via-[#0b2a2a] to-slate-50 pt-20 pb-28 dark:to-slate-950">
      <motion.div {...reveal3d} className="relative mx-auto max-w-2xl px-4 text-center">
        <p className="text-xs font-bold tracking-[0.2em] text-teal-300 uppercase">Live product</p>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">Your whole operation, at a glance</h2>
        <p className="mt-4 text-base text-slate-300">Move your mouse over the dashboard — every layer sits at its own depth.</p>
      </motion.div>

      <div
        className="relative mx-auto mt-14 max-w-6xl px-4 sm:px-6"
        style={{ perspective: 1800 }}
        onPointerMove={onMove}
        onPointerLeave={() => {
          mx.set(0)
          my.set(0)
        }}
      >
        <motion.div style={{ rotateX, scale, y, opacity, transformStyle: 'preserve-3d' }}>
          <motion.div style={{ rotateY: tiltY, rotateX: tiltX, transformStyle: 'preserve-3d' }} className="relative">
            <div
              className="absolute -inset-10 rounded-[3rem] bg-gradient-to-r from-teal-500/30 via-brand-500/20 to-amber-400/20 blur-3xl"
              style={{ transform: 'translateZ(-140px)' }}
            />
            <div className="relative rounded-2xl border border-white/15 bg-slate-900/80 p-2 shadow-[0_60px_120px_-30px_rgba(0,0,0,0.7)] backdrop-blur">
              <div className="flex items-center gap-1.5 px-2 pt-1 pb-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="ml-3 truncate rounded-md bg-white/10 px-3 py-0.5 text-[10px] text-slate-400">dineiq / executive-overview</span>
              </div>
              <img src="/landing/admin.jpg" alt="DineIQ executive overview dashboard" className="w-full rounded-xl" />
            </div>
            <DepthChip icon={Gauge} text="Live KPIs" className="-top-6 -left-6" z={90} />
            <DepthChip icon={Brain} text="XGBoost demand forecast" className="top-[30%] -right-10" z={140} />
            <DepthChip icon={Package} text="Auto stock alerts" className="-bottom-6 left-[12%]" z={110} />
            <DepthChip icon={ShieldCheck} text="Branch-scoped security" className="-right-4 -bottom-8" z={70} />
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

function SectionHeading({ eyebrow, title, text, light = false }: { eyebrow: string; title: string; text: string; light?: boolean }) {
  return (
    <motion.div {...reveal3d} className="mx-auto max-w-2xl text-center">
      <p className={`text-xs font-bold tracking-[0.2em] uppercase ${light ? 'text-teal-300' : 'text-brand-600 dark:text-teal-300'}`}>{eyebrow}</p>
      <h2 className={`mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl ${light ? 'text-white' : 'text-ink dark:text-white'}`}>{title}</h2>
      <p className={`mt-4 text-base leading-relaxed ${light ? 'text-slate-300' : 'text-slate-600 dark:text-slate-400'}`}>{text}</p>
    </motion.div>
  )
}

function Features() {
  return (
    <section id="features" className="bg-slate-50 py-24 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Features"
          title="Everything a restaurant runs on, in one place"
          text="From the first order of the day to next week’s stock plan, every module shares the same live data."
        />
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" style={{ perspective: 1400 }}>
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, rotateY: i % 3 === 0 ? -30 : i % 3 === 2 ? 30 : 0, rotateX: 20, y: 50 }}
              whileInView={{ opacity: 1, rotateY: 0, rotateX: 0, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: (i % 3) * 0.1, duration: 0.8, ease: EASE }}
            >
              <TiltCard className="h-full rounded-2xl">
                <div className="relative h-full rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition-shadow duration-300 group-hover:shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                  <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
                    <div className={`absolute -top-16 -right-16 h-44 w-44 rounded-full bg-gradient-to-br ${f.tone} opacity-10 blur-2xl transition duration-500 group-hover:opacity-30`} />
                  </div>
                  <span
                    className={`relative flex h-13 w-13 items-center justify-center rounded-2xl bg-gradient-to-br ${f.tone} text-white shadow-xl`}
                    style={{ transform: 'translateZ(50px)' }}
                  >
                    <f.icon className="h-6 w-6" />
                  </span>
                  <h3 className="relative mt-6 text-lg font-bold text-ink dark:text-white" style={{ transform: 'translateZ(30px)' }}>
                    {f.title}
                  </h3>
                  <p className="relative mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400" style={{ transform: 'translateZ(18px)' }}>
                    {f.text}
                  </p>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Showcase() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = SHOWCASE.length

  useEffect(() => {
    if (paused) return
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), 5000)
    return () => window.clearInterval(timer)
  }, [paused, count])

  return (
    <section id="product" className="relative overflow-hidden bg-white py-24 dark:bg-slate-900">
      <div className="pointer-events-none absolute inset-x-0 top-1/3 h-96 bg-gradient-to-r from-teal-200/0 via-teal-200/40 to-amber-100/0 blur-3xl dark:via-teal-900/30" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Product tour"
          title="A dashboard built for every seat in the restaurant"
          text="Each role lands on a workspace designed for its job — here is what each one actually sees."
        />
        <motion.div {...reveal3d} className="mt-10 flex flex-wrap justify-center gap-2">
          {SHOWCASE.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setIndex(i)}
              className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                index === i ? 'text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {index === i && (
                <motion.span layoutId="showcase-pill" className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 shadow-lg shadow-brand-500/30" />
              )}
              <s.icon className="relative h-4 w-4" />
              <span className="relative">{s.label}</span>
            </button>
          ))}
        </motion.div>

        <div
          className="relative mx-auto mt-12 aspect-[16/10.8] w-full max-w-4xl"
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
        >
          <div className="absolute inset-0" style={{ perspective: 2000 }}>
            {SHOWCASE.map((s, i) => {
              let d = (((i - index) % count) + count) % count
              if (d > count / 2) d -= count
              const hidden = Math.abs(d) >= 2
              return (
                <motion.button
                  key={s.key}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Show ${s.label} dashboard`}
                  animate={{
                    x: `${d * 58}%`,
                    rotateY: d * -42,
                    z: -Math.abs(d) * 260,
                    scale: d === 0 ? 1 : 0.8,
                    opacity: hidden ? 0 : d === 0 ? 1 : 0.55,
                  }}
                  transition={{ type: 'spring', stiffness: 90, damping: 20 }}
                  style={{ zIndex: 10 - Math.abs(d), pointerEvents: hidden ? 'none' : 'auto' }}
                  className="absolute inset-0 cursor-pointer"
                >
                  <div className="h-full rounded-2xl border border-slate-200 bg-slate-100 p-2 shadow-[0_40px_80px_-20px_rgba(15,23,42,0.35)] dark:border-slate-700 dark:bg-slate-800">
                    <div className="flex items-center gap-1.5 px-2 pt-0.5 pb-2">
                      <span className="h-2 w-2 rounded-full bg-rose-400" />
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    </div>
                    <img src={s.src} alt={`${s.label} dashboard`} className="w-full rounded-xl" draggable={false} />
                  </div>
                </motion.button>
              )
            })}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.p
            key={SHOWCASE[index].key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mt-8 text-center text-sm text-slate-600 dark:text-slate-400"
          >
            {SHOWCASE[index].caption}
          </motion.p>
        </AnimatePresence>
        <div className="mt-4 flex justify-center gap-2">
          {SHOWCASE.map((s, i) => (
            <button
              key={s.key}
              type="button"
              aria-label={`Go to ${s.label}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all duration-500 ${index === i ? 'w-8 bg-brand-500' : 'w-3 bg-slate-300 dark:bg-slate-700'}`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function Roles() {
  return (
    <section id="roles" className="bg-slate-50 py-24 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Built for your team"
          title="One platform, the right view for every role"
          text="Access is enforced on the server, branch managers only ever see their own branch, and admins can grant extra modules per person."
        />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-5" style={{ perspective: 1400 }}>
          {ROLES.map((r, i) => (
            <motion.div
              key={r.role}
              initial={{ opacity: 0, rotateY: 90, z: -200 }}
              whileInView={{ opacity: 1, rotateY: 0, z: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.12, type: 'spring', stiffness: 70, damping: 16 }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              <TiltCard className="h-full rounded-2xl" max={14}>
                <div className="relative h-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow group-hover:shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-lg shadow-brand-500/30"
                    style={{ transform: 'translateZ(45px)' }}
                  >
                    <r.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-bold text-ink dark:text-white" style={{ transform: 'translateZ(28px)' }}>
                    {roleLabel[r.role]}
                  </h3>
                  <ul className="mt-3 space-y-2" style={{ transform: 'translateZ(16px)' }}>
                    {r.points.map((p) => (
                      <li key={p} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Marquee3D() {
  const reduced = useReducedMotion()
  const rows = [ML_MODULES.slice(0, 4), ML_MODULES.slice(4, 7), ML_MODULES.slice(7)]
  return (
    <div className="relative mt-16 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]" style={{ perspective: 1000 }}>
      <div className="space-y-4 py-8" style={{ transform: 'rotateX(22deg) rotateZ(-3deg)', transformStyle: 'preserve-3d' }}>
        {rows.map((row, r) => (
          <motion.div
            key={r}
            className="flex w-max gap-3"
            animate={reduced ? undefined : { x: r % 2 ? ['-50%', '0%'] : ['0%', '-50%'] }}
            transition={{ duration: 30 + r * 6, repeat: Infinity, ease: 'linear' }}
          >
            {[...row, ...row, ...row, ...row].map((m, i) => (
              <span
                key={`${m}-${i}`}
                className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold whitespace-nowrap text-white shadow-lg shadow-black/30 backdrop-blur"
              >
                <Brain className="h-4 w-4 text-teal-300" />
                {m}
              </span>
            ))}
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function Intelligence() {
  const sceneRef = useRef<HTMLDivElement>(null)
  const active = useInView(sceneRef)
  const reduced = !!useReducedMotion()
  return (
    <section id="intelligence" className="relative overflow-hidden bg-ink py-24">
      <GradientBackdrop />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <motion.p {...reveal3d} className="text-xs font-bold tracking-[0.2em] text-teal-300 uppercase">
            AI & machine learning
          </motion.p>
          <motion.h2 {...reveal3d} className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
            Decisions backed by models, not guesswork
          </motion.h2>
          <motion.p {...reveal3d} className="mt-5 text-base leading-relaxed text-slate-300">
            Two independent pipelines — Spark MLlib for big-data scale and Python/XGBoost for precision — train on your order history, and the
            dashboards show where they agree. A built-in assistant answers questions about whichever page you are on.
          </motion.p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2" style={{ perspective: 1200 }}>
            {[
              { icon: Layers, title: 'Dual pipelines', text: 'Spark MLlib and XGBoost, compared side by side.' },
              { icon: Bot, title: 'Page-aware assistant', text: 'Ask about the data on the screen in plain language.' },
            ].map((c, i) => (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, rotateX: -40, y: 30 }}
                whileInView={{ opacity: 1, rotateX: 0, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 + i * 0.12, duration: 0.8, ease: EASE }}
              >
                <TiltCard className="rounded-2xl">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                    <c.icon className="h-5 w-5 text-teal-300" style={{ transform: 'translateZ(30px)' }} />
                    <p className="mt-3 font-semibold text-white">{c.title}</p>
                    <p className="mt-1 text-sm text-slate-400">{c.text}</p>
                  </div>
                </TiltCard>
              </motion.div>
            ))}
          </div>
        </div>
        <motion.div
          ref={sceneRef}
          initial={{ opacity: 0, scale: 0.85 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: EASE }}
          className="relative h-[380px] sm:h-[460px]"
        >
          <div className="absolute inset-10 rounded-full bg-teal-500/15 blur-3xl" />
          <Suspense fallback={null}>
            <NeuralScene active={active} reduced={reduced} />
          </Suspense>
          <div className="pointer-events-none absolute right-4 bottom-2 left-4 flex justify-between text-[10px] font-semibold tracking-[0.18em] text-slate-500 uppercase">
            <span>Orders</span>
            <span>Features</span>
            <span>Models</span>
            <span className="text-amber-300/80">Decisions</span>
          </div>
        </motion.div>
      </div>
      <Marquee3D />
    </section>
  )
}

function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 80%', 'center center'] })
  const line = useSpring(scrollYProgress, { stiffness: 80, damping: 20 })
  return (
    <section className="bg-white py-24 dark:bg-slate-900">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading eyebrow="How it works" title="From order to insight, automatically" text="No spreadsheets, no end-of-day exports — the loop closes on its own." />
        <div ref={ref} className="relative mt-16 grid gap-10 md:grid-cols-3" style={{ perspective: 1200 }}>
          <div className="absolute top-8 right-[16%] left-[16%] hidden h-0.5 overflow-hidden rounded-full bg-slate-200 md:block dark:bg-slate-800">
            <motion.div style={{ scaleX: line }} className="h-full origin-left bg-gradient-to-r from-teal-400 via-brand-500 to-amber-400" />
          </div>
          {STEPS.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, rotateX: -70, y: 40 }}
              whileInView={{ opacity: 1, rotateX: 0, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.18, type: 'spring', stiffness: 80, damping: 14 }}
              style={{ transformOrigin: '50% 0%' }}
              className="relative text-center"
            >
              <motion.span
                whileHover={{ rotateY: 180 }}
                transition={{ duration: 0.7 }}
                style={{ transformStyle: 'preserve-3d' }}
                className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-xl shadow-brand-500/30"
              >
                <s.icon className="h-7 w-7" />
                <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-white ring-4 ring-white dark:ring-slate-900">
                  {i + 1}
                </span>
              </motion.span>
              <h3 className="mt-5 text-lg font-bold text-ink dark:text-white">{s.title}</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-600 dark:text-slate-400">{s.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="bg-slate-50 px-4 py-24 sm:px-6 dark:bg-slate-950" style={{ perspective: 1400 }}>
      <motion.div
        initial={{ opacity: 0, rotateX: 35, y: 60, scale: 0.92 }}
        whileInView={{ opacity: 1, rotateX: 0, y: 0, scale: 1 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 1, ease: EASE }}
        className="mx-auto max-w-5xl"
      >
        <TiltCard className="rounded-3xl" max={6}>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-ink px-6 py-16 text-center shadow-2xl shadow-brand-900/40 sm:px-12">
            <motion.div
              className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-teal-300/25 blur-3xl"
              animate={{ scale: [1, 1.2, 1], x: [0, -30, 0] }}
              transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-amber-300/20 blur-3xl"
              animate={{ scale: [1, 1.25, 1], x: [0, 30, 0] }}
              transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
            />
            <MousePointer2 className="relative mx-auto h-8 w-8 text-teal-200" />
            <h2 className="relative mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-5xl">See DineIQ running on real data</h2>
            <p className="relative mx-auto mt-4 max-w-xl text-teal-50/90">
              Sign in with any demo role — admin, branch manager, inventory or cashier — and explore the full platform.
            </p>
            <div className="relative mt-9 flex justify-center">
              <Link
                to="/login"
                className="group inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-bold text-ink shadow-2xl transition hover:-translate-y-1"
              >
                <Sparkles className="h-4 w-4 text-brand-600" />
                Try the live demo
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        </TiltCard>
      </motion.div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-ink">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 py-10 sm:flex-row sm:px-6">
        <Logo />
        <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-400">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="transition hover:text-white">
              {l.label}
            </a>
          ))}
          <Link to="/login" className="transition hover:text-white">
            Sign in
          </Link>
        </nav>
        <p className="text-xs text-slate-500">© {new Date().getFullYear()} DineIQ Analytics</p>
      </div>
    </footer>
  )
}

export function LandingPage() {
  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.scrollBehavior
    root.style.scrollBehavior = 'smooth'
    return () => {
      root.style.scrollBehavior = previous
    }
  }, [])

  return (
    <div className="min-h-full bg-ink">
      <ScrollProgress />
      <LandingNav />
      <main>
        <Hero />
        <DashboardReveal />
        <Features />
        <Showcase />
        <Roles />
        <Intelligence />
        <HowItWorks />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
