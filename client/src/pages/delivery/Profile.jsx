import { FileUp, LogOut, Mail, Phone, Save, Star } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useDispatch, useSelector } from 'react-redux'
import { errorMessage, useDeliveryProfileMutation } from '../../app/api'
import { Field, PageHeader, StatusBadge } from '../../components/ui'
import { selectUser, setUser } from '../../features/auth/authSlice'
import { useLogout } from '../../hooks/useLogout'
import { formatDate } from '../../lib/format'

const FIELDS = ['vehicle', 'licenseNo', 'aadhaarLast4', 'bankAccountLast4', 'ifsc']

export default function Profile() {
  const user = useSelector(selectUser)
  const d = user?.delivery || {}
  const dispatch = useDispatch()
  const logout = useLogout()
  const [save, { isLoading }] = useDeliveryProfileMutation()
  const [form, setForm] = useState(() => Object.fromEntries(FIELDS.map((k) => [k, d[k] || ''])))
  const set = (k, clean) => (e) => setForm((f) => ({ ...f, [k]: clean ? clean(e.target.value) : e.target.value }))
  const digits = (v) => v.replace(/\D/g, '').slice(0, 4)
  const dirty = FIELDS.some((k) => form[k] !== (d[k] || ''))

  const submit = async (e) => {
    e.preventDefault()
    const changed = Object.fromEntries(FIELDS.filter((k) => form[k] !== (d[k] || '')).map((k) => [k, k === 'ifsc' ? form[k].toUpperCase() : form[k]]))
    try {
      const res = await save(changed).unwrap()
      dispatch(setUser(res.user))
      toast.success(d.kycStatus === 'approved' ? 'Profile updated' : 'Details submitted for verification')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Profile & KYC" />

      <section className="card flex flex-wrap items-center gap-4 p-5">
        <span className="flex size-16 items-center justify-center rounded-full bg-primary-soft text-2xl font-bold text-brand">{user?.name?.[0]}</span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">{user?.name}</p>
          <p className="flex items-center gap-1.5 text-sm text-muted"><Phone className="size-3.5" /> {user?.phone}</p>
          {user?.email && <p className="flex items-center gap-1.5 text-sm text-muted"><Mail className="size-3.5" /> {user.email}</p>}
          <p className="text-xs text-muted">Partner since {formatDate(user?.createdAt)}</p>
        </div>
        <div className="text-right">
          <p className="flex items-center justify-end gap-1 text-xl font-bold">
            {Number(d.rating || 0).toFixed(1)} <Star className="size-5 fill-secondary text-secondary" />
          </p>
          <p className="text-xs text-muted">Customer rating</p>
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">KYC status</h2>
          <StatusBadge status={d.kycStatus || 'none'} />
        </div>
        {d.kycNote && <p className="mb-4 rounded-xl bg-secondary-soft p-3 text-sm">Note from Gavyora: {d.kycNote}</p>}
        <p className="mb-4 text-sm text-muted">
          Zone: <b className="text-ink">{d.zone?.name || (d.zone ? 'Assigned' : 'Not assigned yet')}</b>
        </p>

        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Vehicle">
            <input className="input" value={form.vehicle} onChange={set('vehicle')} minLength={2} required />
          </Field>
          <Field label="Driving licence number">
            <input className="input uppercase" value={form.licenseNo} onChange={set('licenseNo')} minLength={4} required />
          </Field>
          <Field label="Aadhaar: last 4 digits">
            <input className="input" inputMode="numeric" value={form.aadhaarLast4} onChange={set('aadhaarLast4', digits)} pattern="\d{4}" required />
          </Field>
          <Field label="Bank account: last 4 digits">
            <input className="input" inputMode="numeric" value={form.bankAccountLast4} onChange={set('bankAccountLast4', digits)} pattern="\d{4}" required />
          </Field>
          <Field label="IFSC code">
            <input className="input uppercase" value={form.ifsc} onChange={set('ifsc', (v) => v.toUpperCase().slice(0, 11))} pattern="[A-Za-z]{4}0[A-Za-z0-9]{6}" required />
          </Field>
          <div className="flex items-end">
            <button className="btn-primary w-full" disabled={!dirty || isLoading}>
              <Save className="size-4" /> {d.kycStatus === 'approved' ? 'Save changes' : 'Submit for verification'}
            </button>
          </div>
        </form>

        <div className="mt-5 flex items-start gap-3 rounded-xl border border-dashed border-line p-4 text-sm text-muted">
          <FileUp className="size-5 shrink-0" />
          Keep your original Aadhaar, driving licence and a cancelled cheque ready: our team checks them in person before approval.
        </div>
      </section>

      <button className="btn-outline w-full text-error" onClick={logout}>
        <LogOut className="size-4" /> Logout
      </button>
    </div>
  )
}
