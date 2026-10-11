import { Crosshair, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useDispatch, useSelector } from 'react-redux'
import { errorMessage, useAddAddressMutation, useDeleteAddressMutation, useUpdateAddressMutation } from '../../app/api'
import { EmptyState, Field, Modal } from '../../components/ui'
import { selectUser, setUser } from '../../features/auth/authSlice'

const EMPTY = { label: 'Home', name: '', phone: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '', isDefault: false }
const LABELS = ['Home', 'Work', 'Other']
const FIELDS = ['label', 'name', 'phone', 'line1', 'line2', 'landmark', 'city', 'state', 'pincode', 'isDefault', 'location']

// Strip server-only fields (_id) and empty optionals before sending.
function toBody(form) {
  const body = {}
  for (const k of FIELDS) {
    const v = form[k]
    if (v === '' || v === undefined || v === null) continue
    if (k === 'location' && typeof v.lat !== 'number') continue
    body[k] = v
  }
  body.isDefault = !!form.isDefault
  return body
}

export default function Addresses() {
  const user = useSelector(selectUser)
  const dispatch = useDispatch()
  const [editing, setEditing] = useState(null) // null | 'new' | address._id
  const [form, setForm] = useState(EMPTY)
  const [locating, setLocating] = useState(false)
  const [addAddress, { isLoading: adding }] = useAddAddressMutation()
  const [updateAddress, { isLoading: updating }] = useUpdateAddressMutation()
  const [deleteAddress] = useDeleteAddressMutation()
  const addresses = user?.addresses || []

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const openNew = () => {
    setForm({ ...EMPTY, name: user.name, phone: user.phone || '', isDefault: addresses.length === 0 })
    setEditing('new')
  }
  const openEdit = (a) => {
    setForm({ ...EMPTY, ...a })
    setEditing(a._id)
  }

  const run = async (fn, msg) => {
    try {
      const res = await fn()
      dispatch(setUser(res.user))
      if (msg) toast.success(msg)
      return true
    } catch (e) {
      toast.error(errorMessage(e))
      return false
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    const body = toBody(form)
    const ok =
      editing === 'new'
        ? await run(() => addAddress(body).unwrap(), 'Address added')
        : await run(() => updateAddress({ id: editing, ...body }).unwrap(), 'Address updated')
    if (ok) setEditing(null)
  }

  const locate = () => {
    if (!navigator.geolocation) return toast.error('Location is not supported on this device')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({ ...f, location: { lat: pos.coords.latitude, lng: pos.coords.longitude } }))
        setLocating(false)
        toast.success('Location captured')
      },
      () => {
        setLocating(false)
        toast.error('Could not get your location. Please allow location access.')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Saved addresses</h1>
        <button className="btn-primary btn-sm" onClick={openNew}>
          <Plus className="size-4" /> Add new
        </button>
      </div>

      {addresses.length === 0 ? (
        <EmptyState
          icon="📍"
          title="No saved addresses"
          text="Add your home or office address for faster checkout."
          action={
            <button className="btn-primary" onClick={openNew}>
              Add address
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {addresses.map((a) => (
            <div key={a._id} className={`card flex flex-col p-4 ${a.isDefault ? 'border-gold' : ''}`}>
              <div className="mb-2 flex items-center gap-2">
                <MapPin className="size-4 text-brand" />
                <span className="font-semibold">{a.label}</span>
                {a.isDefault && <span className="chip bg-primary-soft text-brand">Default</span>}
              </div>
              <p className="text-sm font-medium">{a.name}</p>
              <p className="text-sm text-muted">
                {[a.line1, a.line2, a.landmark, a.city, a.state].filter(Boolean).join(', ')} - {a.pincode}
              </p>
              <p className="text-sm text-muted">📞 {a.phone}</p>
              <div className="mt-auto flex flex-wrap gap-2 pt-3">
                <button className="btn-outline btn-sm" onClick={() => openEdit(a)}>
                  <Pencil className="size-3.5" /> Edit
                </button>
                {!a.isDefault && (
                  <button
                    className="btn-ghost btn-sm"
                    onClick={() => run(() => updateAddress({ id: a._id, ...toBody({ ...a, isDefault: true }) }).unwrap(), 'Default address updated')}
                  >
                    Set as default
                  </button>
                )}
                <button
                  className="btn-ghost btn-sm ml-auto text-error"
                  aria-label="Delete address"
                  onClick={() => confirm('Delete this address?') && run(() => deleteAddress(a._id).unwrap(), 'Address deleted')}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add address' : 'Edit address'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn-primary" form="address-form" disabled={adding || updating}>
              {adding || updating ? 'Saving…' : 'Save address'}
            </button>
          </>
        }
      >
        <form id="address-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <span className="label">Save as</span>
            <div className="flex gap-2">
              {LABELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setForm({ ...form, label: l })}
                  className={`chip min-h-9 px-4 text-sm ${form.label === l ? 'bg-primary text-on-primary' : 'bg-surface-2'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <Field label="Full name">
            <input className="input" required value={form.name} onChange={set('name')} />
          </Field>
          <Field label="Mobile number">
            <input
              className="input"
              required
              inputMode="numeric"
              maxLength={10}
              pattern="[6-9][0-9]{9}"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <Field label="Flat / house no., building" className="sm:col-span-2">
            <input className="input" required value={form.line1} onChange={set('line1')} />
          </Field>
          <Field label="Area / street">
            <input className="input" value={form.line2} onChange={set('line2')} />
          </Field>
          <Field label="Landmark">
            <input className="input" value={form.landmark} onChange={set('landmark')} />
          </Field>
          <Field label="City">
            <input className="input" required value={form.city} onChange={set('city')} />
          </Field>
          <Field label="State">
            <input className="input" required value={form.state} onChange={set('state')} />
          </Field>
          <Field label="Pincode">
            <input
              className="input"
              required
              inputMode="numeric"
              maxLength={6}
              pattern="[0-9]{6}"
              value={form.pincode}
              onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
          <div className="flex flex-col justify-end">
            <button type="button" className="btn-outline" onClick={locate} disabled={locating}>
              <Crosshair className="size-4" /> {locating ? 'Locating…' : 'Use my current location'}
            </button>
          </div>
          {form.location?.lat && (
            <p className="text-xs text-brand sm:col-span-2">
              📍 Pin saved: {form.location.lat.toFixed(5)}, {form.location.lng.toFixed(5)}
            </p>
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-brand)]"
              checked={!!form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            />
            Make this my default address
          </label>
        </form>
      </Modal>
    </div>
  )
}
