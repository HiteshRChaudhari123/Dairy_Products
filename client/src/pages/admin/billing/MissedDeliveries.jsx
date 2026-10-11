import { useState } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { errorMessage, useMissedDeliveriesQuery, useResolveMissedMutation } from '../../../app/api'
import { usePanelBase } from '../../../components/guards'
import { EmptyState, ErrorState, Field, PageHeader, PageLoader } from '../../../components/ui'
import { addDays, dateKey, formatDate, formatDateTime, formatINR, PAYMENT_LABEL, telHref } from '../../../lib/format'
import { ReasonModal } from './_billing'

/** Orders a partner could not deliver: redeliver on a new date, or cancel and refund (prepaid balance or wallet). */
export default function MissedDeliveries() {
  const base = usePanelBase()
  const { data = [], isLoading, error, refetch } = useMissedDeliveriesQuery()
  const [resolve, { isLoading: saving }] = useResolveMissedMutation()
  const [modal, setModal] = useState(null) // { order, action }
  const [date, setDate] = useState(dateKey(addDays(new Date(), 1)))

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const run = async (note) => {
    try {
      await resolve({ id: modal.order._id, action: modal.action, note, ...(modal.action === 'redeliver' ? { date } : {}) }).unwrap()
      toast.success(modal.action === 'redeliver' ? `Redelivery booked for ${formatDate(date)}` : 'Cancelled and refunded')
      setModal(null)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div>
      <PageHeader title="Missed deliveries" subtitle="Orders marked undelivered by a partner. A delivered order reported missing is credited from its order page." />
      {!data.length ? (
        <div className="card">
          <EmptyState icon="✅" title="No missed deliveries" text="Nothing is waiting to be resolved." />
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {data.map((o) => (
            <li key={o._id} className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link to={`${base}/orders/${o._id}`} className="font-semibold hover:text-accent">
                    {o.orderNo}
                  </Link>
                  <p className="text-xs text-muted">
                    Due {formatDate(o.slot?.date)} · {o.slot?.label} · {o.source === 'subscription' ? 'subscription' : 'store order'}
                  </p>
                </div>
                <b>{formatINR(o.total)}</b>
              </div>
              <p className="mt-2 rounded-lg bg-error/10 p-2 text-sm text-error">{o.failureReason || 'No reason recorded'}</p>
              <p className="mt-2 text-sm">
                {o.user?.name}{' '}
                {o.address?.phone && (
                  <a href={telHref(o.address.phone)} className="link">
                    {o.address.phone}
                  </a>
                )}
                <span className="block text-xs text-muted">
                  {o.address?.line1}, {o.address?.pincode} · partner {o.deliveryPartner?.name || '—'} · {PAYMENT_LABEL[o.payment?.method]} ({o.payment?.status})
                </span>
              </p>
              <p className="mt-1 text-xs text-muted">Updated {formatDateTime(o.updatedAt)}</p>
              <div className="mt-3 flex gap-2">
                <button className="btn-primary btn-sm" onClick={() => setModal({ order: o, action: 'redeliver' })}>
                  Redeliver
                </button>
                <button className="btn-outline btn-sm text-error" onClick={() => setModal({ order: o, action: 'refund' })}>
                  Cancel & refund
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {modal && (
        <ReasonModal
          open
          title={modal.action === 'redeliver' ? `Redeliver ${modal.order.orderNo}` : `Refund ${modal.order.orderNo}`}
          text={
            modal.action === 'redeliver'
              ? 'The order goes back to confirmed with the new date and appears on that day’s delivery list.'
              : modal.order.payment?.status === 'paid'
                ? `${formatINR(modal.order.total)} goes back to the ${modal.order.payment.method === 'prepaid' ? 'subscription balance' : 'customer’s wallet'}.`
                : 'Nothing was paid, so the order is just cancelled.'
          }
          danger={modal.action === 'refund'}
          busy={saving}
          confirmLabel={modal.action === 'redeliver' ? 'Book redelivery' : 'Cancel & refund'}
          extra={
            modal.action === 'redeliver' && (
              <Field label="New delivery date" className="mb-4">
                <input type="date" className="input" min={dateKey()} value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
            )
          }
          onClose={() => setModal(null)}
          onConfirm={run}
        />
      )}
    </div>
  )
}
