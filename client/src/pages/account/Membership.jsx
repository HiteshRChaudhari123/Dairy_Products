import { BadgeCheck, CalendarClock, Crown, History as HistoryIcon, RefreshCw, Repeat, XCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useNavigate } from 'react-router-dom'
import {
  errorMessage,
  useCancelMembershipMutation,
  useChangeMembershipPlanMutation,
  useMembershipEventsQuery,
  useMyMembershipQuery,
  usePlansQuery,
  useRenewalQuoteQuery,
  useRenewMembershipMutation,
  useSetMembershipAutoRenewMutation,
  useUndoMembershipCancelMutation,
  useVerifyTransactionMutation,
} from '../../app/api'
import { EmptyState, ErrorState, Field, Modal, PageLoader, Skeleton, StatusBadge, Toggle } from '../../components/ui'
import { benefitLines, formatMinor, newIdempotencyKey, openRazorpay, planPriceText, policyLines } from '../../lib/billing'
import { formatDate, formatDateTime } from '../../lib/format'

const EVENT_TEXT = {
  checkout_started: 'Checkout started',
  activated: 'Membership activated',
  renewed: 'Renewed',
  renewal_failed: 'Renewal failed',
  term_ended: 'Term ended',
  expired: 'Expired',
  ended: 'Ended after cancellation',
  cancel_requested: 'Cancellation requested',
  cancel_undone: 'Cancellation undone',
  cancelled: 'Cancelled',
  auto_renew_on: 'Auto-renew switched on',
  auto_renew_off: 'Auto-renew switched off',
  plan_change_scheduled: 'Plan change scheduled',
  extended: 'Term extended',
  override: 'Updated by Gavyora',
  checkout_abandoned: 'Checkout not completed',
  status: 'Status changed',
}

