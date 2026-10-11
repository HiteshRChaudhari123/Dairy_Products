import { ArrowDown, ArrowUp, CreditCard, Plus, Save, Store, Trash2, Truck, Users } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { errorMessage, useAdminSettingsQuery, useUpdateSettingsMutation } from '../../app/api'
import { ErrorState, Field, PageHeader, PageLoader, Toggle } from '../../components/ui'

const TEXT = ['storeName', 'supportPhone', 'supportEmail', 'address', 'fssaiNo', 'gstNo']
const NUM = ['deliveryFee', 'freeDeliveryAbove', 'minOrderValue', 'taxPercent', 'deliveryPayoutPerOrder', 'referralBonus']

const pickForm = (s) => ({
  ...Object.fromEntries(TEXT.map((k) => [k, s[k] ?? ''])),
  ...Object.fromEntries(NUM.map((k) => [k, s[k] ?? 0])),
  codEnabled: !!s.codEnabled,
  slots: [...(s.slots || [])],
})

function Section({ icon: Icon, title, children }) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 flex items-center gap-2 font-semibold">
        <Icon className="size-5 text-brand" /> {title}
      </h2>
      {children}
    </section>
  )
}

export default function Settings() {
  const { data, isLoading, error, refetch } = useAdminSettingsQuery()
  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  // Re-key on save so the form resets to the stored values.
  return <SettingsForm key={data.updatedAt} data={data} />
}

function SettingsForm({ data }) {
  const [save, { isLoading: saving }] = useUpdateSettingsMutation()
  const [form, setForm] = useState(() => pickForm(data))
  const [newSlot, setNewSlot] = useState('')

  const dirty = JSON.stringify(form) !== JSON.stringify(pickForm(data))
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const text = (k, label, props = {}) => (
    <Field label={label}>
      <input className="input" value={form[k]} onChange={set(k)} {...props} />
    </Field>
  )
  const num = (k, label, hint) => (
    <Field label={label} hint={hint}>
      <input className="input" type="number" min={0} step="any" value={form[k]} onChange={set(k)} />
    </Field>
  )
  const moveSlot = (i, d) =>
    setForm((f) => {
      const slots = [...f.slots]
      ;[slots[i], slots[i + d]] = [slots[i + d], slots[i]]
      return { ...f, slots }
    })

  const submit = async (e) => {
    e.preventDefault()
    if (!form.slots.length) return toast.error('Add at least one delivery slot')
    const body = { ...form, ...Object.fromEntries(NUM.map((k) => [k, Number(form[k]) || 0])) }
    try {
      await save(body).unwrap()
      toast.success('Settings saved')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <form onSubmit={submit} className="pb-20">
      <PageHeader title="Global settings" subtitle="These apply to the whole store, website and app." />

      <div className="grid gap-6 xl:grid-cols-2">
        <Section icon={Store} title="Store information">
          <div className="grid gap-4 sm:grid-cols-2">
            {text('storeName', 'Store name', { required: true })}
            {text('supportPhone', 'Support phone')}
            {text('supportEmail', 'Support email', { type: 'email' })}
            {text('fssaiNo', 'FSSAI licence number')}
            {text('gstNo', 'GSTIN')}
            <Field label="Registered address" className="sm:col-span-2">
              <textarea className="input min-h-20" value={form.address} onChange={set('address')} />
            </Field>
          </div>
        </Section>

        <Section icon={Truck} title="Pricing & delivery">
          <div className="grid gap-4 sm:grid-cols-2">
            {num('deliveryFee', 'Delivery fee (₹)')}
            {num('freeDeliveryAbove', 'Free delivery above (₹)')}
            {num('minOrderValue', 'Minimum order value (₹)')}
            {num('taxPercent', 'Tax / GST (%)', 'Fresh milk & curd are GST-exempt; packaged items like ghee/butter/cheese attract 12%')}
          </div>
        </Section>

        <Section icon={CreditCard} title="Payments">
          <Toggle checked={form.codEnabled} onChange={(v) => setForm((f) => ({ ...f, codEnabled: v }))} label="Allow cash on delivery (COD)" />
          <div className="mt-4 rounded-xl bg-accent-soft p-3 text-sm">
            <p className="font-medium">Razorpay (UPI, cards, wallets)</p>
            <p className="mt-1 text-muted">
              For security, API keys are set only in <code className="rounded bg-surface px-1">server/.env</code> (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET), never in this screen. Without keys, online payments are simulated for testing.
            </p>
          </div>
        </Section>

        <Section icon={Users} title="Partners & referrals">
          <div className="grid gap-4 sm:grid-cols-2">
            {num('deliveryPayoutPerOrder', 'Delivery partner payout per order (₹)')}
            {num('referralBonus', 'Referral bonus (₹)', 'Credited to both the referrer and the new customer')}
          </div>
        </Section>

        <Section icon={Truck} title="Delivery time slots">
          <ul className="space-y-2">
            {form.slots.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  className="input"
                  value={s}
                  onChange={(e) => setForm((f) => ({ ...f, slots: f.slots.map((x, j) => (j === i ? e.target.value : x)) }))}
                  aria-label={`Slot ${i + 1}`}
                />
                <button type="button" className="btn-ghost btn-sm px-2" disabled={i === 0} onClick={() => moveSlot(i, -1)} aria-label="Move up">
                  <ArrowUp className="size-4" />
                </button>
                <button type="button" className="btn-ghost btn-sm px-2" disabled={i === form.slots.length - 1} onClick={() => moveSlot(i, 1)} aria-label="Move down">
                  <ArrowDown className="size-4" />
                </button>
                <button type="button" className="btn-ghost btn-sm px-2 text-error" onClick={() => setForm((f) => ({ ...f, slots: f.slots.filter((_, j) => j !== i) }))} aria-label="Remove">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <input className="input" placeholder="e.g. 7:00 PM - 9:00 PM" value={newSlot} onChange={(e) => setNewSlot(e.target.value)} />
            <button
              type="button"
              className="btn-outline"
              disabled={newSlot.trim().length < 3}
              onClick={() => {
                setForm((f) => ({ ...f, slots: [...f.slots, newSlot.trim()] }))
                setNewSlot('')
              }}
            >
              <Plus className="size-4" /> Add
            </button>
          </div>
        </Section>
      </div>

      <div
        className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur transition lg:left-64 ${dirty ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <p className="text-sm font-medium">You have unsaved changes</p>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={() => setForm(pickForm(data))}>Discard</button>
            <button className="btn-primary" disabled={saving}>
              <Save className="size-4" /> Save settings
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}
