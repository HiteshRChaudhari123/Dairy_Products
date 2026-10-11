import { useState } from 'react'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import { errorMessage, useDecideRequestMutation, useOverrideRequestsQuery } from '../../../app/api'
import { usePanelBase } from '../../../components/guards'
import { EmptyState, ErrorState, Field, Modal, PageHeader, PageLoader, StatusBadge, Tabs } from '../../../components/ui'
import { selectUser } from '../../../features/auth/authSlice'
import { formatMinor } from '../../../lib/billing'
import { formatDateTime } from '../../../lib/format'

const describe = (r) =>
  r.action === 'extend' ? `Extend by ${r.payload?.days} days` : r.action === 'credit' ? `Credit ${formatMinor(r.payload?.amountMinor || 0)} to balance` : r.action.charAt(0).toUpperCase() + r.action.slice(1)

/** Manual overrides requested by admins. Super admins approve or reject; admins see the status of their own. */
export default function Requests() {
  const base = usePanelBase()
  const user = useSelector(selectUser)
  const owner = user?.role === 'superadmin'
  const [status, setStatus] = useState('pending')
  const { data = [], isLoading, error, refetch } = useOverrideRequestsQuery(status)
  const [decide, { isLoading: saving }] = useDecideRequestMutation()
  const [open, setOpen] = useState(null)
  const [note, setNote] = useState('')

  const submit = async () => {
    try {
      await decide({ id: open.request._id, approve: open.approve, note: note.trim() || undefined }).unwrap()
      toast.success(open.approve ? 'Approved and applied' : 'Rejected')
      setOpen(null)
      setNote('')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div>
      <PageHeader title="Approval requests" subtitle={owner ? 'Overrides requested by admins wait for your decision' : 'Overrides you requested and their status'} />
      <div className="mb-5">
        <Tabs
          tabs={[
            { value: 'pending', label: 'Pending' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: '', label: 'All' },
          ]}
          value={status}
          onChange={setStatus}
        />
      </div>
      {isLoading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data.length ? (
        <div className="card">
          <EmptyState icon="🗳️" title="No requests" />
        </div>
      ) : (
        <ul className="space-y-3">
          {data.map((r) => (
            <li key={r._id} className="card flex flex-wrap items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {describe(r)} ·{' '}
                  <Link to={`${base}/${r.entityType === 'membership' ? 'memberships' : 'plan-subscriptions'}/${r.entity}`} className="link">
                    {r.entityType}
                  </Link>
                </p>
                <p className="text-sm text-muted">{r.reason}</p>
                <p className="text-xs text-muted">
                  Requested by {r.requestedBy?.name} · {formatDateTime(r.createdAt)}
                  {r.decidedBy?.name && ` · ${r.status} by ${r.decidedBy.name}${r.decisionNote ? `: ${r.decisionNote}` : ''}`}
                </p>
              </div>
              <StatusBadge status={r.status} />
              {owner && r.status === 'pending' && (
                <div className="flex gap-2">
                  <button className="btn-outline btn-sm text-error" onClick={() => setOpen({ request: r, approve: false })}>
                    Reject
                  </button>
                  <button className="btn-primary btn-sm" disabled={String(r.requestedBy?.id) === String(user._id)} onClick={() => setOpen({ request: r, approve: true })}>
                    Approve
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.approve ? 'Approve request' : 'Reject request'}
        size="max-w-md"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(null)}>
              Back
            </button>
            <button className={open?.approve ? 'btn-primary' : 'btn-danger'} disabled={saving} onClick={submit}>
              {open?.approve ? 'Approve & apply' : 'Reject'}
            </button>
          </>
        }
      >
        {open && <p className="mb-4 text-sm text-muted">{describe(open.request)}: {open.request.reason}</p>}
        <Field label="Note (optional)">
          <textarea className="input min-h-20" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Modal>
    </div>
  )
}
