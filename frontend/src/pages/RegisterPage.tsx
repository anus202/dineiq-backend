import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, ErrorBanner, TextField, useToast } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { apiErrorMessage } from '../services/api'
import { authApi } from '../services/endpoints'
import { AuthShell } from './LoginPage'

/** Public self-registration (always a CUSTOMER account, per the backend). */
export function RegisterPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState({ FullName: '', Email: '', PhoneNumber: '', Password: '' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const response = await authApi.signup({ ...form, PhoneNumber: form.PhoneNumber || undefined })
      if (!response.Success) throw new Error(response.Message)
      await login(form.Email, form.Password)
      toast.success('Welcome to DineIQ Rewards')
      navigate('/customer', { replace: true })
    } catch (err) {
      setError(apiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Join DineIQ Rewards" subtitle="Earn points on every bill and unlock Gold and Platinum discounts.">
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <TextField label="Full name" required value={form.FullName} onChange={set('FullName')} />
        <TextField label="Email" type="email" required value={form.Email} onChange={set('Email')} />
        <TextField label="Phone" value={form.PhoneNumber} onChange={set('PhoneNumber')} placeholder="0300-1234567" hint="Links your orders and points" />
        <TextField label="Password" type="password" required minLength={8} value={form.Password} onChange={set('Password')} hint="At least 8 characters" />
        <Button type="submit" className="w-full" size="lg" loading={busy}>
          Create account
        </Button>
        <p className="text-center text-sm text-slate-500">
          Have an account?{' '}
          <Link to="/login" className="font-medium text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
