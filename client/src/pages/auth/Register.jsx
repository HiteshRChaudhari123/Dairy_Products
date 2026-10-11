import { useState } from 'react'
import toast from 'react-hot-toast'
import { useDispatch } from 'react-redux'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { errorMessage, useRegisterMutation } from '../../app/api'
import { Field } from '../../components/ui'
import { setUser } from '../../features/auth/authSlice'
import { safeNext } from '../../components/guards'
import AuthShell from './AuthShell'

export default function Register() {
  const [params] = useSearchParams()
  const [register, { isLoading }] = useRegisterMutation()
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirm: '',
    referralCode: params.get('ref') || '',
    terms: false,
  })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters')
    if (form.password !== form.confirm) return toast.error('Passwords do not match')
    if (!form.terms) return toast.error('Please accept the terms to continue')
    try {
      const res = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone || undefined,
        password: form.password,
        referralCode: form.referralCode.trim() || undefined,
      }).unwrap()
      dispatch(setUser(res.user))
      toast.success('Welcome to Gavyora! 🥛')
      navigate(safeNext(params.get('next')), { replace: true })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Order fresh dairy, start a milk subscription and track every delivery.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name">
          <input className="input" required minLength={2} autoComplete="name" value={form.name} onChange={set('name')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email">
            <input className="input" type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Mobile (optional)">
            <input
              className="input"
              inputMode="numeric"
              maxLength={10}
              autoComplete="tel-national"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field label="Password" hint="At least 8 characters">
            <input className="input" type="password" required autoComplete="new-password" value={form.password} onChange={set('password')} />
          </Field>
          <Field label="Confirm password">
            <input className="input" type="password" required autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
          </Field>
        </div>
        <Field label="Referral code (optional)" hint="Got a code from a friend? You'll both get a wallet bonus.">
          <input
            className="input uppercase"
            value={form.referralCode}
            onChange={(e) => setForm({ ...form, referralCode: e.target.value.toUpperCase() })}
          />
        </Field>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--color-brand)]"
            checked={form.terms}
            onChange={(e) => setForm({ ...form, terms: e.target.checked })}
          />
          <span>
            I agree to the{' '}
            <Link to="/terms" className="link" target="_blank">
              Terms
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="link" target="_blank">
              Privacy policy
            </Link>
          </span>
        </label>
        <button className="btn-primary w-full" disabled={isLoading}>
          {isLoading ? 'Creating account…' : 'Create account'}
        </button>
        <p className="text-center text-sm">
          Already have an account?{' '}
          <Link to="/login" className="link">
            Log in
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
