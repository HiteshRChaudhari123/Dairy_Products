import { ArrowLeft, Download, Search } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { errorMessage, useAdminMembershipQuery, useAdminMembershipsQuery, useAdminPlansQuery, useCreateRefundMutation, useMembershipActionMutation } from '../../../app/api'
import { hasPerm, usePanelBase } from '../../../components/guards'
import { EmptyState, ErrorState, Field, PageHeader, PageLoader, Pagination, Skeleton, StatusBadge } from '../../../components/ui'
import { selectUser } from '../../../features/auth/authSlice'
import { benefitLines, formatMinor, planPriceText, policyLines } from '../../../lib/billing'
import { formatDate, formatDateTime, STATUS_LABEL, telHref } from '../../../lib/format'
import { downloadCSV } from '../_shared'
import { csvDate, EventTimeline, ReasonModal, RefundModal, TransactionsTable } from './_billing'

const STATUSES = ['pending_payment', 'active', 'cancellation_pending', 'past_due', 'suspended', 'cancelled', 'expired', 'failed']

export default function Memberships() {
  const base = usePanelBase()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const f = { q: params.get('q') || '', status: params.get('status') || '', plan: params.get('plan') || '', renewsBefore: params.get('renewsBefore') || '', page: Number(params.get('page')) || 1 }
  const [search, setSearch] = useState(f.q)
  const { data, isLoading, isFetching, error, refetch } = useAdminMembershipsQuery(f)
  const { data: plans = [] } = useAdminPlansQuery({ kind: 'membership' })
  const set = (patch) => {
    const next = new URLSearchParams(params)
    Object.entries({ page: '', ...patch }).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next)
  }
  const items = data?.items || []

  return (
    <div>
      <PageHeader
        title="Memberships"
        subtitle={data ? `${data.total} memberships` : 'Customer memberships'}
        actions={
          <button
            className="btn-outline btn-sm"
            disabled={!items.length}
            onClick={() =>
              downloadCSV(`memberships-page-${f.page}.csv`, [
                ['Code', 'Customer', 'Phone', 'Plan', 'Version', 'Status', 'Started', 'Term ends', 'Auto-renew'],
                ...items.map((m) => [m.code, m.user?.name, m.user?.phone, m.terms?.name, m.terms?.version, STATUS_LABEL[m.status] || m.status, csvDate(m.startedAt), csvDate(m.currentPeriodEnd), m.autoRenew ? 'yes' : 'no']),
              ])
            }
          >
            <Download className="size-4" /> Export CSV
          </button>
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
          <input className="input pl-9" placeholder="Name, phone, email or membership code" value={search} onChange={(e) => setSearch(e.target.value)} />
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
        <label className="flex items-center gap-2 text-xs text-muted">
          Renews by
          <input type="date" className="input w-auto" value={f.renewsBefore} onChange={(e) => set({ ...f, renewsBefore: e.target.value })} />
        </label>
      </div>

      {isLoading ? (
        <Skeleton className="h-64" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !items.length ? (
        <div className="card">
          <EmptyState icon="👑" title="No memberships match" />
        </div>
      ) : (
        <div className={isFetching ? 'opacity-60' : ''}>
          <div className="card hidden overflow-x-auto md:block">
            <table className="table">
              <thead>
                <tr>
                  <th>Membership</th>
                  <th>Customer</th>
                  <th>Plan</th>
                  <th>Term ends</th>
                  <th>Auto-renew</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m._id} className="cursor-pointer hover:bg-surface-2" onClick={() => navigate(`${base}/memberships/${m._id}`)}>
                    <td className="font-mono text-xs">{m.code}</td>
                    <td>
                      {m.user?.name}
                      <span className="block text-xs text-muted">{m.user?.phone || m.user?.email}</span>
                    </td>
                    <td>
                      {m.terms?.name} <span className="text-xs text-muted">v{m.terms?.version}</span>
                    </td>
                    <td className="text-xs whitespace-nowrap">{formatDate(m.currentPeriodEnd)}</td>
                    <td>{m.autoRenew ? 'Yes' : 'No'}</td>
                    <td>
                      <StatusBadge status={m.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {items.map((m) => (
              <Link key={m._id} to={`${base}/memberships/${m._id}`} className="card block p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block font-medium">{m.user?.name}</span>
                    <span className="block text-xs text-muted">
                      {m.terms?.name} · {m.code}
                    </span>
                  </span>
                  <StatusBadge status={m.status} />
                </div>
                <p className="mt-2 text-xs text-muted">Term ends {formatDate(m.currentPeriodEnd)}</p>
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
  cancel: ['Cancel at end of term', 'Benefits continue until the term ends; it will not renew.', true],
  cancel_now: ['Cancel immediately', 'Ends benefits now. A pro-rata refund is issued only if the plan allows it.', true],
  undo_cancel: ['Undo cancellation', 'The membership stays active and renews as before.', false],
  suspend: ['Suspend', 'Stops benefits until reinstated. Admins: needs super admin approval.', true],
  reinstate: ['Reinstate', 'Restores the membership (or marks it expired if its term has ended). Admins: needs approval.', false],
  extend: ['Extend term', 'Adds days to the current term at no charge. Admins: needs approval.', false],
}

export function MembershipDetail() {
  const { id } = useParams()
  const base = usePanelBase()
  const user = useSelector(selectUser)
  const { data, isLoading, error, refetch } = useAdminMembershipQuery(id)
  const [act, { isLoading: acting }] = useMembershipActionMutation()
  const [createRefund, { isLoading: refunding }] = useCreateRefundMutation()
  const [action, setAction] = useState(null)
  const [days, setDays] = useState(7)
  const [refundTx, setRefundTx] = useState(null)

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  const { membership: m, events, transactions, refunds, requests, invoices } = data
  const t = m.terms
  const available = {
    cancel: m.status === 'active',
    cancel_now: ['active', 'cancellation_pending', 'past_due', 'suspended'].includes(m.status),
    undo_cancel: m.status === 'cancellation_pending',
    suspend: ['active', 'cancellation_pending', 'past_due'].includes(m.status),
    reinstate: m.status === 'suspended',
    extend: ['active', 'cancellation_pending', 'past_due'].includes(m.status),
  }
  const run = async (reason) => {
    try {
      const r = await act({ id: m._id, action, reason, ...(action === 'extend' ? { days: Number(days) } : {}) }).unwrap()
      toast.success(r.applied ? 'Done' : 'Request sent to a super admin for approval')
      setAction(null)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const invoiceFor = (tx) => invoices.find((i) => String(i.transaction) === String(tx._id))

  return (
    <div>
      <Link to={`${base}/memberships`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-accent">
        <ArrowLeft className="size-4" /> All memberships
      </Link>
      <PageHeader title={`${t.name} · ${m.code}`} subtitle={`Plan version ${t.version} · ${planPriceText(t)} · created ${formatDateTime(m.createdAt)}`} actions={<StatusBadge status={m.status} />} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card grid gap-4 p-5 text-sm sm:grid-cols-4">
            {[
              ['Started', formatDate(m.startedAt)],
              ['Term', `${formatDate(m.currentPeriodStart)} – ${formatDate(m.currentPeriodEnd)}`],
              ['Grace until', m.graceUntil ? formatDate(m.graceUntil) : '—'],
              ['Auto-renew', m.autoRenew ? `Yes (${m.renewalAttempts} retries used)` : 'No'],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-xs text-muted">{k}</p>
                <p className="font-medium">{v}</p>
              </div>
            ))}
            {m.cancelReason && <p className="text-error sm:col-span-4">Cancel reason: {m.cancelReason}</p>}
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
              {!Object.values(available).some(Boolean) && <p className="text-sm text-muted">No actions in this status.</p>}
            </div>
          </div>

          <div className="card overflow-x-auto">
            <h2 className="border-b border-line px-5 py-3 font-semibold">Payments</h2>
            <TransactionsTable
              items={transactions}
              onRefund={hasPerm(user, 'refunds') ? setRefundTx : undefined}
              invoiceLink={(tx) =>
                invoiceFor(tx) && (
                  <Link to={`${base}/invoices/${invoiceFor(tx)._id}`} className="btn-ghost btn-sm">
                    {invoiceFor(tx).number}
                  </Link>
                )
              }
            />
          </div>

          {refunds.length > 0 && (
            <div className="card">
              <h2 className="border-b border-line px-5 py-3 font-semibold">Refunds</h2>
              <ul className="divide-y divide-line text-sm">
                {refunds.map((r) => (
                  <li key={r._id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <span>
                      {r.reason}
                      <span className="block text-xs text-muted">{formatDateTime(r.createdAt)} · to {r.destination}</span>
                    </span>
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
          <div className="card space-y-2 p-5 text-sm">
            <h2 className="font-semibold">Customer</h2>
            <p className="font-medium">{m.user?.name}</p>
            {m.user?.phone && (
              <a href={telHref(m.user.phone)} className="link block">
                {m.user.phone}
              </a>
            )}
            {m.user?.email && <p className="break-all text-muted">{m.user.email}</p>}
            <p className="text-muted">Wallet {formatMinor(Math.round((m.user?.wallet || 0) * 100))}</p>
          </div>
          <div className="card p-5 text-sm">
            <h2 className="mb-2 font-semibold">Agreed terms</h2>
            <ul className="space-y-1">
              {benefitLines(t).map((b) => (
                <li key={b}>• {b}</li>
              ))}
            </ul>
            <ul className="mt-3 space-y-1 text-xs text-muted">
              {policyLines(t, 'membership').map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          </div>
          {requests.length > 0 && (
            <div className="card p-5 text-sm">
              <h2 className="mb-2 font-semibold">Override requests</h2>
              <ul className="space-y-2">
                {requests.map((r) => (
                  <li key={r._id} className="flex items-start justify-between gap-2">
                    <span>
                      {r.action}: {r.reason}
                      <span className="block text-xs text-muted">by {r.requestedBy?.name}</span>
                    </span>
                    <StatusBadge status={r.status === 'pending' ? 'pending' : r.status} />
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
          busy={acting}
          confirmLabel={ACTIONS[action][0]}
          extra={
            action === 'extend' && (
              <Field label="Days to add" className="mb-4">
                <input type="number" min="1" max="365" className="input" value={days} onChange={(e) => setDays(e.target.value)} />
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
