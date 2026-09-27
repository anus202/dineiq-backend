import { AnimatePresence, motion } from 'framer-motion'
import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
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

/** Light labeled field with an optional leading icon and trailing slot (used for the
 * password show/hide toggle). Shares visual language with `GlassField` below but
 * carries the icon gutter that the plain text fields (full name, phone, ...) don't need. */
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

/** Light labeled field with no icon gutter, for plain text inputs (register form). */
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
            onChange={(e) => setEmail(e.target.value)}
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

        <Button type="submit" size="lg" loading={busy} className="!mt-6 w-full shadow-lg shadow-brand-500/20">
          Sign in
        </Button>

        <p className="pt-1 text-center text-[10.5px] tracking-widest text-slate-400 uppercase">Secure · Smart · DineIQ</p>

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

/** Ambient premium backdrop shared by the login/register cards: a soft slate+teal wash
 * matching the app's own light background (slate-100), with two gently drifting
 * blurred teal glow blobs. No video/photo asset exists in the project, so this is the
 * CSS-only "living background" fallback the brief allows. */
function AuthBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(20,184,166,0.16),transparent_50%),radial-gradient(circle_at_85%_85%,rgba(20,184,166,0.12),transparent_50%)] bg-slate-100" />
      <motion.div
        className="absolute -top-20 -left-20 h-72 w-72 rounded-full bg-teal-300/35 blur-[90px]"
        animate={{ x: [0, 30, 0], y: [0, 20, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-16 -bottom-16 h-60 w-60 rounded-full bg-brand-500/25 blur-[90px]"
        animate={{ x: [0, -20, 0], y: [0, -15, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

/** Shared centered "glass card" shell for the login and register pages: the light,
 * theme-matching backdrop above, plus two faint offset panels behind the real card for
 * a stacked, layered-screens depth effect. */
export function AuthCardShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-10 sm:px-6">
      <AuthBackdrop />

      <div className="relative w-full max-w-sm">
        <div
          className="absolute inset-0 rotate-[-2deg] translate-x-4 translate-y-5 rounded-[28px] border border-white/70 bg-white/25"
          aria-hidden
        />
        <div
          className="absolute inset-0 rotate-[1.5deg] translate-x-[-14px] translate-y-6 rounded-[28px] border border-white/60 bg-white/20"
          aria-hidden
        />

        <motion.div
          initial={{ opacity: 0, y: 22, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="relative rounded-[28px] border border-white bg-white/75 p-7 shadow-2xl shadow-slate-400/25 backdrop-blur-2xl sm:p-8"
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
