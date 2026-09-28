import { AnimatePresence, motion } from 'framer-motion'
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
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { homeFor, roleLabel } from '../utils/roles'

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#product', label: 'Product' },
  { href: '#roles', label: 'Roles' },
  { href: '#intelligence', label: 'AI & ML' },
]

const STATS = [
  { value: '6', label: 'Role-based portals' },
  { value: '30+', label: 'Dashboard screens' },
  { value: '10', label: 'ML insight modules' },
  { value: '2', label: 'Parallel ML pipelines' },
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

const fadeUp = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
}

function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/30">
        <img src="/favicon.svg" alt="" className="h-5 w-5" />
      </span>
      <span className="leading-tight">
        <span className={`block text-base font-bold tracking-tight ${light ? 'text-white' : 'text-ink dark:text-white'}`}>DineIQ</span>
        <span className={`block text-[10px] font-semibold tracking-[0.18em] uppercase ${light ? 'text-teal-300' : 'text-brand-600 dark:text-teal-300'}`}>
          Dining Intelligence
        </span>
      </span>
    </span>
  )
}

function PrimaryCta({ className = '' }: { className?: string }) {
  const { user } = useAuth()
  const to = user ? homeFor(user.Role) : '/login'
  return (
    <Link
      to={to}
      className={`group inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-500/40 ${className}`}
    >
      {user ? 'Open my dashboard' : 'Launch live demo'}
      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
    </Link>
  )
}

function LandingNav() {
  const { user } = useAuth()
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
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        solid ? 'border-b border-white/10 bg-ink/85 shadow-lg shadow-black/20 backdrop-blur-xl' : 'bg-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6">
        <a href="#top" aria-label="DineIQ home">
          <Logo light />
        </a>
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-white">
              {l.label}
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
            to={user ? homeFor(user.Role) : '/login'}
            className="hidden items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm transition hover:bg-teal-50 sm:inline-flex"
          >
            <LogIn className="h-4 w-4" />
            {user ? 'Dashboard' : 'Sign in'}
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
              <Link to={user ? homeFor(user.Role) : '/login'} className="mt-1 rounded-lg bg-white px-3 py-2.5 text-center text-sm font-semibold text-ink">
                {user ? 'Open dashboard' : 'Sign in'}
              </Link>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  )
}

function HeroBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(15,118,110,0.85),transparent_50%),radial-gradient(circle_at_88%_10%,rgba(19,78,74,0.75),transparent_45%),radial-gradient(circle_at_60%_100%,rgba(12,74,68,0.8),transparent_55%)]" />
      <motion.div
        className="absolute top-1/2 left-1/2 h-[150vmax] w-[150vmax] -translate-x-1/2 -translate-y-1/2 opacity-30"
        style={{
          background:
            'conic-gradient(from 0deg, transparent 0deg, rgba(45,212,191,0.28) 70deg, transparent 150deg, rgba(251,191,36,0.14) 230deg, transparent 310deg)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
      />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black,transparent)]" />
      <motion.div
        className="absolute -top-40 -left-40 h-[32rem] w-[32rem] rounded-full bg-teal-400/30 blur-[120px]"
        animate={{ x: [0, 70, 0], y: [0, 40, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-amber-400/15 blur-[120px]"
        animate={{ x: [0, -50, 0], y: [0, -30, 0] }}
        transition={{ duration: 19, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

function FloatingChip({ icon: Icon, text, className, delay }: { icon: LucideIcon; text: string; className: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: [0, -10, 0] }}
      transition={{ opacity: { delay, duration: 0.5 }, scale: { delay, duration: 0.5 }, y: { delay, duration: 5, repeat: Infinity, ease: 'easeInOut' } }}
      className={`absolute z-10 hidden items-center gap-2 rounded-xl border border-white/15 bg-slate-900/85 px-3 py-2 text-xs font-semibold text-white shadow-xl shadow-black/30 backdrop-blur-md lg:flex ${className}`}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-teal-300 to-brand-600">
        <Icon className="h-3.5 w-3.5" />
      </span>
      {text}
    </motion.div>
  )
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-ink pt-28 pb-20 sm:pt-32 lg:pb-28">
      <HeroBackdrop />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <motion.span
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 rounded-full border border-teal-300/30 bg-teal-300/10 px-3 py-1 text-xs font-semibold text-teal-200"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Restaurant intelligence platform
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 text-4xl leading-[1.08] font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl"
          >
            Run every branch from one{' '}
            <span className="bg-gradient-to-r from-teal-200 via-teal-300 to-amber-200 bg-clip-text text-transparent">intelligent</span> dashboard.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg"
          >
            DineIQ connects your POS, kitchen stock and customers, then turns every order into forecasts, alerts and decisions — for admins, branch
            managers, inventory teams, cashiers and diners alike.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 flex flex-col gap-3 sm:flex-row"
          >
            <PrimaryCta />
            <a
              href="#product"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/10"
            >
              See the product
            </a>
          </motion.div>
          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300"
          >
            {['Role-based access', 'Live POS & stock', 'ML forecasting'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-teal-300" />
                {t}
              </li>
            ))}
          </motion.ul>
        </div>

        <div className="relative" style={{ perspective: 1600 }}>
          <motion.div
            initial={{ opacity: 0, rotateY: -18, rotateX: 10, y: 40 }}
            animate={{ opacity: 1, rotateY: -8, rotateX: 4, y: 0 }}
            transition={{ delay: 0.2, duration: 1, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ rotateY: 0, rotateX: 0, scale: 1.02 }}
            className="relative rounded-2xl border border-white/15 bg-slate-900/60 p-2 shadow-2xl shadow-black/50 backdrop-blur"
          >
            <div className="flex items-center gap-1.5 px-2 pt-1 pb-2">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span className="ml-3 truncate rounded-md bg-white/10 px-3 py-0.5 text-[10px] text-slate-400">dineiq / executive-overview</span>
            </div>
            <img src="/landing/admin.jpg" alt="DineIQ executive overview dashboard" className="w-full rounded-xl" />
          </motion.div>
          <FloatingChip icon={Gauge} text="Live KPIs" className="-top-4 -left-6" delay={0.8} />
          <FloatingChip icon={Brain} text="XGBoost demand forecast" className="top-[38%] -right-10" delay={1.1} />
          <FloatingChip icon={Package} text="Auto stock alerts" className="-bottom-5 left-10" delay={1.4} />
        </div>
      </div>

      <div className="relative mx-auto mt-20 max-w-5xl px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 backdrop-blur md:grid-cols-4">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="bg-ink/70 px-6 py-6 text-center"
            >
              <p className="bg-gradient-to-b from-white to-teal-200 bg-clip-text text-3xl font-extrabold text-transparent sm:text-4xl">{s.value}</p>
              <p className="mt-1 text-xs font-medium tracking-wide text-slate-400 uppercase">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function SectionHeading({ eyebrow, title, text, light = false }: { eyebrow: string; title: string; text: string; light?: boolean }) {
  return (
    <motion.div {...fadeUp} className="mx-auto max-w-2xl text-center">
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
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: (i % 3) * 0.08, duration: 0.55 }}
              whileHover={{ y: -6 }}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
            >
              <div className={`absolute -top-16 -right-16 h-40 w-40 rounded-full bg-gradient-to-br ${f.tone} opacity-10 blur-2xl transition group-hover:opacity-25`} />
              <span className={`relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${f.tone} text-white shadow-lg`}>
                <f.icon className="h-6 w-6" />
              </span>
              <h3 className="relative mt-5 text-lg font-bold text-ink dark:text-white">{f.title}</h3>
              <p className="relative mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{f.text}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Showcase() {
  const [active, setActive] = useState(SHOWCASE[0].key)
  const current = SHOWCASE.find((s) => s.key === active) ?? SHOWCASE[0]
  return (
    <section id="product" className="relative overflow-hidden bg-white py-24 dark:bg-slate-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Product tour"
          title="A dashboard built for every seat in the restaurant"
          text="Each role lands on a workspace designed for its job — here is what each one actually sees."
        />
        <motion.div {...fadeUp} className="mt-10 flex flex-wrap justify-center gap-2">
          {SHOWCASE.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setActive(s.key)}
              className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                active === s.key ? 'text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {active === s.key && (
                <motion.span layoutId="showcase-pill" className="absolute inset-0 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 shadow-lg shadow-brand-500/30" />
              )}
              <s.icon className="relative h-4 w-4" />
              <span className="relative">{s.label}</span>
            </button>
          ))}
        </motion.div>
        <motion.div {...fadeUp} className="mx-auto mt-8 max-w-5xl" style={{ perspective: 1600 }}>
          <div className="rounded-2xl border border-slate-200 bg-slate-100 p-2 shadow-2xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-800 dark:shadow-black/40">
            <AnimatePresence mode="wait">
              <motion.img
                key={current.key}
                src={current.src}
                alt={`${current.label} dashboard`}
                initial={{ opacity: 0, rotateX: 8, y: 20 }}
                animate={{ opacity: 1, rotateX: 0, y: 0 }}
                exit={{ opacity: 0, rotateX: -6, y: -12 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="w-full rounded-xl"
              />
            </AnimatePresence>
          </div>
          <AnimatePresence mode="wait">
            <motion.p
              key={current.key}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-5 text-center text-sm text-slate-600 dark:text-slate-400"
            >
              {current.caption}
            </motion.p>
          </AnimatePresence>
        </motion.div>
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
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {ROLES.map((r, i) => (
            <motion.div
              key={r.role}
              initial={{ opacity: 0, y: 30, rotateX: -12 }}
              whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.08, type: 'spring', stiffness: 180, damping: 20 }}
              style={{ transformPerspective: 1000 }}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/50 dark:text-teal-300">
                <r.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-bold text-ink dark:text-white">{roleLabel[r.role]}</h3>
              <ul className="mt-3 space-y-2">
                {r.points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
                    {p}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Intelligence() {
  return (
    <section id="intelligence" className="relative overflow-hidden bg-ink py-24">
      <HeroBackdrop />
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <motion.p {...fadeUp} className="text-xs font-bold tracking-[0.2em] text-teal-300 uppercase">
            AI & machine learning
          </motion.p>
          <motion.h2 {...fadeUp} className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Decisions backed by models, not guesswork
          </motion.h2>
          <motion.p {...fadeUp} className="mt-4 text-base leading-relaxed text-slate-300">
            Two independent pipelines — Spark MLlib for big-data scale and Python/XGBoost for precision — train on your order history, and the
            dashboards show where they agree. A built-in assistant answers questions about whichever page you are on.
          </motion.p>
          <motion.div {...fadeUp} className="mt-8 grid gap-4 sm:grid-cols-2">
            {[
              { icon: Layers, title: 'Dual pipelines', text: 'Spark MLlib and XGBoost, compared side by side.' },
              { icon: Bot, title: 'Page-aware assistant', text: 'Ask about the data on the screen in plain language.' },
            ].map((c) => (
              <div key={c.title} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <c.icon className="h-5 w-5 text-teal-300" />
                <p className="mt-3 font-semibold text-white">{c.title}</p>
                <p className="mt-1 text-sm text-slate-400">{c.text}</p>
              </div>
            ))}
          </motion.div>
        </div>
        <div className="flex flex-wrap gap-3">
          {ML_MODULES.map((m, i) => (
            <motion.span
              key={m}
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, type: 'spring', stiffness: 260, damping: 18 }}
              whileHover={{ y: -4, scale: 1.05 }}
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-black/20 backdrop-blur"
            >
              <Brain className="h-4 w-4 text-teal-300" />
              {m}
            </motion.span>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorks() {
  return (
    <section className="bg-white py-24 dark:bg-slate-900">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading eyebrow="How it works" title="From order to insight, automatically" text="No spreadsheets, no end-of-day exports — the loop closes on its own." />
        <div className="relative mt-14 grid gap-6 md:grid-cols-3">
          <div className="absolute top-8 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-transparent via-brand-300 to-transparent md:block dark:via-brand-700" />
          {STEPS.map((s, i) => (
            <motion.div key={s.title} {...fadeUp} transition={{ ...fadeUp.transition, delay: i * 0.12 }} className="relative text-center">
              <span className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-xl shadow-brand-500/30">
                <s.icon className="h-7 w-7" />
                <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-white ring-4 ring-white dark:ring-slate-900">
                  {i + 1}
                </span>
              </span>
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
    <section className="bg-slate-50 px-4 py-20 sm:px-6 dark:bg-slate-950">
      <motion.div
        {...fadeUp}
        className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-700 to-ink px-6 py-14 text-center shadow-2xl shadow-brand-900/30 sm:px-12"
      >
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-teal-300/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-amber-300/15 blur-3xl" />
        <h2 className="relative text-3xl font-extrabold tracking-tight text-white sm:text-4xl">See DineIQ running on real data</h2>
        <p className="relative mx-auto mt-4 max-w-xl text-teal-50/90">
          Sign in with any demo role — admin, branch manager, inventory or cashier — and explore the full platform.
        </p>
        <div className="relative mt-8 flex justify-center">
          <Link
            to="/login"
            className="group inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-ink shadow-xl transition hover:-translate-y-0.5"
          >
            Try the live demo
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
        </div>
      </motion.div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-ink">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 py-10 sm:flex-row sm:px-6">
        <Logo light />
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
    <div className="min-h-full bg-white dark:bg-slate-950">
      <LandingNav />
      <main>
        <Hero />
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