function RenewModal({ membership, onClose }) {
  const [method, setMethod] = useState('wallet')
  const [renew, { isLoading }] = useRenewMembershipMutation()
  const [verify] = useVerifyTransactionMutation()
  const key = useRef(newIdempotencyKey())
  const navigate = useNavigate()
  const t = membership.terms
  // Priced by the server: the agreed terms, or the plan the customer switched to (it applies from this renewal).
  const { data, isLoading: quoting, error: quoteError } = useRenewalQuoteQuery(membership._id)
  const q = data?.quote
  const methods = [['wallet', `Gavyora wallet${data ? ` (balance ${formatMinor(Math.round(data.walletBalance * 100))})` : ''}`], ...(data?.onlinePayments ? [['razorpay', 'UPI / card (Razorpay)']] : [])]

  const go = async () => {
    try {
      const res = await renew({ id: membership._id, paymentMethod: method, idempotencyKey: key.current }).unwrap()
      if (res.razorpay) {
        const rp = await openRazorpay({ razorpay: res.razorpay, description: `${t.name} renewal` })
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
      title={`Renew ${t.name}`}
      size="max-w-md"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={go} disabled={isLoading || !q}>
            {q ? `Pay ${formatMinor(q.totalMinor)}` : 'Pay'}
          </button>
        </>
      }
    >
      {quoteError ? (
        <p className="text-sm text-error" role="alert">
          {errorMessage(quoteError)}
        </p>
      ) : quoting || !q ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <p className="text-sm text-muted">
          Adds {q.durationDays} days after your current term ends ({formatDate(membership.currentPeriodEnd)}).{' '}
          {q.planName !== t.name ? `Renews as ${q.planName} (the plan you switched to): ` : 'Price at your agreed terms: '}
          {formatMinor(q.subtotalMinor)}
          {q.taxMinor ? ` + ${formatMinor(q.taxMinor)} GST (${q.taxPercent}%)` : ''}.
        </p>
      )}
      <div className="mt-4 space-y-2">
        {methods.map(([id, label]) => (
          <label key={id} className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 text-sm ${method === id ? 'border-gold bg-selected' : 'border-line'}`}>
            <input type="radio" name="renew-pay" className="accent-primary" checked={method === id} onChange={() => setMethod(id)} /> {label}
          </label>
        ))}
      </div>
    </Modal>
  )
}

function CancelModal({ membership, onClose }) {
  const [reason, setReason] = useState('')
  const [cancel, { isLoading }] = useCancelMembershipMutation()
  const policy = membership.terms.policies?.cancellation || {}
  const immediate = policy.mode === 'immediate' || membership.status !== 'active'
  const go = async () => {
    try {
      const r = await cancel({ id: membership._id, reason: reason.trim() }).unwrap()
      toast.success(r.refund ? `Membership cancelled. ${formatMinor(r.refund.amountMinor)} refunded to your wallet.` : immediate ? 'Membership cancelled' : `Membership will end on ${formatDate(r.effective)}`)
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Cancel membership?"
      size="max-w-md"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Keep it
          </button>
          <button className="btn-danger" onClick={go} disabled={isLoading || reason.trim().length < 3}>
            Cancel membership
          </button>
        </>
      }
    >
      <p className="mb-4 rounded-xl bg-secondary-soft p-3 text-sm">
        {immediate
          ? `Your benefits stop now.${policy.refund === 'prorata' ? ' Unused days are refunded to your wallet.' : ''}`
          : `Your benefits continue until ${formatDate(membership.currentPeriodEnd)} and it will not renew. You can undo this before then.`}
      </p>
      <Field label="Why are you cancelling?" hint="Required, helps us improve">
        <textarea className="input min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  )
}

function ChangePlanModal({ membership, onClose }) {
  const { data: plans = [], isLoading } = usePlansQuery('membership')
  const [change, { isLoading: saving }] = useChangeMembershipPlanMutation()
  const go = async (slug) => {
    try {
      await change({ id: membership._id, slug }).unwrap()
      toast.success(`Your plan changes at your next renewal (${formatDate(membership.currentPeriodEnd)})`)
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  return (
    <Modal open onClose={onClose} title="Change plan at next renewal">
      <p className="mb-4 text-sm text-muted">Your current benefits stay until {formatDate(membership.currentPeriodEnd)}. The new plan's price and benefits apply from your next renewal.</p>
      {isLoading ? (
        <Skeleton className="h-32" />
      ) : (
        <ul className="space-y-2">
          {plans.map((p) => {
            const current = p.version._id === membership.planVersion
            return (
              <li key={p._id} className="flex items-center gap-3 rounded-xl border border-line p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.version.name}</p>
                  <p className="text-xs text-muted">{planPriceText(p.version)}</p>
                </div>
                <button className="btn-outline btn-sm" disabled={saving} onClick={() => go(p.slug)}>
                  {current ? 'Keep this plan' : 'Switch'}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}

export default function Membership() {
  const { data, isLoading, error, refetch } = useMyMembershipQuery()
  const m = data?.current
  const { data: events = [] } = useMembershipEventsQuery(m?._id, { skip: !m })
  const [setAuto, { isLoading: toggling }] = useSetMembershipAutoRenewMutation()
  const [undo, { isLoading: undoing }] = useUndoMembershipCancelMutation()
  const [modal, setModal] = useState(null)

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  if (!m)
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-bold">My membership</h1>
        <div className="card">
          <EmptyState icon="👑" title="You're not a member yet" text="Members get the benefits their plan lists on every store order, such as member prices and free delivery." action={<Link to="/plans?kind=membership" className="btn-primary">See membership plans</Link>} />
        </div>
        <History history={data?.history || []} />
      </div>
    )

  const t = m.terms
  const pending = m.status === 'pending_payment'
  const canRenew = ['active', 'cancellation_pending', 'past_due'].includes(m.status)
  const canCancel = ['active', 'cancellation_pending', 'past_due', 'suspended'].includes(m.status) && m.status !== 'cancellation_pending'
  const autoAllowed = t.policies?.renewal?.autoRenewAllowed !== false && ['active', 'past_due'].includes(m.status)
  const daysLeft = m.currentPeriodEnd ? Math.max(0, Math.ceil((new Date(m.currentPeriodEnd) - Date.now()) / 86400000)) : null

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">My membership</h1>

      <section className="relative overflow-hidden rounded-[var(--radius-card)] bg-night p-6 text-on-night">
        <Crown className="absolute -right-4 -bottom-4 size-32 opacity-10" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.2em] text-platinum uppercase">Membership · {m.code}</p>
            <p className="mt-1 font-heading text-3xl font-semibold">{t.name}</p>
            <p className="mt-1 text-sm text-on-night-muted">
              Plan version {t.version} · {planPriceText(t)}
            </p>
          </div>
          <StatusBadge status={m.status} />
        </div>
        {!pending && (
          <dl className="relative mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-on-night-muted">Started</dt>
              <dd className="font-medium">{formatDate(m.startedAt)}</dd>
            </div>
            <div>
              <dt className="text-on-night-muted">{m.status === 'cancellation_pending' ? 'Ends on' : 'Current term ends'}</dt>
              <dd className="font-medium">{formatDate(m.currentPeriodEnd)}</dd>
            </div>
            <div>
              <dt className="text-on-night-muted">Days left</dt>
              <dd className="font-medium">{daysLeft ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-on-night-muted">Next billing</dt>
              <dd className="font-medium">{m.status === 'cancellation_pending' ? 'None' : m.autoRenew ? `${formatDate(m.currentPeriodEnd)} (wallet)` : 'Manual renewal'}</dd>
            </div>
          </dl>
        )}
      </section>

      {pending && (
        <p className="rounded-xl bg-secondary-soft p-4 text-sm">
          We're waiting for your payment to be confirmed. If you closed the payment window, start again from <Link to="/plans?kind=membership" className="link">membership plans</Link>; the unpaid checkout is closed automatically.
        </p>
      )}
      {m.status === 'past_due' && (
        <p className="rounded-xl bg-error/10 p-4 text-sm text-error">Your term has ended and the renewal didn't go through. Benefits continue until {formatDate(m.graceUntil)}. Renew now to keep them.</p>
      )}
      {m.status === 'suspended' && <p className="rounded-xl bg-error/10 p-4 text-sm text-error">This membership is suspended by our team. Please contact support.</p>}
      {data.usage?.limitReached && <p className="rounded-xl bg-secondary-soft p-4 text-sm">You've used all the member-priced orders included in this term. Benefits come back when your next term starts.</p>}
      {data.nextPlan && (
        <p className="rounded-xl bg-accent-soft p-4 text-sm">
          From your next renewal you'll move to <b>{data.nextPlan.name}</b> ({planPriceText(data.nextPlan.version)}).
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Your benefits</h2>
          <ul className="space-y-2 text-sm">
            {benefitLines(t).map((b) => (
              <li key={b} className="flex gap-2">
                <BadgeCheck className="mt-0.5 size-4 shrink-0 text-brand" /> {b}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Applied automatically at checkout while your membership is active.</p>
          <h3 className="mt-5 mb-2 text-sm font-semibold">Your terms</h3>
          <ul className="space-y-1 text-xs text-muted">
            {policyLines(t, 'membership').map((p) => (
              <li key={p}>• {p}</li>
            ))}
          </ul>
        </section>

        <section className="card divide-y divide-line">
          {autoAllowed && (
            <div className="flex items-center gap-3 p-4">
              <RefreshCw className="size-5 shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">Auto-renew from wallet</p>
                <p className="text-xs text-muted">Keep enough balance before {formatDate(m.currentPeriodEnd)}.</p>
              </div>
              <Toggle
                checked={!!m.autoRenew}
                disabled={toggling}
                ariaLabel="Auto-renew"
                onChange={(v) => setAuto({ id: m._id, autoRenew: v }).unwrap().then(() => toast.success(v ? 'Auto-renew on' : 'Auto-renew off')).catch((e) => toast.error(errorMessage(e)))}
              />
            </div>
          )}
          {canRenew && (
            <button className="flex w-full items-center gap-3 p-4 text-left hover:bg-surface-2" onClick={() => setModal('renew')}>
              <CalendarClock className="size-5 shrink-0 text-brand" />
              <span className="flex-1">
                <span className="block font-medium">Renew now</span>
                <span className="block text-xs text-muted">Add another {t.durationDays} days at your agreed price</span>
              </span>
            </button>
          )}
          {['active', 'cancellation_pending', 'past_due'].includes(m.status) && (
            <button className="flex w-full items-center gap-3 p-4 text-left hover:bg-surface-2" onClick={() => setModal('change')}>
              <Repeat className="size-5 shrink-0 text-brand" />
              <span className="flex-1">
                <span className="block font-medium">Change plan</span>
                <span className="block text-xs text-muted">Applies from your next renewal</span>
              </span>
            </button>
          )}
          {m.status === 'cancellation_pending' && (
            <button
              className="flex w-full items-center gap-3 p-4 text-left hover:bg-surface-2"
              disabled={undoing}
              onClick={() => undo(m._id).unwrap().then(() => toast.success('Cancellation undone')).catch((e) => toast.error(errorMessage(e)))}
            >
              <RefreshCw className="size-5 shrink-0 text-brand" />
              <span className="flex-1">
                <span className="block font-medium">Keep my membership</span>
                <span className="block text-xs text-muted">Undo the cancellation</span>
              </span>
            </button>
          )}
          {canCancel && (
            <button className="flex w-full items-center gap-3 p-4 text-left text-error hover:bg-surface-2" onClick={() => setModal('cancel')}>
              <XCircle className="size-5 shrink-0" />
              <span className="flex-1 font-medium">Cancel membership</span>
            </button>
          )}
          <Link to="/account/billing" className="flex items-center gap-3 p-4 hover:bg-surface-2">
            <HistoryIcon className="size-5 shrink-0 text-brand" />
            <span className="flex-1 font-medium">Payments & invoices</span>
          </Link>
        </section>
      </div>

      {events.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">History</h2>
          <ol className="space-y-3 border-l-2 border-line pl-4 text-sm">
            {events.map((e) => (
              <li key={e._id} className="relative">
                <span className="absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full bg-primary" />
                <p className="font-medium">{EVENT_TEXT[e.type] || e.type}</p>
                {e.note && <p className="text-muted">{e.note}</p>}
                <p className="text-xs text-muted">
                  {formatDateTime(e.createdAt)}
                  {e.actor?.role && e.actor.role !== 'customer' && e.actor.role !== 'system' ? ' · by Gavyora' : ''}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <History history={data.history} />
      {modal === 'renew' && <RenewModal membership={m} onClose={() => setModal(null)} />}
      {modal === 'cancel' && <CancelModal membership={m} onClose={() => setModal(null)} />}
      {modal === 'change' && <ChangePlanModal membership={m} onClose={() => setModal(null)} />}
    </div>
  )
}

function History({ history }) {
  if (!history?.length) return null
  return (
    <section className="card overflow-x-auto">
      <h2 className="border-b border-line px-5 py-3 font-semibold">Past memberships</h2>
      <ul className="divide-y divide-line">
        {history.map((h) => (
          <li key={h._id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
            <span>
              {h.terms?.name} <span className="text-xs text-muted">· {h.code}</span>
              <span className="block text-xs text-muted">
                {formatDate(h.startedAt || h.createdAt)} – {formatDate(h.cancelledAt || h.currentPeriodEnd)}
              </span>
            </span>
            <StatusBadge status={h.status} />
          </li>
        ))}
      </ul>
    </section>
  )
}
