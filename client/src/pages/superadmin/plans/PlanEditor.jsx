import { ArrowLeft, Archive, Eye, EyeOff, Rocket, Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage, useAdminPlanQuery, useAdminProductsQuery, useCreatePlanMutation, usePublishPlanMutation, useSetPlanStatusMutation, useUpdatePlanMutation, useZonesQuery } from '../../../app/api'
import { usePanelBase } from '../../../components/guards'
import PlanCard from '../../../components/PlanCard'
import { ErrorState, Field, PageHeader, PageLoader, StatusBadge, Toggle } from '../../../components/ui'
import { selectUser } from '../../../features/auth/authSlice'
import { FREQUENCY_TEXT, fromMinor, toMinor } from '../../../lib/billing'
import { formatDateTime, STATUS_LABEL } from '../../../lib/format'
import { ConfirmModal } from '../../admin/_shared'

const DAYS = { month: 30, quarter: 90, year: 365 }
const lines = (t) => t.split('\n').map((s) => s.trim()).filter(Boolean)
const dateOnly = (d) => (d ? String(d).slice(0, 10) : '')

const BLANK = {
  name: '',
  tagline: '',
  description: '',
  termsText: '',
  price: 0,
  interval: 'month',
  durationDays: 30,
  taxPercent: 0,
  sortOrder: 0,
  benefits: { discountPercent: 0, maxDiscount: 0, minOrderForDiscount: 0, freeDelivery: false, freeDeliveryMinOrder: 0, prioritySupport: false, ordersPerTermLimit: 0, exclusiveOffers: '', perks: '' },
  product: { billingMode: 'prepaid', eligible: [], discountPercent: 0, minQty: 1, maxQty: 10, maxItems: 5, frequencies: ['daily', 'alternate', 'weekly', 'custom'], deliveryFee: 0, prepayDays: 30 },
  policies: {
    pause: { allowed: true, minDays: 1, maxDays: 30, noticeDays: 0 },
    cancellation: { mode: 'end_of_term', refund: 'none', refundUnusedBalance: true },
    renewal: { autoRenewAllowed: true },
    gracePeriodDays: 3,
    retry: { attempts: 3, intervalHours: 24 },
  },
  availability: { allZones: true, zones: [] },
  validFrom: '',
  validTo: '',
}

/** API version → form (money in rupees for editing). */
function fromVersion(v, sortOrder = 0) {
  const b = v.benefits || {}
  const p = v.product || {}
  return {
    ...BLANK,
    name: v.name,
    tagline: v.tagline || '',
    description: v.description || '',
    termsText: v.termsText || '',
    price: fromMinor(v.priceMinor),
    interval: v.interval,
    durationDays: v.durationDays,
    taxPercent: v.taxPercent || 0,
    sortOrder,
    benefits: {
      discountPercent: b.discountPercent || 0,
      maxDiscount: fromMinor(b.maxDiscountPerOrderMinor),
      minOrderForDiscount: fromMinor(b.minOrderForDiscountMinor),
      freeDelivery: !!b.freeDelivery,
      freeDeliveryMinOrder: fromMinor(b.freeDeliveryMinOrderMinor),
      prioritySupport: !!b.prioritySupport,
      ordersPerTermLimit: b.ordersPerTermLimit || 0,
      exclusiveOffers: (b.exclusiveOffers || []).join('\n'),
      perks: (b.perks || []).join('\n'),
    },
    product: {
      billingMode: p.billingMode || 'prepaid',
      eligible: (p.eligible || []).map((e) => String(e.product?._id || e.product)),
      discountPercent: p.discountPercent || 0,
      minQty: p.minQty || 1,
      maxQty: p.maxQty || 10,
      maxItems: p.maxItems || 5,
      frequencies: p.frequencies?.length ? p.frequencies : BLANK.product.frequencies,
      deliveryFee: fromMinor(p.deliveryFeeMinor),
      prepayDays: p.prepayDays || 30,
    },
    policies: {
      pause: { ...BLANK.policies.pause, ...(v.policies?.pause || {}) },
      cancellation: { ...BLANK.policies.cancellation, ...(v.policies?.cancellation || {}) },
      renewal: { ...BLANK.policies.renewal, ...(v.policies?.renewal || {}) },
      gracePeriodDays: v.policies?.gracePeriodDays ?? 3,
      retry: { ...BLANK.policies.retry, ...(v.policies?.retry || {}) },
    },
    availability: { allZones: v.availability?.allZones !== false, zones: (v.availability?.zones || []).map(String) },
    validFrom: dateOnly(v.validFrom),
    validTo: dateOnly(v.validTo),
  }
}

