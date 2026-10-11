import { Download, FileText } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useBillingReportsQuery } from '../../../app/api'
import { ErrorState, PageHeader, PageLoader, StatCard } from '../../../components/ui'
import { formatMinor, PURPOSE_LABEL } from '../../../lib/billing'
import { addDays, dateKey, formatDate, STATUS_LABEL } from '../../../lib/format'
import { axisProps, downloadCSV, PrintStyles, shortDate, tooltipStyle } from '../_shared'

const PRESETS = [
  ['7 days', 6],
  ['30 days', 29],
  ['90 days', 89],
  ['1 year', 364],
]

function Block({ title, rows, header, file, children }) {
  return (
    <section className="card overflow-x-auto">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="font-semibold">{title}</h2>
        {rows?.length > 0 && (
          <button className="btn-ghost btn-sm no-print" onClick={() => downloadCSV(file, [header, ...rows])}>
            <Download className="size-4" /> CSV
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

const Table = ({ header, rows, empty = 'Nothing in this period.' }) =>
  rows.length ? (
    <table className="table">
      <thead>
        <tr>
          {header.map((h, i) => (
            <th key={h} className={i ? 'text-right' : ''}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className={j ? 'text-right' : ''}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <p className="p-5 text-sm text-muted">{empty}</p>
  )

/** Membership and subscription reports (Reports permission). Every figure is computed by the server from durable records. */
export default function BillingReports() {
  const [range, setRange] = useState([dateKey(addDays(new Date(), -29)), dateKey()])
  const [from, to] = range
  const { data, isLoading, isFetching, error, refetch } = useBillingReportsQuery({ from, to })
  const tag = `${from}_to_${to}`

  return (
    <div>
      <PrintStyles />
      <PageHeader
        title="Subscription reports"
        subtitle={`${formatDate(from)} to ${formatDate(to)}`}
        actions={
          <button className="btn-outline btn-sm no-print" onClick={() => window.print()} disabled={!data}>
            <FileText className="size-4" /> PDF
          </button>
        }
      />
      <div className="no-print mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map(([label, n]) => {
            const f = dateKey(addDays(new Date(), -n))
            return (
              <button key={label} className={`btn-sm btn ${f === from && to === dateKey() ? 'bg-primary text-on-primary' : 'btn-outline'}`} onClick={() => setRange([f, dateKey()])}>
                {label}
              </button>
            )
          })}
        </div>
        <label className="text-xs text-muted">
          From
          <input type="date" className="input" value={from} max={to} onChange={(e) => setRange([e.target.value, to])} />
        </label>
        <label className="text-xs text-muted">
          To
          <input type="date" className="input" value={to} min={from} onChange={(e) => setRange([from, e.target.value])} />
        </label>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <div className={`space-y-6 ${isFetching ? 'opacity-60' : ''}`}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Membership revenue (net)" value={formatMinor(data.revenue.membershipNetMinor)} sub={`Gross ${formatMinor(data.revenue.membershipGrossMinor)}`} />
            <StatCard label="Recurring product revenue (net)" value={formatMinor(data.revenue.recurringNetMinor)} sub={`Gross ${formatMinor(data.revenue.recurringGrossMinor)}`} tone="accent" />
            <StatCard label="Refunds completed" value={formatMinor(data.revenue.refundsMinor)} tone="secondary" />
            <StatCard label="Retention" value={data.retention.rate === null ? '—' : `${data.retention.rate}%`} sub={`${data.retention.renewed} renewed · ${data.retention.expired} expired`} />
            <StatCard label="Renewals" value={data.renewals.succeeded} sub={`${data.renewals.failed} failed attempts`} />
            <StatCard label="Active memberships" value={(data.memberships.active || 0) + (data.memberships.cancellation_pending || 0)} sub={`${data.memberships.expired || 0} expired in total`} />
            <StatCard label="Active product subscriptions" value={data.subscriptions.active || 0} sub={`${data.pausedSubscriptions} paused`} tone="accent" />
            <StatCard label="Delivery success" value={data.delivery.onTimeRate === null ? '—' : `${data.delivery.onTimeRate}%`} sub={`${data.delivery.missed} missed`} tone={data.delivery.missed ? 'secondary' : 'primary'} />
          </div>

          <section className="card p-4 sm:p-5">
            <h2 className="mb-4 font-semibold">New memberships and subscriptions</h2>
            {data.newMemberships.length + data.newSubscriptions.length === 0 ? (
              <p className="text-sm text-muted">None in this period.</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[...new Set([...data.newMemberships, ...data.newSubscriptions].map((x) => x.date))].sort().map((d) => ({
                      date: d,
                      memberships: data.newMemberships.find((x) => x.date === d)?.n || 0,
                      subscriptions: data.newSubscriptions.find((x) => x.date === d)?.n || 0,
                    }))}
                    margin={{ left: -16, right: 8, top: 8 }}
                  >
                    <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps} minTickGap={16} />
                    <YAxis {...axisProps} allowDecimals={false} />
                    <Tooltip {...tooltipStyle} labelFormatter={shortDate} />
                    <Bar dataKey="memberships" name="Memberships" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="subscriptions" name="Product subscriptions" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <Block
              title="Payments"
              file={`payments_${tag}.csv`}
              header={['Purpose', 'Status', 'Count', 'Amount (INR)']}
              rows={data.payments.map((p) => [PURPOSE_LABEL[p.purpose], STATUS_LABEL[p.status] || p.status, p.n, p.amountMinor / 100])}
            >
              <Table header={['Purpose', 'Status', 'Count', 'Amount']} rows={data.payments.map((p) => [PURPOSE_LABEL[p.purpose], STATUS_LABEL[p.status] || p.status, p.n, formatMinor(p.amountMinor)])} />
            </Block>
            <Block title="Refunds" file={`refunds_${tag}.csv`} header={['Status', 'Count', 'Amount (INR)']} rows={data.refunds.map((r) => [STATUS_LABEL[r.status] || r.status, r.n, r.amountMinor / 100])}>
              <Table header={['Status', 'Count', 'Amount']} rows={data.refunds.map((r) => [STATUS_LABEL[r.status] || r.status, r.n, formatMinor(r.amountMinor)])} />
            </Block>
            <Block title="Cancellations and reasons" file={`cancellations_${tag}.csv`} header={['Type', 'Reason', 'Count']} rows={data.cancellations.map((c) => [c.kind, c.reason, c.n])}>
              <Table header={['Reason', 'Type', 'Count']} rows={data.cancellations.map((c) => [c.reason, c.kind, c.n])} />
            </Block>
            <Block title="Subscription quantities delivered or scheduled" file={`quantities_${tag}.csv`} header={['Product', 'Size', 'Qty']} rows={data.quantities.map((q) => [q.product, q.variant, q.qty])}>
              <Table header={['Product', 'Size', 'Qty']} rows={data.quantities.map((q) => [q.product, q.variant, q.qty])} />
            </Block>
            <Block title="Subscription deliveries by status" file={`deliveries_${tag}.csv`} header={['Status', 'Orders']} rows={Object.entries(data.delivery.byStatus).map(([s, n]) => [STATUS_LABEL[s] || s, n])}>
              <Table header={['Status', 'Orders']} rows={Object.entries(data.delivery.byStatus).map(([s, n]) => [STATUS_LABEL[s] || s, n])} />
            </Block>
          </div>

          <section className="card p-5 text-xs text-muted">
            <h2 className="mb-2 text-sm font-semibold text-ink">How these figures are calculated</h2>
            <ul className="space-y-1">
              {Object.entries(data.definitions).map(([k, v]) => (
                <li key={k}>
                  <b className="text-ink">{k}:</b> {v}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  )
}
