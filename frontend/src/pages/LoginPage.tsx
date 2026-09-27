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

/** Inline field used only on the premium login card — icon + dark-glass styling that
 * the shared `TextField` (light, label-above) doesn't support. Same input semantics. */
function GlassField({
  icon,
  trailing,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-white/40">{icon}</span>
      <input
        {...rest}
        className={`w-full rounded-xl border border-white/15 bg-white/5 py-3 pr-11 pl-10.5 text-sm text-white placeholder:text-white/35 shadow-inner shadow-black/10 outline-none backdrop-blur-sm transition focus:border-brand-400/70 focus:bg-white/10 focus:ring-4 focus:ring-brand-400/15 ${rest.className ?? ''}`}
      />
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
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-ink px-4 py-10 sm:px-6">
      {/* Premium animated gradient background — no video asset exists in the project, so
          this gives an equivalent full-screen, non-distracting "living" backdrop using the
          app's own brand colors (teal + amber), per the fallback the brief allows. */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(20,184,166,0.28),transparent_45%),radial-gradient(circle_at_80%_15%,rgba(251,191,36,0.14),transparent_40%),radial-gradient(circle_at_50%_100%,rgba(13,148,136,0.25),transparent_50%)]" />
        <motion.div
          className="absolute top-[-12rem] left-[-8rem] h-[26rem] w-[26rem] rounded-full bg-brand-500/20 blur-3xl"
          animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute right-[-10rem] bottom-[-10rem] h-[24rem] w-[24rem] rounded-full bg-amber-400/10 blur-3xl"
          animate={{ x: [0, -30, 0], y: [0, -20, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        />
        {/* Subtle fixed grid, a common enterprise-SaaS texture, kept faint so it never competes with the form. */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_40%,black,transparent)]" />
        {/* Darkening overlay so the card always reads clearly regardless of viewport size. */}
        <div className="absolute inset-0 bg-ink/35" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md"
      >
        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-8 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-10">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 shadow-lg shadow-brand-500/30">
              <img src="/favicon.svg" alt="" className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">DineIQ</h1>
            <p className="mt-0.5 text-xs font-medium tracking-widest text-brand-300/80 uppercase">Dining Intelligence</p>
          </div>

          <div className="mb-6 text-center">
            <h2 className="text-xl font-semibold text-white">Welcome back</h2>
            <p className="mt-1 text-sm text-white/50">Sign in to your DineIQ account</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  <ErrorBanner message={error} />
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-xs font-medium tracking-wide text-white/60 uppercase">
                Email
              </label>
              <GlassField
                id="login-email"
                icon={<MailIcon />}
                type="email"
                autoComplete="username"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@restaurant.pk"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium tracking-wide text-white/60 uppercase">
                Password
              </label>
              <GlassField
                id="login-password"
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
                    className="rounded-md p-1 text-white/40 transition hover:text-white/80 focus-visible:ring-2 focus-visible:ring-brand-400/50 focus-visible:outline-none"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                }
              />
            </div>

            <Button
              type="submit"
              size="lg"
              loading={busy}
              className="!mt-6 w-full !bg-gradient-to-r !from-brand-500 !to-brand-600 !text-white shadow-lg shadow-brand-500/25 transition hover:!from-brand-400 hover:!to-brand-500 hover:shadow-xl hover:shadow-brand-500/30"
            >
              Sign in
            </Button>

            <p className="pt-1 text-center text-[11px] tracking-widest text-white/30 uppercase">Secure · Smart · DineIQ</p>

            <p className="border-t border-white/10 pt-4 text-center text-sm text-white/50">
              New diner?{' '}
              <Link to="/register" className="font-medium text-brand-300 transition hover:text-brand-200 hover:underline">
                Create a rewards account
              </Link>
            </p>
          </form>
        </div>
      </motion.div>
    </div>
  )
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(20,184,166,0.35),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(251,191,36,0.18),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="" className="h-10 w-10" />
            <span className="text-xl font-semibold">DineIQ</span>
          </div>
          <div>
            <h2 className="text-4xl leading-tight font-semibold">Menu Matrix Dining Intelligence</h2>
            <p className="mt-4 max-w-md text-slate-300">Live revenue, demand heatmaps, RFM segments, stock health and a fast POS, backed by your own restaurant data.</p>
          </div>
          <p className="text-xs text-slate-500">© DineIQ Analytics</p>
        </div>
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