/** Form → API version body (integer paise, numbers). */
function toVersion(f, kind) {
  const n = (x) => Number(x) || 0
  const v = {
    name: f.name.trim(),
    tagline: f.tagline.trim() || undefined,
    description: f.description || undefined,
    termsText: f.termsText || undefined,
    priceMinor: toMinor(f.price),
    interval: f.interval,
    durationDays: Math.round(n(f.durationDays)) || 30,
    taxPercent: n(f.taxPercent),
    policies: {
      pause: { allowed: !!f.policies.pause.allowed, minDays: n(f.policies.pause.minDays) || 1, maxDays: n(f.policies.pause.maxDays) || 1, noticeDays: n(f.policies.pause.noticeDays) },
      cancellation: f.policies.cancellation,
      renewal: f.policies.renewal,
      gracePeriodDays: n(f.policies.gracePeriodDays),
      retry: { attempts: n(f.policies.retry.attempts), intervalHours: n(f.policies.retry.intervalHours) || 24 },
    },
    availability: { allZones: !!f.availability.allZones, zones: f.availability.allZones ? [] : f.availability.zones },
    validFrom: f.validFrom || null,
    validTo: f.validTo || null,
  }
  if (kind === 'membership') {
    const b = f.benefits
    v.benefits = {
      discountPercent: n(b.discountPercent),
      maxDiscountPerOrderMinor: toMinor(b.maxDiscount),
      minOrderForDiscountMinor: toMinor(b.minOrderForDiscount),
      freeDelivery: !!b.freeDelivery,
      freeDeliveryMinOrderMinor: toMinor(b.freeDeliveryMinOrder),
      prioritySupport: !!b.prioritySupport,
      ordersPerTermLimit: Math.round(n(b.ordersPerTermLimit)),
      exclusiveOffers: lines(b.exclusiveOffers),
      perks: lines(b.perks),
    }
  } else {
    const p = f.product
    v.product = {
      billingMode: p.billingMode,
      eligible: p.eligible.map((id) => ({ product: id })),
      discountPercent: n(p.discountPercent),
      minQty: Math.round(n(p.minQty)) || 1,
      maxQty: Math.round(n(p.maxQty)) || 1,
      maxItems: Math.round(n(p.maxItems)) || 1,
      frequencies: p.frequencies,
      deliveryFeeMinor: toMinor(p.deliveryFee),
      prepayDays: Math.round(n(p.prepayDays)) || 30,
    }
  }
  return v
}

