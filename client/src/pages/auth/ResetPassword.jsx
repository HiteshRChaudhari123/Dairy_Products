import { useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { errorMessage, useResetPasswordMutation } from '../../app/api'
import { Field } from '../../components/ui'
import AuthShell from './AuthShell'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [reset, { isLoading }] = useResetPasswordMutation()
  const navigate = useNavigate()
  const [form, setForm] = useState({ password: '', confirm: '' })

  const submit = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters')
    if (form.password !== form.confirm) return toast.error('Passwords do not match')
    try {
      const res = await reset({ token, password: form.password }).unwrap()
      toast.success(res.message || 'Password updated')
      navigate('/login?mode=password', { replace: true })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose a strong password you haven't used before.">
      {!token ? (
        <div className="space-y-4 text-sm">
          <p>This reset link is missing or incomplete.</p>
          <Link to="/forgot-password" className="btn-primary w-full">
            Request a new link
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="New password" hint="At least 8 characters">
            <input
              className="input"
              type="password"
              required
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <Field label="Confirm new password">
            <input
              className="input"
              type="password"
              required
              autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            />
          </Field>
          <button className="btn-primary w-full" disabled={isLoading}>
            {isLoading ? 'Saving…' : 'Update password'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
