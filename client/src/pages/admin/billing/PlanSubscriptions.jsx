import { ArrowLeft, Download, Search } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { errorMessage, useAdminPlanSubscriptionQuery, useAdminPlanSubscriptionsQuery, useAdminPlansQuery, useCreateRefundMutation, useSubscriptionActionMutation } from '../../../app/api'
import { hasPerm, usePanelBase } from '../../../components/guards'
import { EmptyState, ErrorState, Field, PageHeader, PageLoader, Pagination, Skeleton, StatusBadge } from '../../../components/ui'
import { selectUser } from '../../../features/auth/authSlice'
import { formatMinor, policyLines, scheduleText } from '../../../lib/billing'
import { formatDate, formatDateTime, PAYMENT_LABEL, STATUS_LABEL, telHref } from '../../../lib/format'
import { downloadCSV } from '../_shared'
import { EventTimeline, ReasonModal, RefundModal, TransactionsTable } from './_billing'

const STATUSES = ['pending_payment', 'active', 'paused', 'past_due', 'suspended', 'cancelled', 'failed']

export default function PlanSubscriptions() {
  const base = usePanelBase()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const f = {
    q: params.get('q') || '',
    status: params.get('status') || '',
    plan: params.get('plan') || '',
    billing: params.get('billing') || '',
    pincode: params.get('pincode') || '',
    page: Number(params.get('page')) || 1,
  }
  const [search, setSearch] = useState(f.q)
  const { data, isLoading, isFetching, error, refetch } = useAdminPlanSubscriptionsQuery(f)
  const { data: plans = [] } = useAdminPlansQuery({ kind: 'product' })
  const set = (patch) => {
    const next = new URLSearchParams(params)
    Object.entries({ page: '', ...patch }).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next)
  }
  const items = data?.items || []

  return (
    <div>
      <PageHeader
        title="Product subscriptions"
        subtitle={data ? `${data.total} subscriptions in your scope` : 'Recurring dairy deliveries'}
        actions={
          <>
            <Link to={`${base}/subscriptions`} className="btn-outline btn-sm">
              Tomorrow's milk sheet
            </Link>
            <button
              className="btn-outline btn-sm"
              disabled={!items.length}
              onClick={() =>
                downloadCSV(`subscriptions-page-${f.page}.csv`, [
                  ['Code', 'Customer', 'Phone', 'Plan', 'Items', 'Schedule', 'Slot', 'Pincode', 'Billing', 'Balance (INR)', 'Status', 'Start'],
                  ...items.map((s) => [
                    s.code,
                    s.user?.name,
                    s.user?.phone,
                    s.plan?.name || 'Legacy',
                    s.items.map((i) => `${i.productName} ${i.variantLabel} x${i.qty}`).join('; '),
                    scheduleText(s),
                    s.slot,
                    s.address?.pincode,
                    s.billingMode,
                    s.prepaidBalanceMinor / 100,
                    STATUS_LABEL[s.status] || s.status,
                    s.startDate,
                  ]),
                ])
              }
            >
              <Download className="size-4" /> Export CSV
            </button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <form
          className="relative min-w-0 flex-1 basis-60"
          onSubmit={(e) => {
            e.preventDefault()
            set({ ...f, q: search.trim() })
          }}
        >
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Name, phone, email or subscription code" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <select className="input w-auto" value={f.status} onChange={(e) => set({ ...f, status: e.target.value })} aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={f.plan} onChange={(e) => set({ ...f, plan: e.target.value })} aria-label="Plan">
          <option value="">All plans</option>
          {plans.map((p) => (
            <option key={p._id} value={p._id}>
              {p.name}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={f.billing} onChange={(e) => set({ ...f, billing: e.target.value })} aria-label="Billing">
          <option value="">Any billing</option>
          <option value="prepaid">Prepaid</option>
          <option value="per_delivery">Per delivery</option>
        </select>
        <input className="input w-28" inputMode="numeric" maxLength={6} placeholder="Pincode" value={f.pincode} onChange={(e) => set({ ...f, pincode: e.target.value.replace(/\D/g, '') })} aria-label="Pincode" />
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !items.length ? (
        <div className="card">
          <EmptyState icon="🔁" title="No subscriptions match" />
        </div>
      ) : (
        <div className={isFetching ? 'opacity-60' : ''}>
          <div className="card hidden overflow-x-auto md:block">
            <table className="table">
              <thead>
                <tr>
                  <th>Subscription</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Schedule</th>
                  <th className="text-right">Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => (
                  <tr key={s._id} className="cursor-pointer hover:bg-surface-2" onClick={() => navigate(`${base}/plan-subscriptions/${s._id}`)}>
                    <td>
                      <span className="font-mono text-xs">{s.code}</span>
                      <span className="block text-xs text-muted">{s.plan?.name || 'Legacy (pay per delivery)'}</span>
                    </td>
                    <td>
                      {s.user?.name}
                      <span className="block text-xs text-muted">
                        {s.user?.phone} · {s.address?.pincode}
                      </span>
                    </td>
                    <td className="text-xs">{s.items.map((i) => `${i.productName} ${i.variantLabel} ×${i.qty}`).join(', ')}</td>
                    <td className="text-xs">
                      {scheduleText(s)}
                      <span className="block text-muted">{s.slot}</span>
                    </td>
                    <td className="text-right">{s.billingMode === 'prepaid' ? formatMinor(s.prepaidBalanceMinor) : '—'}</td>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {items.map((s) => (
              <Link key={s._id} to={`${base}/plan-subscriptions/${s._id}`} className="card block p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block font-medium">{s.user?.name}</span>
                    <span className="block text-xs text-muted">
                      {s.code} · {s.plan?.name || 'Legacy'}
                    </span>
                  </span>
                  <StatusBadge status={s.status} />
                </div>
                <p className="mt-2 text-xs text-muted">{s.items.map((i) => `${i.productName} ×${i.qty}`).join(', ')}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
      <Pagination page={f.page} pages={data?.pages} onChange={(p) => set({ ...f, page: String(p) })} />
    </div>
  )
}

const ACTIONS = {
  pause: ['Pause', 'Stops deliveries until resumed.', false],
  resume: ['Resume', 'Restarts deliveries (past due if the prepaid balance is too low).', false],
  cancel: ['Cancel subscription', 'Stops future deliveries; unused prepaid balance is refunded per the plan.', true],
  suspend: ['Suspend', 'Override: stops deliveries. Admins need super admin approval.', true],
  reinstate: ['Reinstate', 'Override: makes it active again. Admins need super admin approval.', false],
  credit: ['Credit balance', 'Override: adds to the prepaid balance (e.g. compensation). Admins need approval.', false],
}

export function PlanSubscriptionDetail() {
  const { id } = useParams()
  const base = usePanelBase()
  const user = useSelector(selectUser)
  const { data, isLoading, error, refetch } = useAdminPlanSubscriptionQuery(id)
  const [act, { isLoading: acting }] = useSubscriptionActionMutation()
  const [createRefund, { isLoading: refunding }] = useCreateRefundMutation()
  const [action, setAction] = useState(null)
  const [credit, setCredit] = useState('')
  const [refundTx, setRefundTx] = useState(null)
  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  const { subscription: s, events, transactions, refunds, requests, orders } = data
  const available = {
    pause: s.status === 'active',
    resume: s.status === 'paused',
    cancel: s.status !== 'cancelled',
    suspend: ['active', 'paused', 'past_due'].includes(s.status),
    reinstate: s.status === 'suspended',
    credit: s.billingMode === 'prepaid' && s.status !== 'cancelled',
  }
  const run = async (reason) => {
    try {
      const r = await act({ id: s._id, action, reason, ...(action === 'credit' ? { amountMinor: Math.round(Number(credit) * 100) } : {}) }).unwrap()
      toast.success(r.applied ? 'Done' : 'Request sent to a super admin for approval')
      setAction(null)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div>
      <Link to={`${base}/plan-subscriptions`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-accent">
        <ArrowLeft className="size-4" /> All product subscriptions
      </Link>
      <PageHeader
        title={`${s.plan?.name || 'Subscription'} · ${s.code}`}
        subtitle={`${s.terms ? `Plan version ${s.terms.version} · ` : 'Legacy subscription · '}${s.billingMode === 'prepaid' ? 'prepaid' : 'pay per delivery'} · since ${formatDate(s.startDate)}`}
        actions={<StatusBadge status={s.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card p-5 text-sm">
            <h2 className="mb-3 font-semibold">Items & schedule</h2>
            <ul className="space-y-1">
              {s.items.map((i) => (
                <li key={String(i.variantId)}>
                  {i.productName} ({i.variantLabel}) × {i.qty} · {formatMinor(Math.round(i.price * 100))} each
                </li>
              ))}
            </ul>
            <p className="mt-3 text-muted">
              {scheduleText(s)} · {s.slot} · {s.pausedDates.length} paused dates ahead
              {s.billingMode === 'prepaid' && ` · balance ${formatMinor(s.prepaidBalanceMinor)}`}
            </p>
            {s.cancelReason && <p className="mt-2 text-error">Cancel reason: {s.cancelReason}</p>}
          </div>

          <div className="card p-5">
            <h2 className="mb-3 font-semibold">Actions</h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(ACTIONS)
                .filter(([k]) => available[k])
                .map(([k, [label, , danger]]) => (
                  <button key={k} className={danger ? 'btn-outline btn-sm text-error' : 'btn-outline btn-sm'} onClick={() => setAction(k)}>
                    {label}
                  </button>
                ))}
            </div>
          </div>

          <div className="card overflow-x-auto">
            <h2 className="border-b border-line px-5 py-3 font-semibold">Deliveries (latest 30)</h2>
            {orders.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Order</th>
                    <th>Payment</th>
                    <th>Partner</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o._id}>
                      <td className="whitespace-nowrap">{o.slot?.date}</td>
                      <td>
                        <Link to={`${base}/orders/${o._id}`} className="link">
                          {o.orderNo}
                        </Link>
                        <span className="block text-xs text-muted">{formatMinor(Math.round(o.total * 100))}</span>
                      </td>
                      <td className="text-xs">
                        {PAYMENT_LABEL[o.payment?.method]} · {STATUS_LABEL[o.payment?.status]}
                      </td>
                      <td className="text-xs">{o.deliveryPartner?.name || 'Unassigned'}</td>
                      <td>
                        <StatusBadge status={o.status} />
                        {o.failureReason && <span className="block text-xs text-error">{o.failureReason}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="p-5 text-sm text-muted">No deliveries generated yet.</p>
            )}
          </div>

          <div className="card overflow-x-auto">
            <h2 className="border-b border-line px-5 py-3 font-semibold">Payments</h2>
            <TransactionsTable items={transactions} onRefund={hasPerm(user, 'refunds') ? setRefundTx : undefined} />
          </div>
          {refunds.length > 0 && (
            <div className="card">
              <h2 className="border-b border-line px-5 py-3 font-semibold">Refunds</h2>
              <ul className="divide-y divide-line text-sm">
                {refunds.map((r) => (
                  <li key={r._id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <span>{r.reason}</span>
                    <span className="flex items-center gap-2">
                      <b>{formatMinor(r.amountMinor)}</b> <StatusBadge status={r.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="card p-5">
            <h2 className="mb-3 font-semibold">History</h2>
            <EventTimeline events={events} />
          </div>
        </div>

        <div className="space-y-6">
          <div className="card space-y-1 p-5 text-sm">
            <h2 className="mb-1 font-semibold">Customer & address</h2>
            <p className="font-medium">{s.user?.name}</p>
            {s.user?.phone && (
              <a href={telHref(s.user.phone)} className="link block">
                {s.user.phone}
              </a>
            )}
            <p className="text-muted">
              {s.address?.line1}
              {s.address?.line2 ? `, ${s.address.line2}` : ''}, {s.address?.city} – <b>{s.address?.pincode}</b>
            </p>
          </div>
          {s.terms && (
            <div className="card p-5 text-xs text-muted">
              <h2 className="mb-2 text-sm font-semibold text-ink">Agreed terms</h2>
              <ul className="space-y-1">
                {policyLines(s.terms, 'product').map((p) => (
                  <li key={p}>• {p}</li>
                ))}
              </ul>
            </div>
          )}
          {requests.length > 0 && (
            <div className="card p-5 text-sm">
              <h2 className="mb-2 font-semibold">Override requests</h2>
              <ul className="space-y-2">
                {requests.map((r) => (
                  <li key={r._id} className="flex items-start justify-between gap-2">
                    <span>
                      {r.action}: {r.reason}
                      <span className="block text-xs text-muted">
                        by {r.requestedBy?.name} · {formatDateTime(r.createdAt)}
                      </span>
                    </span>
                    <StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {action && (
        <ReasonModal
          open
          title={ACTIONS[action][0]}
          text={ACTIONS[action][1]}
          danger={ACTIONS[action][2]}
          busy={acting || (action === 'credit' && !(Number(credit) > 0))}
          confirmLabel={ACTIONS[action][0]}
          extra={
            action === 'credit' && (
              <Field label="Amount to credit (₹)" className="mb-4">
                <input type="number" min="1" step="0.01" className="input" value={credit} onChange={(e) => setCredit(e.target.value)} />
              </Field>
            )
          }
          onClose={() => setAction(null)}
          onConfirm={run}
        />
      )}
      {refundTx && (
        <RefundModal
          tx={refundTx}
          busy={refunding}
          onClose={() => setRefundTx(null)}
          onSubmit={(body) =>
            createRefund(body)
              .unwrap()
              .then((r) => {
                toast.success(r.status === 'requested' ? 'Refund requested; a super admin must approve it' : `Refund ${STATUS_LABEL[r.status]?.toLowerCase() || r.status}`)
                setRefundTx(null)
                refetch()
              })
              .catch((e) => toast.error(errorMessage(e)))
          }
        />
      )}
    </div>
  )
}

