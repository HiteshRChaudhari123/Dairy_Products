// Pieces shared by the admin membership / subscription / payment pages.
import { useState } from 'react'
import { Field, Modal, StatusBadge } from '../../../components/ui'
import { formatMinor, PROVIDER_LABEL, PURPOSE_LABEL } from '../../../lib/billing'
import { formatDateTime } from '../../../lib/format'

/** Confirm a sensitive action; a reason (3+ characters) is always required and stored in the audit trail. */
export function ReasonModal({ open, title, text, confirmLabel = 'Confirm', danger, busy, extra, onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="max-w-md"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Back
          </button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} disabled={busy || reason.trim().length < 3} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {text && <p className="mb-4 text-sm text-muted">{text}</p>}
      {extra}
      <Field label="Reason (required, saved in the audit log)">
        <textarea className="input min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  )
}

export function EventTimeline({ events }) {
  if (!events?.length) return <p className="text-sm text-muted">No events yet.</p>
  return (
    <ol className="space-y-3 border-l-2 border-line pl-4 text-sm">
      {events.map((e) => (
        <li key={e._id} className="relative">
          <span className="absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full bg-primary" />
          <p className="font-medium">
            {e.type.replaceAll('_', ' ')}
            {e.from && e.to && e.from !== e.to && (
              <span className="font-normal text-muted">
                {' '}
                · {e.from.replaceAll('_', ' ')} → {e.to.replaceAll('_', ' ')}
              </span>
            )}
          </p>
          {e.note && <p className="text-muted">{e.note}</p>}
          <p className="text-xs text-muted">
            {formatDateTime(e.createdAt)} · {e.actor?.name || 'system'}
            {e.actor?.role ? ` (${e.actor.role})` : ''}
          </p>
        </li>
      ))}
    </ol>
  )
}

export function TransactionsTable({ items, onRefund, invoiceLink }) {
  if (!items?.length) return <p className="p-5 text-sm text-muted">No payments.</p>
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Purpose</th>
          <th>Method</th>
          <th className="text-right">Amount</th>
          <th>Status</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {items.map((t) => (
          <tr key={t._id}>
            <td className="text-xs whitespace-nowrap">{formatDateTime(t.paidAt || t.createdAt)}</td>
            <td>{PURPOSE_LABEL[t.purpose]}</td>
            <td className="text-xs">{PROVIDER_LABEL[t.provider]}</td>
            <td className="text-right font-semibold whitespace-nowrap">
              {formatMinor(t.amountMinor)}
              {t.refundedMinor > 0 && <span className="block text-xs font-normal text-muted">−{formatMinor(t.refundedMinor)} refunded</span>}
            </td>
            <td>
              <StatusBadge status={t.status} />
              {t.fulfilment === 'failed' && <span className="chip mt-1 block w-fit bg-error/10 text-error">Activation failed</span>}
            </td>
            <td className="text-right whitespace-nowrap">
              {invoiceLink?.(t)}
              {onRefund && ['paid', 'partially_refunded'].includes(t.status) && t.amountMinor > t.refundedMinor && (
                <button className="btn-ghost btn-sm" onClick={() => onRefund(t)}>
                  Refund
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function RefundModal({ tx, busy, onClose, onSubmit }) {
  const left = tx.amountMinor - (tx.refundedMinor || 0)
  const [amount, setAmount] = useState(String(left / 100))
  const [destination, setDestination] = useState('wallet')
  const [reason, setReason] = useState('')
  const minor = Math.round(Number(amount) * 100)
  const valid = minor > 0 && minor <= left && reason.trim().length >= 3
  return (
    <Modal
      open
      onClose={onClose}
      title="Issue a refund"
      size="max-w-md"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!valid || busy} onClick={() => onSubmit({ transaction: tx._id, amountMinor: minor, destination, reason: reason.trim() })}>
            Refund {minor > 0 ? formatMinor(minor) : ''}
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">
        {PURPOSE_LABEL[tx.purpose]} of {formatMinor(tx.amountMinor)}. Up to {formatMinor(left)} can be refunded. Refunds above your approval limit wait for a super admin.
      </p>
      <div className="space-y-4">
        <Field label="Amount (₹)" error={minor > left ? 'More than is left to refund' : undefined}>
          <input type="number" min="0.01" step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Refund to">
          <select className="input" value={destination} onChange={(e) => setDestination(e.target.value)}>
            <option value="wallet">Customer's Gavyora wallet (instant)</option>
            {tx.provider === 'razorpay' && <option value="source">Original payment method (via Razorpay)</option>}
          </select>
        </Field>
        <Field label="Reason (shown to the customer)">
          <textarea className="input min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

export const csvDate = (d) => (d ? new Date(d).toLocaleString('en-IN') : '')
