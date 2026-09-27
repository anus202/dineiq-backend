import { AnimatePresence, motion } from 'framer-motion'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button, ErrorBanner } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { apiErrorMessage } from '../services/api'
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

/** Inline field used on the auth pages — icon + trailing-slot styling that the shared
 * `TextField` (label-above, no icon) doesn't support. Same input semantics/classes as
 * the app's regular `field-input`, just with room for an icon and a trailing button. */
function IconField({
  icon,
  trailing,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">{icon}</span>
      <input {...rest} className={`field-input pr-11 pl-10.5 ${rest.className ?? ''}`} />
      {trailing && <span className="absolute inset-y-0 right-3 flex items-center">{trailing}</span>}
    </div>
  )
}

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={homeFor(user.Role)} replace />

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
    <AuthShell title="Welcome back" subtitle="Sign in to your DineIQ account" heroSide="left">
      <form onSubmit={submit} className="space-y-4">
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <ErrorBanner message={error} />
            </motion.div>
          )}
        </AnimatePresence>

        <label className="block">
          <span className="field-label">Email</span>
          <IconField
            icon={<MailIcon />}
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@restaurant.pk"
          />
        </label>

        <label className="block">
          <span className="field-label">Password</span>
          <IconField
            icon={<LockIcon />}
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
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

        <Button type="submit" size="lg" loading={busy} className="!mt-6 w-full">
          Sign in
        </Button>

        <p className="text-center text-sm text-slate-500">
          New diner?{' '}
          <Link to="/register" className="font-medium text-brand-700 hover:underline">
            Create a rewards account
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}

/** Split-screen hero panel shared by the login and register pages — teal gradient with
 * bold rotated accent blocks, echoing the app's brand colors in a "boutique restaurant
 * management" register. */
function AuthHero() {
  return (
    <div className="relative flex h-full flex-col justify-between overflow-hidden bg-brand-700 p-10 text-white lg:p-12">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-10 -right-16 h-52 w-52 rotate-[20deg] rounded-[28px] bg-white/[0.08]" />
        <div className="absolute -bottom-12 -left-10 h-44 w-44 -rotate-[15deg] rounded-3xl bg-amber-400/15" />
        <div className="absolute top-52 right-10 h-16 w-16 rotate-[35deg] rounded-2xl bg-white/10" />
      </div>
      <div className="relative flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
          <img src="/favicon.svg" alt="" className="h-5 w-5" />
        </div>
        <span className="text-lg font-semibold">DineIQ</span>
      </div>
      <div className="relative">
        <h2 className="text-3xl leading-tight font-bold lg:text-4xl">
          Effortless dining,
          <br />
          powered by data.
        </h2>
        <p className="mt-4 max-w-sm text-sm text-teal-100/80">
          Live revenue, demand forecasts and a fast POS — for restaurants that run on more than instinct.
        </p>
      </div>
      <p className="relative text-xs text-teal-100/50">© DineIQ Analytics</p>
    </div>
  )
}

export function AuthShell({
  title,
  subtitle,
  children,
  heroSide = 'left',
}: {
  title: string
  subtitle: string
  children: ReactNode
  heroSide?: 'left' | 'right'
}) {
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className={`relative hidden lg:block ${heroSide === 'right' ? 'lg:order-2' : ''}`}>
        <AuthHero />
      </div>
      <div className="flex items-center justify-center p-6">
        <motion.div className="w-full max-w-sm" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          <p className="mt-1 mb-8 text-sm text-slate-500">{subtitle}</p>
          {children}
        </motion.div>
      </div>
    </div>
  )
}
