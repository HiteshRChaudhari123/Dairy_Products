import { Download, Search } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { Link, useSearchParams } from 'react-router-dom'
import { errorMessage, useAdminRefundsQuery, useAdminTransactionsQuery, useCreateRefundMutation, useDecideRefundMutation } from '../../../app/api'
import { hasPerm, usePanelBase } from '../../../components/guards'
import { EmptyState, ErrorState, Field, Modal, PageHeader, Pagination, Skeleton, StatusBadge, Tabs } from '../../../components/ui'
import { selectUser } from '../../../features/auth/authSlice'
import { formatMinor, PROVIDER_LABEL, PURPOSE_LABEL } from '../../../lib/billing'
import { formatDateTime, STATUS_LABEL } from '../../../lib/format'
import { downloadCSV } from '../_shared'
import { csvDate, RefundModal } from './_billing'

const TX_STATUSES = ['created', 'paid', 'failed', 'expired', 'refunded', 'partially_refunded']

function Transactions() {
  const base = usePanelBase()
  const user = useSelector(selectUser)
  const [params, setParams] = useSearchParams()
  const f = { q: params.get('q') || '', status: params.get('status') || '', purpose: params.get('purpose') || '', provider: params.get('provider') || '', from: params.get('from') || '', to: params.get('to') || '', page: Number(params.get('page')) || 1 }
  const [search, setSearch] = useState(f.q)
  const { data, isLoading, isFetching, error, refetch } = useAdminTransactionsQuery(f)
  const [createRefund, { isLoading: refunding }] = useCreateRefundMutation()
  const [refundTx, setRefundTx] = useState(null)
  const set = (patch) => {
    const next = new URLSearchParams(params)
    Object.entries({ page: '', ...patch }).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next)
  }
  const items = data?.items || []
  const canRefund = hasPerm(user, 'refunds')

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <form
          className="relative min-w-0 flex-1 basis-60"
          onSubmit={(e) => {
            e.preventDefault()
            set({ ...f, q: search.trim() })
          }}
        >
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Customer, phone or gateway payment id" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <select className="input w-auto" value={f.status} onChange={(e) => set({ ...f, status: e.target.value })} aria-label="Status">
          <option value="">All statuses</option>
          {TX_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={f.purpose} onChange={(e) => set({ ...f, purpose: e.target.value })} aria-label="Purpose">
          <option value="">All purposes</option>
          {Object.entries(PURPOSE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={f.provider} onChange={(e) => set({ ...f, provider: e.target.value })} aria-label="Method">
          <option value="">All methods</option>
          {Object.entries(PROVIDER_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input type="date" className="input w-auto" value={f.from} onChange={(e) => set({ ...f, from: e.target.value })} aria-label="From" />
        <input type="date" className="input w-auto" value={f.to} onChange={(e) => set({ ...f, to: e.target.value })} aria-label="To" />
        <button
          className="btn-outline"
          disabled={!items.length}
          onClick={() =>
            downloadCSV(`payments-page-${f.page}.csv`, [
              ['Created', 'Paid', 'Customer', 'Phone', 'Purpose', 'Method', 'Amount (INR)', 'Refunded (INR)', 'Status', 'Gateway payment id', 'Invoice'],
              ...items.map((t) => [csvDate(t.createdAt), csvDate(t.paidAt), t.user?.name, t.user?.phone, PURPOSE_LABEL[t.purpose], PROVIDER_LABEL[t.provider], t.amountMinor / 100, t.refundedMinor / 100, STATUS_LABEL[t.status], t.providerPaymentId || '', t.invoice?.number || '']),
            ])
          }
        >
          <Download className="size-4" /> CSV
        </button>
      </div>
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !items.length ? (
        <div className="card">
          <EmptyState icon="🧾" title="No payments match" />
        </div>
      ) : (
        <div className={`card overflow-x-auto ${isFetching ? 'opacity-60' : ''}`}>
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>Purpose</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t._id}>
                  <td className="text-xs whitespace-nowrap">
                    {formatDateTime(t.paidAt || t.createdAt)}
                    {t.providerPaymentId && <span className="block font-mono text-muted">{t.providerPaymentId}</span>}
                  </td>
                  <td>
                    {t.user?.name}
                    <span className="block text-xs text-muted">{t.user?.phone}</span>
                  </td>
                  <td className="text-sm">
                    {PURPOSE_LABEL[t.purpose]}
                    <span className="block text-xs text-muted">{PROVIDER_LABEL[t.provider]}</span>
                    {t.membership && (
                      <Link to={`${base}/memberships/${t.membership}`} className="link text-xs">
                        Membership
                      </Link>
                    )}
                    {t.subscription && (
                      <Link to={`${base}/plan-subscriptions/${t.subscription}`} className="link text-xs">
                        Subscription
                      </Link>
                    )}
                  </td>
                  <td className="text-right font-semibold whitespace-nowrap">
                    {formatMinor(t.amountMinor)}
                    {t.refundedMinor > 0 && <span className="block text-xs font-normal text-muted">−{formatMinor(t.refundedMinor)}</span>}
                  </td>
                  <td>
                    <StatusBadge status={t.status} />
                    {t.fulfilment === 'failed' && <span className="chip mt-1 block w-fit bg-error/10 text-error">Activation failed</span>}
                    {t.failureReason && <span className="block text-xs text-muted">{t.failureReason}</span>}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    {t.invoice && (
                      <Link to={`${base}/invoices/${t.invoice._id}`} className="btn-ghost btn-sm">
                        {t.invoice.number}
                      </Link>
                    )}
                    {canRefund && ['paid', 'partially_refunded'].includes(t.status) && t.amountMinor > t.refundedMinor && (
                      <button className="btn-ghost btn-sm" onClick={() => setRefundTx(t)}>
                        Refund
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={f.page} pages={data?.pages} onChange={(p) => set({ ...f, page: String(p) })} />
      {refundTx && (
        <RefundModal
          tx={refundTx}
          busy={refunding}
          onClose={() => setRefundTx(null)}
          onSubmit={(body) =>
            createRefund(body)
              .unwrap()
              .then((r) => {
                toast.success(r.status === 'requested' ? 'Refund requested; it needs super admin approval' : `Refund ${STATUS_LABEL[r.status]?.toLowerCase()}`)
                setRefundTx(null)
              })
              .catch((e) => toast.error(errorMessage(e)))
          }
        />
      )}
    </>
  )
}

function Refunds() {
  const user = useSelector(selectUser)
  const [status, setStatus] = useState('requested')
  const { data, isLoading, error, refetch } = useAdminRefundsQuery(status)
  const [decide, { isLoading: deciding }] = useDecideRefundMutation()
  const [deciding_, setDeciding] = useState(null) // { refund, approve }
  const [note, setNote] = useState('')
  const canDecide = hasPerm(user, 'refunds')
  const limit = data?.approvalLimitMinor ?? 0

  const submit = async () => {
    try {
      const r = await decide({ id: deciding_.refund._id, approve: deciding_.approve, note: note.trim() }).unwrap()
      toast.success(deciding_.approve ? `Refund ${STATUS_LABEL[r.status]?.toLowerCase()}` : 'Refund rejected')
      setDeciding(null)
      setNote('')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { value: 'requested', label: 'Awaiting decision' },
            { value: 'processing', label: 'Processing' },
            { value: 'succeeded', label: 'Succeeded' },
            { value: 'failed,rejected', label: 'Failed / rejected' },
            { value: '', label: 'All' },
          ]}
          value={status}
          onChange={setStatus}
        />
        <p className="text-xs text-muted">Admin approval limit: {formatMinor(limit)}. Larger refunds need a super admin.</p>
      </div>
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data.items.length ? (
        <div className="card">
          <EmptyState icon="↩️" title="No refunds here" />
        </div>
      ) : (
        <ul className="space-y-3">
          {data.items.map((r) => {
            const mine = String(r.requestedBy?._id) === String(user?._id)
            const overLimit = user?.role !== 'superadmin' && r.amountMinor > limit
            return (
              <li key={r._id} className="card flex flex-wrap items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {formatMinor(r.amountMinor)} to {r.destination === 'source' ? 'original payment method' : 'wallet'} · {r.user?.name}
                  </p>
                  <p className="text-sm text-muted">{r.reason}</p>
                  <p className="text-xs text-muted">
                    {formatDateTime(r.createdAt)} · requested by {r.requestedBy?.name || 'system'}
                    {r.decidedBy?.name ? ` · decided by ${r.decidedBy.name}` : ''}
                    {r.failureReason ? ` · ${r.failureReason}` : ''}
                  </p>
                </div>
                <StatusBadge status={r.status} />
                {r.status === 'requested' && canDecide && (
                  <div className="flex gap-2">
                    <button className="btn-outline btn-sm text-error" onClick={() => setDeciding({ refund: r, approve: false })}>
                      Reject
                    </button>
                    <button
                      className="btn-primary btn-sm"
                      disabled={overLimit || (mine && user?.role !== 'superadmin')}
                      title={overLimit ? 'Above your approval limit' : mine ? 'You cannot approve your own request' : undefined}
                      onClick={() => setDeciding({ refund: r, approve: true })}
                    >
                      Approve
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <Modal
        open={!!deciding_}
        onClose={() => setDeciding(null)}
        title={deciding_?.approve ? 'Approve refund' : 'Reject refund'}
        size="max-w-md"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setDeciding(null)}>
              Back
            </button>
            <button className={deciding_?.approve ? 'btn-primary' : 'btn-danger'} disabled={deciding || note.trim().length < 3} onClick={submit}>
              {deciding_?.approve ? 'Approve & process' : 'Reject'}
            </button>
          </>
        }
      >
        {deciding_ && <p className="mb-4 text-sm text-muted">{formatMinor(deciding_.refund.amountMinor)} for {deciding_.refund.user?.name}. Gateway refunds stay "processing" until Razorpay confirms them.</p>}
        <Field label="Decision note (required)">
          <textarea className="input min-h-20" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Modal>
    </>
  )
}

export default function Payments() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'payments'
  return (
    <div>
      <PageHeader title="Payments & refunds" subtitle="Verified membership and subscription payments, invoices and refunds" />
      <div className="mb-5">
        <Tabs
          tabs={[
            { value: 'payments', label: 'Payments' },
            { value: 'refunds', label: 'Refunds' },
          ]}
          value={tab}
          onChange={(v) => setParams(v === 'payments' ? {} : { tab: v })}
        />
      </div>
      {tab === 'refunds' ? <Refunds /> : <Transactions />}
    </div>
  )
}
