import { AlertTriangle, ArrowLeft, CalendarDays, Clock, FileText, LifeBuoy, MapPin, PauseCircle, Plane, PlayCircle, Plus, Trash2, Wallet } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  errorMessage,
  useCancelSubscriptionMutation,
  useCreateTicketMutation,
  useMyOrdersQuery,
  usePlanQuery,
  useSettingsQuery,
  useSubscriptionBillingQuery,
  useSubscriptionChangeQuoteMutation,
  useSubscriptionOverrideMutation,
  useSubscriptionQuery,
  useSubscriptionVacationMutation,
  useTopupSubscriptionMutation,
  useUpdateSubscriptionMutation,
  useVerifyTransactionMutation,
} from '../../app/api'
import ProductImage from '../../components/ProductImage'
import { ErrorState, Field, Modal, PageLoader, QtyStepper, StatusBadge, Tabs, Toggle } from '../../components/ui'
import { selectUser } from '../../features/auth/authSlice'
import { formatMinor, FREQUENCY_TEXT, newIdempotencyKey, openRazorpay, policyLines, PROVIDER_LABEL, PURPOSE_LABEL, scheduleText } from '../../lib/billing'
import { addDays, dateKey, dayName, formatDate, formatDateTime, STATUS_LABEL, WEEKDAYS } from '../../lib/format'

