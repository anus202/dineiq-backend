import { motion } from 'framer-motion'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button, ErrorBanner, TextField } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { apiErrorMessage } from '../services/api'
import { homeFor } from '../utils/roles'

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    <AuthShell title="Sign in to DineIQ" subtitle="Restaurant intelligence for admins, stock, front-of-house and diners.">
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <TextField label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@restaurant.pk" />
        <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit" className="w-full" size="lg" loading={busy}>
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
