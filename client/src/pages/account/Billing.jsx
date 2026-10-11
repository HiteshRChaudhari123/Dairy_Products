import { FileText, ReceiptIndianRupee, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMyRefundsQuery, useMyTransactionsQuery } from '../../app/api'
import { EmptyState, ErrorState, Pagination, Skeleton, StatusBadge, Tabs } from '../../components/ui'
import { formatMinor, PROVIDER_LABEL, PURPOSE_LABEL } from '../../lib/billing'
import { formatDateTime } from '../../lib/format'

function Payments() {
  const [page, setPage] = useState(1)
  const { data, isLoading, error, refetch } = useMyTransactionsQuery(page)
  if (isLoading) return <Skeleton className="h-48" />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (!data.items.length) return <EmptyState icon="🧾" title="No payments yet" text="Membership and subscription payments appear here. Store orders are under My orders." />
  return (
    <>
      <ul className="card divide-y divide-line">
        {data.items.map((t) => (
          <li key={t._id} className="flex flex-wrap items-center gap-3 p-4">
            <ReceiptIndianRupee className="size-5 shrink-0 text-brand" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{PURPOSE_LABEL[t.purpose] || t.purpose}</p>
              <p className="text-xs text-muted">
                {formatDateTime(t.paidAt || t.createdAt)} · {PROVIDER_LABEL[t.provider]}
                {t.failureReason ? ` · ${t.failureReason}` : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{formatMinor(t.amountMinor, t.currency)}</p>
              {t.refundedMinor > 0 && <p className="text-xs text-muted">{formatMinor(t.refundedMinor)} refunded</p>}
            </div>
            <StatusBadge status={t.status} />
            <div className="flex gap-2">
              {t.invoice && (
                <Link to={`/account/billing/invoices/${t.invoice._id}`} className="btn-outline btn-sm">
                  <FileText className="size-4" /> {t.invoice.number}
                </Link>
              )}
              <Link to={`/plans/payment/${t._id}`} className="btn-ghost btn-sm">
                Details
              </Link>
            </div>
          </li>
        ))}
      </ul>
      <Pagination page={data.page} pages={data.pages} onChange={setPage} />
    </>
  )
}

function Refunds() {
  const { data = [], isLoading, error, refetch } = useMyRefundsQuery()
  if (isLoading) return <Skeleton className="h-32" />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (!data.length) return <EmptyState icon="↩️" title="No refunds" />
  return (
    <ul className="card divide-y divide-line">
      {data.map((r) => (
        <li key={r._id} className="flex flex-wrap items-center gap-3 p-4">
          <Undo2 className="size-5 shrink-0 text-brand" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{r.reason}</p>
            <p className="text-xs text-muted">
              {formatDateTime(r.createdAt)} · to your {r.destination === 'source' ? 'original payment method' : 'Gavyora wallet'}
              {r.failureReason ? ` · ${r.failureReason}` : ''}
            </p>
          </div>
          <p className="font-semibold">{formatMinor(r.amountMinor, r.currency)}</p>
          <StatusBadge status={r.status} />
        </li>
      ))}
    </ul>
  )
}

export default function Billing() {
  const [tab, setTab] = useState('payments')
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Billing & invoices</h1>
        <p className="text-sm text-muted">Payments for memberships and subscriptions, with their invoices and refunds.</p>
      </div>
      <Tabs
        tabs={[
          { value: 'payments', label: 'Payments' },
          { value: 'refunds', label: 'Refunds' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'payments' ? <Payments /> : <Refunds />}
    </div>
  )
}