const ALL_FREQUENCIES = ['daily', 'alternate', 'weekly', 'custom']
const pid = (p) => (typeof p === 'object' ? p?._id : p)
const fmtDay = (d, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => formatDate(d + 'T00:00:00', opts)

const EVENT_TEXT = {
  checkout_started: 'Checkout started',
  paid: 'Payment received',
  topped_up: 'Balance topped up',
  activated: 'Subscription started',
  paused: 'Paused',
  resumed: 'Resumed',
  pause: 'Dates paused',
  pause_removed: 'Paused dates resumed',
  changed: 'Subscription changed',
  cancelled: 'Cancelled',
  balance_exhausted: 'Balance ran out',
  delivery_failed: 'Delivery could not be scheduled',
  credited: 'Balance credited by Gavyora',
  override: 'Updated by Gavyora',
  checkout_abandoned: 'Checkout not completed',
  status: 'Status changed',
}

function DayModal({ sub, day, onClose }) {
  const [override, { isLoading }] = useSubscriptionOverrideMutation()
  const [qty, setQty] = useState({})
  useEffect(() => {
    if (!day) return
    setQty(Object.fromEntries(sub.items.map((it) => [String(it.variantId), day.items.find((x) => String(x.variantId) === String(it.variantId))?.qty ?? 0])))
  }, [day, sub.items])
  if (!day) return null
  const locked = day.date < sub.editableFrom
  const scheduled = day.qty > 0 || Object.values(qty).some((n) => n > 0)

  const save = async (skip) => {
    try {
      await override({ id: sub._id, date: day.date, items: sub.items.map((it) => ({ variantId: String(it.variantId), qty: skip ? 0 : qty[String(it.variantId)] || 0 })) }).unwrap()
      toast.success(skip ? 'Delivery skipped for this day' : 'Quantities updated for this day')
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={fmtDay(day.date, { weekday: 'long', day: 'numeric', month: 'long' })}
      size="max-w-md"
      footer={
        !locked &&
        !day.paused &&
        !day.holiday && (
          <>
            <button className="btn-ghost text-error" disabled={isLoading} onClick={() => save(true)}>
              Skip this day
            </button>
            <button className="btn-primary" disabled={isLoading} onClick={() => save(false)}>
              Save
            </button>
          </>
        )
      }
    >
      {locked ? (
        <p className="text-sm text-muted">This day is already locked for packing. The earliest day you can change is {fmtDay(sub.editableFrom)}.</p>
      ) : day.holiday ? (
        <p className="text-sm text-muted">No deliveries on this day (holiday).</p>
      ) : day.paused ? (
        <p className="text-sm text-muted">This day is paused. Resume it from Pause dates below.</p>
      ) : (
        <ul className="space-y-3">
          {sub.items.map((it) => (
            <li key={String(it.variantId)} className="flex items-center justify-between gap-3">
              <span className="text-sm">
                {it.productName} <span className="text-muted">({it.variantLabel})</span>
              </span>
              <QtyStepper small value={qty[String(it.variantId)] || 0} max={20} onChange={(n) => setQty((q) => ({ ...q, [String(it.variantId)]: Math.max(0, n) }))} />
            </li>
          ))}
          {!scheduled && <li className="text-xs text-muted">Not a regular delivery day; extra deliveries can't be added here.</li>}
        </ul>
      )}
    </Modal>
  )
}

function Calendar({ sub }) {
  const [day, setDay] = useState(null)
  const firstDow = new Date(sub.upcoming[0].date + 'T00:00:00').getDay()
  const units = sub.upcoming.reduce((s, d) => s + d.qty, 0)
  const deliveries = sub.upcoming.filter((d) => d.qty > 0).length
  return (
    <section className="card p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-semibold">Next 30 days</h2>
          <p className="text-xs text-muted">Tap a day to change quantities or skip it. Changes open from {fmtDay(sub.editableFrom)}.</p>
        </div>
        <p className="text-sm">
          <b>{deliveries}</b> deliveries · <b>{units}</b> items · about <b>{formatMinor(deliveries * sub.perDeliveryMinor)}</b>
        </p>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted sm:gap-1.5">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
        {Array.from({ length: firstDow }).map((_, i) => (
          <span key={`pad${i}`} />
        ))}
        {sub.upcoming.map((d) => {
          const locked = d.date < sub.editableFrom
          return (
            <button
              key={d.date}
              onClick={() => setDay(d)}
              className={`flex aspect-square flex-col items-center justify-center rounded-lg border text-xs transition hover:border-accent ${
                d.paused || d.holiday ? 'border-dashed border-line bg-surface-2 text-muted' : d.qty ? 'border-gold-line bg-primary-soft text-brand' : 'border-line text-muted'
              } ${locked ? 'opacity-60' : ''}`}
              aria-label={`${dayName(d.date, 'long')} ${d.date}: ${d.holiday ? 'holiday' : d.paused ? 'paused' : d.qty ? `${d.qty} items` : 'no delivery'}${locked ? ', locked' : ''}`}
            >
              <span className="font-semibold">{Number(d.date.slice(8))}</span>
              <span className="text-[10px]">{d.holiday ? '✕' : d.paused ? '⏸' : d.qty ? `×${d.qty}` : '–'}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded bg-primary-soft ring-1 ring-gold/30" /> Delivery
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded border border-dashed border-line bg-surface-2" /> Paused / holiday
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded border border-line opacity-60" /> Locked
        </span>
      </div>
      <DayModal sub={sub} day={day} onClose={() => setDay(null)} />
    </section>
  )
}

function PauseDates({ sub }) {
  const policy = sub.pausePolicy
  const earliest = dateKey(addDays(new Date(sub.editableFrom + 'T00:00:00'), policy.noticeDays || 0))
  const [range, setRange] = useState({ from: earliest, to: dateKey(addDays(new Date(earliest + 'T00:00:00'), Math.max(0, (policy.minDays || 1) - 1))) })
  const [vacation, { isLoading }] = useSubscriptionVacationMutation()
  const run = async (resume, r = range) => {
    try {
      await vacation({ id: sub._id, ...r, resume }).unwrap()
      toast.success(resume ? 'Deliveries resumed for those dates' : 'Dates paused. Enjoy your break! ✈️')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Plane className="size-5 text-brand" /> Pause dates (vacation)
      </h2>
      <p className="mt-1 text-sm text-muted">
        {policy.allowed
          ? `Pause ${policy.minDays}–${policy.maxDays} days at a time${policy.noticeDays ? `, ${policy.noticeDays} days' notice` : ''}. Nothing is charged for paused days${sub.billingMode === 'prepaid' ? '; the balance stays for later deliveries' : ''}.`
          : 'This plan does not allow pausing deliveries.'}
      </p>
      {policy.allowed && (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="From">
              <input type="date" className="input" min={earliest} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
            </Field>
            <Field label="To">
              <input type="date" className="input" min={range.from} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn-primary" disabled={isLoading || !range.from || !range.to} onClick={() => run(false)}>
              Pause these dates
            </button>
            <button className="btn-outline" disabled={isLoading || !range.from || !range.to} onClick={() => run(true)}>
              Resume these dates
            </button>
          </div>
        </>
      )}
      {sub.pausedDates.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold text-muted uppercase">Paused dates</p>
          <div className="flex flex-wrap gap-2">
            {sub.pausedDates.map((d) => (
              <button key={d} className="chip bg-surface-2 py-1 hover:bg-primary-soft disabled:opacity-50" disabled={d < sub.editableFrom || isLoading} onClick={() => run(true, { from: d, to: d })} title="Resume this day">
                {fmtDay(d, { day: 'numeric', month: 'short' })} ✕
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function ChangeForm({ sub }) {
  const user = useSelector(selectUser)
  const { data: settings } = useSettingsQuery()
  const { data: plan } = usePlanQuery(sub.plan?.slug, { skip: !sub.plan?.slug || !sub.terms })
  const [quote, { data: preview, error: previewError, reset }] = useSubscriptionChangeQuoteMutation()
  const [update, { isLoading }] = useUpdateSubscriptionMutation()
  const t = sub.terms?.product || {}
  const minQ = sub.terms ? t.minQty || 1 : 1
  const maxQ = sub.terms ? t.maxQty || 10 : 20
  const frequencies = sub.terms ? t.frequencies || ALL_FREQUENCIES : ALL_FREQUENCIES
  const addresses = user?.addresses || []
  const currentAddress = addresses.find((a) => a.line1 === sub.address?.line1 && a.pincode === sub.address?.pincode)
  const initial = useMemo(
    () => ({
      items: sub.items.map((i) => ({ product: pid(i.product), variantId: String(i.variantId), qty: i.qty, label: `${i.productName} (${i.variantLabel})` })),
      frequency: sub.frequency,
      days: sub.days?.length ? sub.days : [1, 3, 5],
      slot: sub.slot,
      addressId: currentAddress?._id || '',
    }),
    [sub, currentAddress],
  )
  const [form, setForm] = useState(initial)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const body = useMemo(() => {
    const b = {}
    const itemsKey = (list) => list.map((i) => `${i.variantId}:${i.qty}`).join(',')
    if (itemsKey(form.items) !== itemsKey(initial.items)) b.items = form.items.map(({ product, variantId, qty }) => ({ product, variantId, qty }))
    if (form.frequency !== initial.frequency || (form.frequency === 'custom' && form.days.join() !== initial.days.join())) {
      b.frequency = form.frequency
      if (form.frequency === 'custom') b.days = form.days
    }
    if (form.slot !== initial.slot) b.slot = form.slot
    if (form.addressId && form.addressId !== initial.addressId) b.addressId = form.addressId
    return b
  }, [form, initial])
  const dirty = Object.keys(body).length > 0

  useEffect(() => {
    if (!dirty) return reset()
    const tm = setTimeout(() => quote({ id: sub._id, ...body }).catch(() => {}), 300)
    return () => clearTimeout(tm)
  }, [body, dirty, quote, reset, sub._id])

  const catalog = plan?.catalog || []
  const canAdd = sub.terms && catalog.length > 0 && form.items.length < (t.maxItems || 5)

  const save = async (e) => {
    e.preventDefault()
    if (form.frequency === 'custom' && !form.days.length) return toast.error('Pick at least one day')
    try {
      await update({ id: sub._id, ...body }).unwrap()
      toast.success(`Saved. Changes apply from ${fmtDay(preview?.effectiveFrom || sub.editableFrom)}.`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <form onSubmit={save} className="card space-y-4 p-5">
      <h2 className="font-semibold">Change subscription</h2>
      <div>
        <span className="label">Products per delivery</span>
        <ul className="space-y-2">
          {form.items.map((i) => (
            <li key={i.variantId} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 flex-1">{i.label}</span>
              <QtyStepper small value={i.qty} max={maxQ} onChange={(n) => set({ items: form.items.map((x) => (x.variantId === i.variantId ? { ...x, qty: Math.max(minQ, n) } : x)) })} />
              {sub.terms && form.items.length > 1 && (
                <button type="button" className="btn-ghost btn-sm px-2 text-error" onClick={() => set({ items: form.items.filter((x) => x.variantId !== i.variantId) })} aria-label={`Remove ${i.label}`}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {canAdd && (
          <select
            className="input mt-2"
            value=""
            onChange={(e) => {
              const [productId, variantId] = e.target.value.split(':')
              const p = catalog.find((x) => x._id === productId)
              const v = p?.variants.find((x) => x._id === variantId)
              if (v) set({ items: [...form.items, { product: productId, variantId, qty: minQ, label: `${p.name} (${v.label})` }] })
            }}
            aria-label="Add a product"
          >
            <option value="">+ Add a product…</option>
            {catalog.flatMap((p) =>
              p.variants
                .filter((v) => v.inStock && !form.items.some((x) => x.variantId === v._id))
                .map((v) => (
                  <option key={v._id} value={`${p._id}:${v._id}`}>
                    {p.name} ({v.label}) · {formatMinor(Math.round(v.planPrice * 100))}
                  </option>
                )),
            )}
          </select>
        )}
        {!sub.terms && <p className="mt-1 text-xs text-muted">This older subscription can change quantities only. Choose a new plan to change products.</p>}
      </div>
      <Field label="Frequency">
        <select className="input" value={form.frequency} onChange={(e) => set({ frequency: e.target.value })}>
          {frequencies.map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_TEXT[f]}
            </option>
          ))}
        </select>
      </Field>
      {form.frequency === 'custom' && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Delivery days">
          {WEEKDAYS.map((d, i) => {
            const on = form.days.includes(i)
            return (
              <button type="button" key={d} aria-pressed={on} onClick={() => set({ days: on ? form.days.filter((x) => x !== i) : [...form.days, i].sort() })} className={`size-11 rounded-full text-sm font-medium ${on ? 'bg-primary text-on-primary' : 'bg-surface-2'}`}>
                {d}
              </button>
            )
          })}
        </div>
      )}
      <Field label="Delivery time">
        <select className="input" value={form.slot} onChange={(e) => set({ slot: e.target.value })}>
          {[...new Set([sub.slot, ...(settings?.slots || [])])].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </Field>
      {addresses.length > 0 && (
        <Field label="Delivery address">
          <select className="input" value={form.addressId} onChange={(e) => set({ addressId: e.target.value })}>
            {!currentAddress && <option value="">{`${sub.address?.line1}, ${sub.address?.pincode} (current)`}</option>}
            {addresses.map((a) => (
              <option key={a._id} value={a._id}>
                {a.label}: {a.line1}, {a.pincode}
              </option>
            ))}
          </select>
        </Field>
      )}
      {dirty && (
        <div className="rounded-xl bg-surface-2 p-3 text-sm">
          {previewError ? (
            <p className="flex gap-2 text-error">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {errorMessage(previewError)}
            </p>
          ) : preview ? (
            <>
              <p>
                Applies from <b>{fmtDay(preview.effectiveFrom)}</b>.
              </p>
              <p>
                Per delivery: {formatMinor(preview.perDeliveryBeforeMinor)} → <b>{formatMinor(preview.perDeliveryAfterMinor)}</b>
                {preview.differenceMinor !== 0 && <span className={preview.differenceMinor > 0 ? 'text-warning' : 'text-success'}> ({preview.differenceMinor > 0 ? '+' : '−'}{formatMinor(Math.abs(preview.differenceMinor))})</span>}
              </p>
              {sub.billingMode === 'prepaid' && <p className="text-xs text-muted">Deliveries are drawn from your prepaid balance at the new price; nothing is charged now.</p>}
            </>
          ) : (
            <p className="text-muted">Calculating…</p>
          )}
        </div>
      )}
      <div className="flex gap-2">
        {dirty && (
          <button type="button" className="btn-ghost" onClick={() => setForm(initial)}>
            Reset
          </button>
        )}
        <button className="btn-primary flex-1" disabled={!dirty || isLoading || !!previewError}>
          Confirm changes
        </button>
      </div>
    </form>
  )
}

function TopupModal({ sub, quote, onlinePayments, onClose }) {
  const [method, setMethod] = useState('wallet')
  const [topup, { isLoading }] = useTopupSubscriptionMutation()
  const [verify] = useVerifyTransactionMutation()
  const key = useRef(newIdempotencyKey())
  const navigate = useNavigate()
  const go = async () => {
    try {
      const res = await topup({ id: sub._id, paymentMethod: method, idempotencyKey: key.current }).unwrap()
      if (res.razorpay) {
        const rp = await openRazorpay({ razorpay: res.razorpay, description: 'Subscription top-up' })
        if (rp) await verify({ id: res.transaction._id, ...rp }).unwrap().catch(() => {})
      }
      navigate(`/plans/payment/${res.transaction._id}`)
    } catch (e) {
      key.current = newIdempotencyKey()
      toast.error(errorMessage(e))
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Top up prepaid balance"
      size="max-w-md"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={isLoading || !quote} onClick={go}>
            Pay {quote ? formatMinor(quote.totalMinor) : ''}
          </button>
        </>
      }
    >
      {quote ? <p className="text-sm">{quote.lines[0]?.description}. Added to your balance once the payment is confirmed.</p> : <p className="text-sm text-muted">Loading…</p>}
      <div className="mt-4 space-y-2">
        {[
          ['wallet', 'Gavyora wallet'],
          ...(onlinePayments ? [['razorpay', 'UPI / card (Razorpay)']] : []),
        ].map(([id, label]) => (
          <label key={id} className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 text-sm ${method === id ? 'border-gold bg-selected' : 'border-line'}`}>
            <input type="radio" name="topup-pay" className="accent-primary" checked={method === id} onChange={() => setMethod(id)} /> {label}
          </label>
        ))}
      </div>
    </Modal>
  )
}

function Billing({ sub, data }) {
  if (!data) return <PageLoader />
  return (
    <div className="space-y-5">
      <section className="card overflow-x-auto">
        <h2 className="border-b border-line px-5 py-3 font-semibold">Payments</h2>
        {data.transactions.length ? (
          <ul className="divide-y divide-line">
            {data.transactions.map((t) => (
              <li key={t._id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span>
                  {PURPOSE_LABEL[t.purpose]} · {PROVIDER_LABEL[t.provider]}
                  <span className="block text-xs text-muted">{formatDateTime(t.paidAt || t.createdAt)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <b>{formatMinor(t.amountMinor)}</b> <StatusBadge status={t.status} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-5 text-sm text-muted">{sub.terms ? 'No payments yet.' : 'This subscription is paid per delivery; see your wallet and orders.'}</p>
        )}
        <Link to="/account/billing" className="link block border-t border-line px-5 py-3 text-sm">
          <FileText className="mr-1 inline size-4" /> All invoices
        </Link>
      </section>
      {data.refunds.length > 0 && (
        <section className="card">
          <h2 className="border-b border-line px-5 py-3 font-semibold">Refunds</h2>
          <ul className="divide-y divide-line">
            {data.refunds.map((r) => (
              <li key={r._id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span>{r.reason}</span>
                <span className="flex items-center gap-2">
                  <b>{formatMinor(r.amountMinor)}</b> <StatusBadge status={r.status} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card p-5">
        <h2 className="mb-3 font-semibold">History</h2>
        {data.events.length ? (
          <ol className="space-y-3 border-l-2 border-line pl-4 text-sm">
            {data.events.map((e) => (
              <li key={e._id} className="relative">
                <span className="absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full bg-primary" />
                <p className="font-medium">{EVENT_TEXT[e.type] || e.type}</p>
                {e.note && <p className="text-muted">{e.note}</p>}
                {e.data?.from && e.data?.to && <p className="text-muted">{`${fmtDay(e.data.from)} – ${fmtDay(e.data.to)}`}</p>}
                <p className="text-xs text-muted">{formatDateTime(e.createdAt)}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted">No changes recorded yet.</p>
        )}
      </section>
    </div>
  )
}

function Deliveries({ sub }) {
  const { data: orders = [], isLoading } = useMyOrdersQuery()
  const [createTicket, { isLoading: sending }] = useCreateTicketMutation()
  const [report, setReport] = useState(null)
  const [message, setMessage] = useState('')
  const navigate = useNavigate()
  const mine = orders.filter((o) => String(o.subscription) === String(sub._id)).slice(0, 30)

  const send = async () => {
    try {
      const missed = report.status === 'undelivered' || report.status === 'delivered'
      const t = await createTicket({
        subject: `${missed ? 'Missed or incomplete delivery' : 'Subscription delivery'}: ${report.orderNo}`,
        message: message.trim(),
        order: report._id,
        subscription: sub._id,
        category: missed ? 'missed_delivery' : 'subscription',
      }).unwrap()
      toast.success('Reported. Our team will arrange a redelivery, refund or credit.')
      setReport(null)
      navigate(`/support/tickets/${t._id}`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <section className="card overflow-x-auto">
      <h2 className="border-b border-line px-5 py-3 font-semibold">Recent deliveries</h2>
      {isLoading ? (
        <PageLoader />
      ) : !mine.length ? (
        <p className="p-5 text-sm text-muted">Deliveries appear here once they are scheduled (the night before, after the cut-off).</p>
      ) : (
        <ul className="divide-y divide-line">
          {mine.map((o) => (
            <li key={o._id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
              <span className="min-w-0 flex-1">
                <Link to={`/account/orders/${o._id}`} className="font-medium hover:text-accent">
                  {fmtDay(o.slot.date)} · {o.orderNo}
                </Link>
                <span className="block text-xs text-muted">{o.items.map((i) => `${i.name} ×${i.qty}`).join(', ')}</span>
              </span>
              <StatusBadge status={o.status} />
              {['delivered', 'undelivered', 'out_for_delivery'].includes(o.status) && (
                <button className="btn-ghost btn-sm" onClick={() => setReport(o)}>
                  <LifeBuoy className="size-4" /> Report a problem
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={!!report}
        onClose={() => setReport(null)}
        title={`Report a problem · ${report?.orderNo || ''}`}
        size="max-w-md"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setReport(null)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={sending || message.trim().length < 3} onClick={send}>
              Send report
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-muted">
          Delivery for {report && fmtDay(report.slot.date)} · status {report && (STATUS_LABEL[report.status] || report.status)}. Tell us what happened (not delivered, items missing, damaged…).
        </p>
        <Field label="What went wrong?">
          <textarea className="input min-h-24" value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
      </Modal>
    </section>
  )
}

export default function ManageSubscription() {
  const { id } = useParams()
  const { data: sub, isLoading, error, refetch } = useSubscriptionQuery(id)
  const { data: billing } = useSubscriptionBillingQuery(id)
  const [update, { isLoading: updating }] = useUpdateSubscriptionMutation()
  const [cancel, { isLoading: cancelling }] = useCancelSubscriptionMutation()
  const [tab, setTab] = useState('schedule')
  const [modal, setModal] = useState(null)
  const [reason, setReason] = useState('')
  const navigate = useNavigate()

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const live = !['cancelled', 'failed'].includes(sub.status)
  const editable = ['active', 'paused', 'past_due'].includes(sub.status)
  const prepaid = sub.billingMode === 'prepaid'
  const next = sub.upcoming.find((d) => d.qty > 0)
  const autoAllowed = prepaid && sub.terms?.policies?.renewal?.autoRenewAllowed !== false

  const setStatus = async (status) => {
    try {
      await update({ id: sub._id, status }).unwrap()
      toast.success(status === 'paused' ? 'Deliveries paused until you resume' : 'Subscription resumed')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const doCancel = async () => {
    try {
      const r = await cancel({ id: sub._id, reason: reason.trim() }).unwrap()
      toast.success(r.refund ? `Subscription cancelled. ${formatMinor(r.refund.amountMinor)} refunded to your wallet.` : 'Subscription cancelled')
      setModal(null)
      navigate('/subscriptions')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="container-page max-w-5xl py-6">
      <Link to="/subscriptions" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-accent">
        <ArrowLeft className="size-4" /> All subscriptions
      </Link>

      <div className="card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex -space-x-3">
            {sub.items.slice(0, 3).map((it) => (
              <div key={String(it.variantId)} className="w-16 shrink-0 rounded-xl ring-2 ring-surface">
                <ProductImage product={typeof it.product === 'object' ? it.product : undefined} name={it.productName} size="text-3xl" />
              </div>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold">{sub.plan?.name || 'Subscription'}</h1>
              <StatusBadge status={sub.status} />
            </div>
            <p className="text-xs text-muted">
              {sub.code}
              {sub.terms && ` · plan version ${sub.terms.version}`} · started {fmtDay(sub.startDate, { day: 'numeric', month: 'short', year: 'numeric' })}
              {sub.endDate && ` · ended ${fmtDay(sub.endDate, { day: 'numeric', month: 'short', year: 'numeric' })}`}
            </p>
            <ul className="mt-2 text-sm">
              {sub.items.map((it) => (
                <li key={String(it.variantId)}>
                  {it.productName} ({it.variantLabel}) × {it.qty} <span className="text-muted">· {formatMinor(Math.round(it.price * 100))} each</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3.5" /> {scheduleText(sub)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="size-3.5" /> {sub.slot}
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" /> {sub.address?.line1}, {sub.address?.pincode}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sub.status === 'active' && sub.pausePolicy.allowed && (
              <button className="btn-outline" disabled={updating} onClick={() => setStatus('paused')}>
                <PauseCircle className="size-4" /> Pause
              </button>
            )}
            {sub.status === 'paused' && (
              <button className="btn-primary" disabled={updating} onClick={() => setStatus('active')}>
                <PlayCircle className="size-4" /> Resume
              </button>
            )}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Each delivery</dt>
            <dd className="font-semibold">{formatMinor(sub.perDeliveryMinor)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Next delivery</dt>
            <dd className="font-semibold">{next ? fmtDay(next.date) : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">{prepaid ? 'Prepaid balance' : 'Billing'}</dt>
            <dd className="font-semibold">{prepaid ? `${formatMinor(sub.prepaidBalanceMinor)} · ${sub.deliveriesLeft ?? 0} deliveries` : 'Wallet, else cash on delivery'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Changes open from</dt>
            <dd className="font-semibold">{fmtDay(sub.editableFrom)}</dd>
          </div>
        </dl>

        {sub.status === 'past_due' && (
          <p className="mt-4 rounded-xl bg-error/10 p-3 text-sm text-error">Deliveries are on hold because the prepaid balance ran out. Top up to restart them.</p>
        )}
        {sub.status === 'pending_payment' && <p className="mt-4 rounded-xl bg-secondary-soft p-3 text-sm">Waiting for your payment to be confirmed. Deliveries are scheduled once it is.</p>}
        {sub.status === 'suspended' && <p className="mt-4 rounded-xl bg-error/10 p-3 text-sm text-error">This subscription is suspended by our team. Please contact support.</p>}

        {prepaid && live && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-surface-2 p-3">
            <Wallet className="size-5 text-brand" />
            <span className="min-w-0 flex-1 text-sm">{billing?.topup ? `Top up for the next ${billing.topup.deliveries} deliveries: ${formatMinor(billing.topup.totalMinor)}` : 'Add to your prepaid balance'}</span>
            {autoAllowed && (
              <Toggle
                checked={!!sub.autoRenew}
                label="Auto top-up from wallet"
                onChange={(v) => update({ id: sub._id, autoRenew: v }).unwrap().then(() => toast.success(v ? 'Auto top-up on' : 'Auto top-up off')).catch((e) => toast.error(errorMessage(e)))}
              />
            )}
            {['active', 'paused', 'past_due'].includes(sub.status) && (
              <button className="btn-primary btn-sm" onClick={() => setModal('topup')}>
                <Plus className="size-4" /> Top up
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 mb-5">
        <Tabs
          tabs={[
            { value: 'schedule', label: 'Schedule' },
            { value: 'deliveries', label: 'Deliveries & help' },
            { value: 'billing', label: 'Billing & history' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'schedule' &&
        (editable ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            <div className="space-y-6">
              <Calendar sub={sub} />
              <PauseDates sub={sub} />
            </div>
            <div className="space-y-6">
              <ChangeForm key={sub.updatedAt} sub={sub} />
              {sub.terms && (
                <section className="card p-5 text-xs text-muted">
                  <h2 className="mb-2 text-sm font-semibold text-ink">Your plan terms</h2>
                  <ul className="space-y-1">
                    {policyLines(sub.terms, 'product').map((p) => (
                      <li key={p}>• {p}</li>
                    ))}
                  </ul>
                </section>
              )}
              <button className="btn-ghost w-full text-error" onClick={() => setModal('cancel')}>
                <Trash2 className="size-4" /> Cancel subscription
              </button>
            </div>
          </div>
        ) : (
          <div className="card p-5 text-sm text-muted">
            {sub.status === 'cancelled' ? (
              <p>
                This subscription was cancelled{sub.cancelReason ? `: ${sub.cancelReason}` : ''}. Its history stays here.{' '}
                <Link to="/plans?kind=product" className="link">
                  Start a new one
                </Link>
              </p>
            ) : sub.status === 'pending_payment' ? (
              <p>
                The schedule can be changed once the payment is confirmed.{' '}
                <button className="link" onClick={() => setModal('cancel')}>
                  Cancel this checkout
                </button>
              </p>
            ) : (
              <p>The schedule can't be changed in the current status ({STATUS_LABEL[sub.status] || sub.status}).</p>
            )}
          </div>
        ))}
      {tab === 'deliveries' && <Deliveries sub={sub} />}
      {tab === 'billing' && <Billing sub={sub} data={billing} />}

      {modal === 'topup' && <TopupModal sub={sub} quote={billing?.topup} onlinePayments={!!billing?.onlinePayments} onClose={() => setModal(null)} />}
      <Modal
        open={modal === 'cancel'}
        onClose={() => setModal(null)}
        title="Cancel subscription?"
        size="max-w-md"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setModal(null)}>
              Keep it
            </button>
            <button className="btn-danger" disabled={cancelling || reason.trim().length < 3} onClick={doCancel}>
              Yes, cancel
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">
          No new deliveries will be scheduled. Deliveries already locked for packing still arrive.
          {prepaid && sub.prepaidBalanceMinor > 0 && (sub.terms?.policies?.cancellation?.refundUnusedBalance !== false ? ` Your unused balance of ${formatMinor(sub.prepaidBalanceMinor)} goes back to your wallet.` : ' This plan does not refund unused balance.')}{' '}
          Need a break instead? <b>Pause</b> or pause dates.
        </p>
        <Field label="Why are you cancelling?" className="mt-4">
          <textarea className="input min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </div>
  )
}
