import { AnimatePresence, motion } from 'framer-motion'
import { Building2, Package, Receipt, Shield, type LucideIcon } from 'lucide-react'
import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button, ErrorBanner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { apiErrorMessage } from '../services/api'
import type { RoleName } from '../types/api'
import { homeFor } from '../utils/roles'

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5" aria-hidden>
      <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5v-11Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="m4 6.5 8 6 8-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5" aria-hidden>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 10.5V7.5a4 4 0 1 1 8 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5" aria-hidden>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" className="h-4.5 w-4.5" aria-hidden>
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10.6 5.64A10.8 10.8 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.6 15.6 0 0 1-3.3 4.13M6.4 6.9C4 8.6 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.1 0 2.1-.19 3-.52M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconField({
  icon,
  trailing,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { icon: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">{icon}</span>
      <input
        {...rest}
        className={`w-full rounded-xl border border-slate-200 bg-white/80 py-2.5 pr-11 pl-10.5 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm outline-none backdrop-blur-sm transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100 ${rest.className ?? ''}`}
      />
      {trailing && <span className="absolute inset-y-0 right-3 flex items-center">{trailing}</span>}
    </div>
  )
}

export function GlassField({
  label,
  hint,
  error,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold tracking-wide text-slate-500 uppercase">{label}</span>
      <input
        {...rest}
        className={`w-full rounded-xl border border-slate-200 bg-white/80 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 shadow-sm outline-none backdrop-blur-sm transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100 ${className}`}
      />
      {error ? (
        <span className="mt-1 block text-[11px] text-rose-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>
      ) : null}
    </label>
  )
}

const DEMO_PASSWORD = 'Demo@12345'
const DEMO_ROLES: { role: RoleName; label: string; icon: LucideIcon; email: string }[] = [
  { role: 'ADMIN', label: 'Admin', icon: Shield, email: 'admin@dineiq.demo' },
  { role: 'RESTAURANT_MANAGER', label: 'Branch Manager', icon: Building2, email: 'manager@dineiq.demo' },
  { role: 'INVENTORY_MANAGER', label: 'Inventory', icon: Package, email: 'inventory@dineiq.demo' },
  { role: 'CASHIER', label: 'Cashier', icon: Receipt, email: 'cashier@dineiq.demo' },
]

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState(DEMO_ROLES[0].email)
  const [password, setPassword] = useState(DEMO_PASSWORD)
  const [demoRole, setDemoRole] = useState<RoleName | null>(DEMO_ROLES[0].role)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={homeFor(user.Role)} replace />

  const pickDemoRole = (role: RoleName, roleEmail: string) => {
    setDemoRole(role)
    setEmail(roleEmail)
    setPassword(DEMO_PASSWORD)
    setError(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const signedIn = await login(email.trim(), password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : homeFor(signedIn.Role), { replace: true })
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthCardShell title="Welcome back" subtitle="Sign in to your DineIQ account">
      <form onSubmit={submit} className="space-y-4">
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <ErrorBanner message={error} />
            </motion.div>
          )}
        </AnimatePresence>

        <label className="block">
          <span className="mb-1.5 block text-[10px] font-semibold tracking-wide text-slate-500 uppercase">Email</span>
          <IconField
            icon={<MailIcon />}
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setDemoRole(null)
            }}
            placeholder="you@restaurant.pk"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[10px] font-semibold tracking-wide text-slate-500 uppercase">Password</span>
          <IconField
            icon={<LockIcon />}
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              setDemoRole(null)
            }}
            placeholder="••••••••"
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="rounded-md p-1 text-slate-400 transition hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-brand-400/50 focus-visible:outline-none"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                <EyeIcon open={showPassword} />
              </button>
            }
          />
        </label>

        <Button type="submit" size="lg" loading={busy} className="!mt-6 w-full shadow-lg shadow-brand-500/20">
          Sign in
        </Button>

        <div className="pt-1">
          <p className="mb-2 text-center text-[10px] font-semibold tracking-wide text-slate-400 uppercase">Quick demo login — pick a role</p>
          <div className="grid grid-cols-4 gap-1.5">
            {DEMO_ROLES.map((r) => {
              const Icon = r.icon
              const active = demoRole === r.role
              return (
                <button
                  key={r.role}
                  type="button"
                  onClick={() => pickDemoRole(r.role, r.email)}
                  aria-pressed={active}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-1.5 py-2.5 text-center text-[10.5px] leading-tight font-semibold transition ${
                    active
                      ? 'border-transparent bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-500/30'
                      : 'border-slate-200 text-slate-600 hover:border-brand-200 hover:bg-brand-50/60'
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{r.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <p className="border-t border-slate-200 pt-4 text-center text-sm text-slate-500">
          New diner?{' '}
          <Link to="/register" className="font-medium text-brand-700 transition hover:text-brand-600 hover:underline">
            Create a rewards account
          </Link>
        </p>
      </form>
    </AuthCardShell>
  )
}

const PARTICLES: { top: string; left: string; size: number; delay: number; gold?: boolean }[] = [
  { top: '12%', left: '15%', size: 7, delay: 0 },
  { top: '32%', left: '10%', size: 5, delay: 2 },
  { top: '20%', left: '86%', size: 6, delay: 1, gold: true },
  { top: '64%', left: '90%', size: 8, delay: 3 },
  { top: '74%', left: '18%', size: 5, delay: 1.5, gold: true },
  { top: '8%', left: '60%', size: 6, delay: 2.5 },
  { top: '86%', left: '60%', size: 7, delay: 0.5 },
  { top: '46%', left: '6%', size: 5, delay: 3.5, gold: true },
  { top: '5%', left: '40%', size: 6, delay: 1.2 },
  { top: '90%', left: '42%', size: 7, delay: 2.2 },
  { top: '15%', left: '48%', size: 4, delay: 0.8, gold: true },
  { top: '55%', left: '78%', size: 5, delay: 2.8 },
  { top: '38%', left: '28%', size: 4, delay: 1.8 },
  { top: '68%', left: '52%', size: 5, delay: 3.2, gold: true },
  { top: '28%', left: '92%', size: 4, delay: 0.3 },
  { top: '80%', left: '30%', size: 6, delay: 2.6 },
]

function AuthBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-ink" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(15,118,110,0.9),transparent_55%),radial-gradient(circle_at_85%_15%,rgba(19,78,74,0.8),transparent_50%),radial-gradient(circle_at_55%_90%,rgba(12,74,68,0.85),transparent_55%)]" />

      <motion.div
        className="absolute top-1/2 left-1/2 h-[140vmax] w-[140vmax] -translate-x-1/2 -translate-y-1/2 opacity-40"
        style={{
          background:
            'conic-gradient(from 0deg, transparent 0deg, rgba(45,212,191,0.25) 60deg, transparent 140deg, rgba(251,191,36,0.12) 220deg, transparent 300deg, rgba(45,212,191,0.2) 360deg)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 50, repeat: Infinity, ease: 'linear' }}
      />

      <motion.div
        className="absolute -top-32 -left-32 h-[30rem] w-[30rem] rounded-full bg-teal-400/35 blur-[110px]"
        animate={{ x: [0, 60, 0], y: [0, 40, 0], scale: [1, 1.15, 1] }}
        transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-28 -bottom-28 h-96 w-96 rounded-full bg-amber-400/20 blur-[110px]"
        animate={{ x: [0, -40, 0], y: [0, -30, 0], scale: [1, 1.2, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-1/3 right-1/4 h-72 w-72 rounded-full bg-cyan-300/20 blur-[100px]"
        animate={{ x: [0, -30, 20, 0], y: [0, 30, -10, 0] }}
        transition={{ duration: 19, repeat: Infinity, ease: 'easeInOut' }}
      />

      {PARTICLES.map((p, i) => (
        <motion.span
          key={i}
          className={`absolute rounded-full ${p.gold ? 'bg-amber-300/80' : 'bg-teal-300/80'}`}
          style={{
            top: p.top,
            left: p.left,
            width: p.size,
            height: p.size,
            boxShadow: p.gold ? '0 0 10px 2px rgba(252,211,77,0.6)' : '0 0 10px 2px rgba(94,234,212,0.6)',
          }}
          animate={{ y: [0, -34, 0], x: [0, 16, 0], opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 6 + i * 0.35, repeat: Infinity, ease: 'easeInOut', delay: p.delay }}
        />
      ))}

      <motion.svg
        className="absolute bottom-0 left-0 h-48 w-[130%] opacity-70"
        viewBox="0 0 1440 200"
        preserveAspectRatio="none"
        aria-hidden
        animate={{ x: ['0%', '-13%', '0%'] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      >
        <path d="M0,120 C240,60 480,160 720,100 C960,40 1200,140 1440,90 L1440,200 L0,200 Z" fill="rgba(20,184,166,0.14)" />
        <path d="M0,150 C260,100 500,180 740,130 C980,80 1220,170 1440,120 L1440,200 L0,200 Z" fill="rgba(20,184,166,0.22)" />
      </motion.svg>

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_45%,rgba(7,26,23,0.1),rgba(7,26,23,0.55))]" />
    </div>
  )
}

export function AuthCardShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <AuthBackdrop />

      <div className="relative w-full max-w-sm">
        <div
          className="absolute inset-0 rotate-[-2deg] translate-x-4 translate-y-5 rounded-[28px] border border-white/20 bg-white/5"
          aria-hidden
        />
        <div
          className="absolute inset-0 rotate-[1.5deg] translate-x-[-14px] translate-y-6 rounded-[28px] border border-white/15 bg-white/[0.03]"
          aria-hidden
        />

        <motion.div
          initial={{ opacity: 0, y: 22, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="relative rounded-[28px] border border-white bg-white/90 p-7 shadow-2xl shadow-black/40 backdrop-blur-2xl sm:p-8"
        >
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/30">
              <img src="/favicon.svg" alt="" className="h-6.5 w-6.5" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-ink">DineIQ</h2>
            <p className="mt-0.5 text-[10px] font-semibold tracking-[0.18em] text-brand-600 uppercase">Dining Intelligence</p>
          </div>

          <div className="mb-6 text-center">
            <h1 className="text-[17px] font-bold text-ink">{title}</h1>
            <p className="mt-1 text-[11.5px] text-slate-500">{subtitle}</p>
          </div>

          {children}
        </motion.div>
      </div>
    </div>
  )
}
