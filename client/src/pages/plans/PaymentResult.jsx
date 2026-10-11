import { CheckCircle2, Clock, RotateCcw, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useParams } from 'react-router-dom'
import { errorMessage, useMyTransactionQuery, useRetryFulfilmentMutation } from '../../app/api'
import { ErrorState, PageLoader } from '../../components/ui'
import { formatMinor, PROVIDER_LABEL, PURPOSE_LABEL } from '../../lib/billing'
import { formatDateTime } from '../../lib/format'

/**
 * Shows what the server knows about a payment. A Razorpay payment can be confirmed by the browser check or later by
 * the webhook, so while it is still "created" this page keeps asking for a couple of minutes.
 */
export default function PaymentResult() {
  const { id } = useParams()
  const [polls, setPolls] = useState(0)
  const waiting = polls < 40
  const { data: tx, isLoading, error, refetch, fulfilledTimeStamp } = useMyTransactionQuery(id, { pollingInterval: waiting ? 3000 : 0 })
  const [retry, { isLoading: retrying }] = useRetryFulfilmentMutation()

  // Count responses, not changes: an unchanged response keeps the same `tx` object, so `tx` alone would never stop polling.
  useEffect(() => {
    if (tx?.status === 'created') setPolls((n) => n + 1)
    else if (tx) setPolls(99)
  }, [tx, fulfilledTimeStamp])

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const paid = ['paid', 'refunded', 'partially_refunded'].includes(tx.status)
  const done = paid && tx.fulfilment === 'done'
  const stuck = paid && tx.fulfilment === 'failed'
  const failed = ['failed', 'expired'].includes(tx.status)
  const mine = tx.membership ? { to: '/account/membership', label: 'Go to My membership' } : { to: `/subscriptions/${tx.subscription}`, label: 'Manage my subscription' }

  const [Icon, tone, title, text] = done
    ? [CheckCircle2, 'bg-primary text-on-primary', tx.purpose === 'membership' ? 'Welcome! Your membership is active' : tx.purpose === 'subscription_prepay' ? 'Your subscription is confirmed' : 'Payment received', 'Your invoice is ready under Billing & invoices, and a confirmation is in your notifications.']
    : stuck
      ? [Clock, 'bg-secondary-soft text-warning', 'Payment received, finishing setup', "Your payment is confirmed but we couldn't finish activating. Try again below; you will not be charged twice."]
      : failed
        ? [XCircle, 'bg-error/10 text-error', 'Payment not completed', tx.failureReason || 'Nothing was charged and nothing has been activated. You can try again.']
        : [Clock, 'bg-secondary-soft text-warning', 'Waiting for payment confirmation', waiting ? 'We are confirming your payment with the bank. This page updates by itself.' : 'We have not received confirmation yet. If money left your account it will be matched automatically, or refunded.']

  return (
    <div className="container-page max-w-2xl py-10">
      <div className="text-center">
        <span className={`mx-auto flex size-20 items-center justify-center rounded-full ${tone}`}>
          <Icon className="size-10" />
        </span>
        <h1 className="mt-5 text-2xl font-bold sm:text-3xl">{title}</h1>
        <p className="mt-2 text-muted">{text}</p>
      </div>

      <dl className="card mt-8 divide-y divide-line text-sm">
        {[
          ['Payment for', PURPOSE_LABEL[tx.purpose] || tx.purpose],
          ['Amount', formatMinor(tx.amountMinor, tx.currency)],
          ['Method', PROVIDER_LABEL[tx.provider] || tx.provider],
          ['Reference', <span key="r" className="font-mono text-xs">{tx._id}</span>],
          tx.paidAt && ['Paid', formatDateTime(tx.paidAt)],
          tx.invoice && ['Invoice', <Link key="i" to={`/account/billing/invoices/${tx.invoice._id}`} className="link">{tx.invoice.number}</Link>],
        ]
          .filter(Boolean)
          .map(([k, val]) => (
            <div key={k} className="flex justify-between gap-4 p-4">
              <dt className="text-muted">{k}</dt>
              <dd className="text-right font-medium">{val}</dd>
            </div>
          ))}
      </dl>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {stuck && (
          <button
            className="btn-primary flex-1"
            disabled={retrying}
            onClick={() =>
              retry(tx._id)
                .unwrap()
                .then((r) => (r.fulfilment === 'done' ? toast.success('All set!') : toast.error('Still not finished. Our team has been alerted; please contact support.')))
                .catch((e) => toast.error(errorMessage(e)))
            }
          >
            <RotateCcw className="size-4" /> Finish activation
          </button>
        )}
        {(done || paid) && (tx.membership || tx.subscription) && (
          <Link to={mine.to} className="btn-primary flex-1">
            {mine.label}
          </Link>
        )}
        {failed && (
          <Link to="/plans" className="btn-primary flex-1">
            Try again
          </Link>
        )}
        <Link to="/account/billing" className="btn-outline flex-1">
          Billing & invoices
        </Link>
      </div>
    </div>
  )
}
