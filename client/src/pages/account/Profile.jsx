import { Gift, Package, RefreshCw, Wallet } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useDispatch, useSelector } from 'react-redux'
import {
  errorMessage,
  useChangePasswordMutation,
  useMyOrdersQuery,
  useMySubscriptionsQuery,
  useUpdateProfileMutation,
} from '../../app/api'
import { Field, StatCard } from '../../components/ui'
import { selectUser, setUser } from '../../features/auth/authSlice'
import { formatINR } from '../../lib/format'

export default function Profile() {
  const user = useSelector(selectUser)
  const dispatch = useDispatch()
  const { data: orders = [] } = useMyOrdersQuery()
  const { data: subs = [] } = useMySubscriptionsQuery()
  const [updateProfile, { isLoading: saving }] = useUpdateProfileMutation()
  const [changePassword, { isLoading: changing }] = useChangePasswordMutation()

  const [form, setForm] = useState({ name: user.name || '', email: user.email || '', phone: user.phone || '' })
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' })

  const saveProfile = async (e) => {
    e.preventDefault()
    const body = { name: form.name.trim() }
    if (form.email.trim()) body.email = form.email.trim()
    if (form.phone.trim()) body.phone = form.phone.trim()
    try {
      const res = await updateProfile(body).unwrap()
      dispatch(setUser(res.user))
      toast.success('Profile updated')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const savePassword = async (e) => {
    e.preventDefault()
    if (pw.newPassword.length < 8) return toast.error('Password must be at least 8 characters')
    if (pw.newPassword !== pw.confirm) return toast.error('Passwords do not match')
    try {
      await changePassword({ currentPassword: pw.currentPassword || undefined, newPassword: pw.newPassword }).unwrap()
      setPw({ currentPassword: '', newPassword: '', confirm: '' })
      toast.success('Password updated')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const activeSubs = subs.filter((s) => s.status === 'active').length

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My profile</h1>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={Package} label="Orders" value={orders.length} />
        <StatCard icon={Wallet} label="Wallet" value={formatINR(user.wallet)} tone="accent" />
        <StatCard icon={Gift} label="Points" value={user.loyaltyPoints || 0} tone="secondary" />
        <StatCard icon={RefreshCw} label="Subscriptions" value={activeSubs} sub="active" />
      </div>

      <form onSubmit={saveProfile} className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">Personal details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" className="sm:col-span-2">
            <input className="input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Mobile number" hint="10-digit Indian mobile number">
            <input
              className="input"
              inputMode="numeric"
              maxLength={10}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      <form onSubmit={savePassword} className="card space-y-4 p-5">
        <div>
          <h2 className="text-lg font-semibold">Password</h2>
          <p className="text-sm text-muted">Signed up with mobile OTP? Leave the current password empty to set one.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Current password">
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={pw.currentPassword}
              onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
            />
          </Field>
          <Field label="New password">
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              required
              value={pw.newPassword}
              onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
            />
          </Field>
          <Field label="Confirm new password">
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              required
              value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex justify-end">
          <button className="btn-outline" disabled={changing}>
            {changing ? 'Updating…' : 'Update password'}
          </button>
        </div>
      </form>
    </div>
  )
}