function Card({ title, children, hint }) {
  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

export default function PlanEditor() {
  const { id } = useParams()
  const isNew = !id
  const base = usePanelBase()
  const navigate = useNavigate()
  const owner = useSelector(selectUser)?.role === 'superadmin'
  const { data, isLoading, error, refetch } = useAdminPlanQuery(id, { skip: isNew })
  const { data: products } = useAdminProductsQuery({ isSubscribable: '1', limit: 100 })
  const { data: zones = [] } = useZonesQuery()
  const [create, { isLoading: creating }] = useCreatePlanMutation()
  const [update, { isLoading: updating }] = useUpdatePlanMutation()
  const [publish, { isLoading: publishing }] = usePublishPlanMutation()
  const [setStatus, { isLoading: setting }] = useSetPlanStatusMutation()
  const [kind, setKind] = useState('membership')
  const [form, setForm] = useState(BLANK)
  const [confirm, setConfirm] = useState(null)

  const plan = data?.plan
  const latest = data?.versions?.[0]
  useEffect(() => {
    if (plan && latest) {
      setKind(plan.kind)
      setForm(fromVersion(latest, plan.sortOrder))
    }
  }, [plan, latest])

  const preview = useMemo(() => ({ _id: 'preview', kind, name: form.name, version: { ...toVersion(form, kind), version: latest?.version || 1 } }), [form, kind, latest])

  if (!isNew && isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  const readOnly = !owner || plan?.status === 'archived'
  const set = (path, value) =>
    setForm((f) => {
      const next = structuredClone(f)
      const keys = path.split('.')
      let o = next
      keys.slice(0, -1).forEach((k) => (o = o[k]))
      o[keys.at(-1)] = value
      return next
    })
  const num = (path, label, props = {}) => {
    const value = path.split('.').reduce((o, k) => o[k], form)
    return (
      <Field label={label} hint={props.hint}>
        <input type="number" className="input" min={props.min ?? 0} step={props.step ?? 'any'} value={value} disabled={readOnly} onChange={(e) => set(path, e.target.value)} />
      </Field>
    )
  }

  const save = async (e) => {
    e.preventDefault()
    if (form.name.trim().length < 2) return toast.error('Give the plan a name')
    if (kind === 'product' && !form.product.frequencies.length) return toast.error('Allow at least one delivery frequency')
    try {
      if (isNew) {
        const r = await create({ kind, sortOrder: Number(form.sortOrder) || 0, version: toVersion(form, kind) }).unwrap()
        toast.success('Draft created. Publish it when ready.')
        navigate(`${base}/plans/${r.plan._id}`, { replace: true })
      } else {
        const r = await update({ id, sortOrder: Number(form.sortOrder) || 0, version: toVersion(form, kind) }).unwrap()
        toast.success(r.version.version !== latest.version ? `Saved as draft version ${r.version.version}. Existing subscribers keep their terms.` : 'Draft saved')
      }
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const runConfirm = async () => {
    try {
      if (confirm === 'publish') await publish({ id }).unwrap()
      else await setStatus({ id, status: confirm }).unwrap()
      toast.success(confirm === 'publish' ? 'Published. New customers now buy this version.' : `Plan ${confirm}`)
      setConfirm(null)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const hasDraft = latest?.status === 'draft'
  const pv = form.product

  return (
    <form onSubmit={save} className="pb-10">
      <Link to={`${base}/plans`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-accent">
        <ArrowLeft className="size-4" /> All plans
      </Link>
      <PageHeader
        title={isNew ? 'New plan' : plan.name}
        subtitle={isNew ? 'Saved as a draft; customers see it only after you publish.' : `/${plan.slug} · editing version ${latest.version} (${STATUS_LABEL[latest.status]})`}
        actions={
          !isNew && (
            <>
              <StatusBadge status={plan.status} />
              {owner && hasDraft && (
                <button type="button" className="btn-primary btn-sm" disabled={publishing} onClick={() => setConfirm('publish')}>
                  <Rocket className="size-4" /> Publish v{latest.version}
                </button>
              )}
              {owner && plan.status === 'published' && (
                <button type="button" className="btn-outline btn-sm" onClick={() => setConfirm('unpublished')}>
                  <EyeOff className="size-4" /> Unpublish
                </button>
              )}
              {owner && plan.status === 'unpublished' && (
                <button type="button" className="btn-outline btn-sm" onClick={() => setConfirm('published')}>
                  <Eye className="size-4" /> Show again
                </button>
              )}
              {owner && plan.status !== 'archived' && (
                <button type="button" className="btn-ghost btn-sm text-error" onClick={() => setConfirm('archived')}>
                  <Archive className="size-4" /> Archive
                </button>
              )}
            </>
          )
        }
      />
      {!isNew && latest.status !== 'draft' && owner && plan.status !== 'archived' && (
        <p className="mb-5 rounded-xl bg-accent-soft p-3 text-sm">
          Version {latest.version} is {STATUS_LABEL[latest.status].toLowerCase()}. Saving changes creates draft version {latest.version + 1}; current subscribers keep the terms they bought.
        </p>
      )}
      {!owner && <p className="mb-5 rounded-xl bg-surface-2 p-3 text-sm">Only the super admin can change plans. You are viewing it read-only.</p>}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <fieldset disabled={readOnly} className="min-w-0 space-y-6">
          <Card title="Basics">
            {isNew && (
              <Field label="Plan type">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['membership', 'Membership', 'Paid access to benefits for a period'],
                    ['product', 'Product subscription', 'Recurring dairy deliveries'],
                  ].map(([k, label, text]) => (
                    <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className={`rounded-xl border-2 p-3 text-left text-sm ${kind === k ? 'border-gold bg-selected' : 'border-line'}`}>
                      <b className="block">{label}</b>
                      <span className="text-xs text-muted">{text}</span>
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name *">
                <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={80} />
              </Field>
              <Field label="Tagline">
                <input className="input" value={form.tagline} onChange={(e) => set('tagline', e.target.value)} maxLength={140} />
              </Field>
            </div>
            <Field label="Description">
              <textarea className="input min-h-20" value={form.description} onChange={(e) => set('description', e.target.value)} />
            </Field>
            <Field label="Terms shown at checkout" hint="Customers must accept these. Have them reviewed before launch.">
              <textarea className="input min-h-28" value={form.termsText} onChange={(e) => set('termsText', e.target.value)} />
            </Field>
            {num('sortOrder', 'Order on the plans page', { step: 1 })}
          </Card>

          <Card title="Price & duration" hint={kind === 'product' ? 'Optional plan fee per term. Product prices come from the catalogue (less the plan discount below).' : 'The membership fee per term.'}>
            <div className="grid gap-4 sm:grid-cols-4">
              {num('price', kind === 'product' ? 'Plan fee (₹)' : 'Fee (₹)')}
              <Field label="Billing period">
                <select
                  className="input"
                  value={form.interval}
                  onChange={(e) => {
                    set('interval', e.target.value)
                    if (DAYS[e.target.value]) set('durationDays', DAYS[e.target.value])
                  }}
                >
                  <option value="month">Monthly</option>
                  <option value="quarter">Quarterly</option>
                  <option value="year">Yearly</option>
                  <option value="custom">Custom</option>
                </select>
              </Field>
              {num('durationDays', 'Term (days)', { min: 1, step: 1 })}
              {num('taxPercent', 'GST on fee (%)')}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="On sale from (optional)">
                <input type="date" className="input" value={form.validFrom} onChange={(e) => set('validFrom', e.target.value)} />
              </Field>
              <Field label="On sale until (optional)">
                <input type="date" className="input" value={form.validTo} onChange={(e) => set('validTo', e.target.value)} />
              </Field>
            </div>
          </Card>

          {kind === 'membership' ? (
            <Card title="Member benefits" hint="Applied automatically to store orders while the membership is active. Leave 0 to switch a benefit off.">
              <div className="grid gap-4 sm:grid-cols-3">
                {num('benefits.discountPercent', 'Discount on orders (%)')}
                {num('benefits.maxDiscount', 'Max discount per order (₹, 0 = no cap)')}
                {num('benefits.minOrderForDiscount', 'Min order for discount (₹)')}
              </div>
              <div className="grid items-end gap-4 sm:grid-cols-3">
                <Toggle checked={form.benefits.freeDelivery} onChange={(v) => set('benefits.freeDelivery', v)} label="Free delivery" disabled={readOnly} />
                {num('benefits.freeDeliveryMinOrder', 'Free delivery above (₹)')}
                {num('benefits.ordersPerTermLimit', 'Orders per term with benefits (0 = unlimited)', { step: 1 })}
              </div>
              <Toggle checked={form.benefits.prioritySupport} onChange={(v) => set('benefits.prioritySupport', v)} label="Priority support (tickets jump the queue)" disabled={readOnly} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Exclusive offers" hint="One per line, shown to customers">
                  <textarea className="input min-h-20" value={form.benefits.exclusiveOffers} onChange={(e) => set('benefits.exclusiveOffers', e.target.value)} />
                </Field>
                <Field label="Other perks" hint="One per line">
                  <textarea className="input min-h-20" value={form.benefits.perks} onChange={(e) => set('benefits.perks', e.target.value)} />
                </Field>
              </div>
            </Card>
          ) : (
            <Card title="Products & delivery">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Billing">
                  <select className="input" value={pv.billingMode} onChange={(e) => set('product.billingMode', e.target.value)}>
                    <option value="prepaid">Prepaid window</option>
                    <option value="per_delivery">Pay per delivery</option>
                  </select>
                </Field>
                {pv.billingMode === 'prepaid' && num('product.prepayDays', 'Prepaid window (days)', { min: 1, step: 1 })}
                {num('product.discountPercent', 'Discount on product price (%)')}
                {num('product.deliveryFee', 'Fee per delivery (₹)')}
                {num('product.minQty', 'Min qty per item', { min: 1, step: 1 })}
                {num('product.maxQty', 'Max qty per item', { min: 1, step: 1 })}
                {num('product.maxItems', 'Max products in basket', { min: 1, step: 1 })}
              </div>
              <Field label="Allowed frequencies">
                <div className="flex flex-wrap gap-3">
                  {Object.entries(FREQUENCY_TEXT).map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="size-4 accent-primary" checked={pv.frequencies.includes(k)} onChange={(e) => set('product.frequencies', e.target.checked ? [...pv.frequencies, k] : pv.frequencies.filter((x) => x !== k))} />
                      {label}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Eligible products" hint="Leave all unticked to allow every product marked 'Available for subscription'.">
                <div className="grid max-h-64 gap-1 overflow-y-auto rounded-xl border border-line p-3 sm:grid-cols-2">
                  {(products?.items || []).map((p) => (
                    <label key={p._id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="size-4 accent-primary" checked={pv.eligible.includes(p._id)} onChange={(e) => set('product.eligible', e.target.checked ? [...pv.eligible, p._id] : pv.eligible.filter((x) => x !== p._id))} />
                      {p.name}
                    </label>
                  ))}
                  {!products?.items?.length && <p className="text-xs text-muted">No products are marked available for subscription.</p>}
                </div>
              </Field>
            </Card>
          )}

          <Card title="Policies" hint="Shown to customers before they buy and enforced by the server.">
            <div className="grid items-end gap-4 sm:grid-cols-4">
              <Toggle checked={form.policies.pause.allowed} onChange={(v) => set('policies.pause.allowed', v)} label="Pausing allowed" disabled={readOnly} />
              {num('policies.pause.minDays', 'Min pause (days)', { min: 1, step: 1 })}
              {num('policies.pause.maxDays', 'Max pause (days)', { min: 1, step: 1 })}
              {num('policies.pause.noticeDays', 'Notice (days)', { step: 1 })}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Cancellation takes effect">
                <select className="input" value={form.policies.cancellation.mode} onChange={(e) => set('policies.cancellation.mode', e.target.value)}>
                  <option value="end_of_term">At end of paid term</option>
                  <option value="immediate">Immediately</option>
                </select>
              </Field>
              {kind === 'membership' ? (
                <Field label="Refund of unused days">
                  <select className="input" value={form.policies.cancellation.refund} onChange={(e) => set('policies.cancellation.refund', e.target.value)}>
                    <option value="none">No refund</option>
                    <option value="prorata">Pro-rata to wallet</option>
                  </select>
                </Field>
              ) : (
                <div className="pb-2">
                  <Toggle checked={form.policies.cancellation.refundUnusedBalance} onChange={(v) => set('policies.cancellation.refundUnusedBalance', v)} label="Refund unused prepaid balance" disabled={readOnly} />
                </div>
              )}
              <div className="pb-2">
                <Toggle checked={form.policies.renewal.autoRenewAllowed} onChange={(v) => set('policies.renewal.autoRenewAllowed', v)} label="Allow wallet auto-renew" disabled={readOnly} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {num('policies.gracePeriodDays', 'Grace period (days)', { step: 1 })}
              {num('policies.retry.attempts', 'Renewal retries', { step: 1 })}
              {num('policies.retry.intervalHours', 'Hours between retries', { min: 1, step: 1 })}
            </div>
          </Card>

          <Card title="Availability">
            <Toggle checked={form.availability.allZones} onChange={(v) => set('availability.allZones', v)} label="Available in every delivery zone" disabled={readOnly} />
            {!form.availability.allZones && (
              <div className="flex flex-wrap gap-3">
                {zones.map((z) => (
                  <label key={z._id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-primary" checked={form.availability.zones.includes(z._id)} onChange={(e) => set('availability.zones', e.target.checked ? [...form.availability.zones, z._id] : form.availability.zones.filter((x) => x !== z._id))} />
                    {z.name} ({z.branch})
                  </label>
                ))}
              </div>
            )}
          </Card>

          {!readOnly && (
            <button className="btn-primary w-full" disabled={creating || updating}>
              <Save className="size-4" /> {isNew ? 'Create draft' : latest.status === 'draft' ? 'Save draft' : `Save as version ${latest.version + 1}`}
            </button>
          )}
        </fieldset>

        <aside className="space-y-6 xl:sticky xl:top-20 xl:self-start">
          <div>
            <p className="label">Customer preview</p>
            <PlanCard plan={preview} />
          </div>
          {!isNew && (
            <>
              <section className="card p-5 text-sm">
                <h2 className="mb-3 font-semibold">Versions</h2>
                <ul className="space-y-2">
                  {data.versions.map((v) => (
                    <li key={v._id} className="flex items-center justify-between gap-2">
                      <span>
                        v{v.version} · {v.name}
                        <span className="block text-xs text-muted">{v.publishedAt ? `published ${formatDateTime(v.publishedAt)}` : `edited ${formatDateTime(v.updatedAt)}`}</span>
                      </span>
                      <span className="text-right">
                        <StatusBadge status={v.status} />
                        <span className="block text-xs text-muted">{data.usage.filter((u) => String(u.version) === String(v._id)).reduce((s, u) => s + u.n, 0)} subscribers</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="card p-5 text-sm">
                <h2 className="mb-3 font-semibold">Recent subscribers</h2>
                {data.recent.length ? (
                  <ul className="space-y-2">
                    {data.recent.map((r) => (
                      <li key={r._id} className="flex items-center justify-between gap-2">
                        <Link to={`${base}/${plan.kind === 'membership' ? 'memberships' : 'plan-subscriptions'}/${r._id}`} className="link">
                          {r.user?.name} · {r.code}
                        </Link>
                        <StatusBadge status={r.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted">No subscribers yet.</p>
                )}
              </section>
            </>
          )}
        </aside>
      </div>

      <ConfirmModal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        busy={publishing || setting}
        danger={confirm === 'archived'}
        title={confirm === 'publish' ? `Publish version ${latest?.version}?` : confirm === 'archived' ? 'Archive this plan?' : confirm === 'unpublished' ? 'Hide this plan?' : 'Show this plan again?'}
        confirmLabel={confirm === 'publish' ? 'Publish' : confirm === 'archived' ? 'Archive' : 'Confirm'}
        text={
          confirm === 'publish'
            ? 'New customers will buy these terms. Existing subscribers keep the version they bought.'
            : confirm === 'archived'
              ? 'It disappears from sale permanently and can no longer be edited. Existing subscribers are not affected.'
              : confirm === 'unpublished'
                ? 'Customers can no longer buy it. Existing subscribers are not affected.'
                : 'Customers can buy the published version again.'
        }
      />
    </form>
  )
}
