import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Crown, IndianRupee, PauseCircle, RefreshCw, Undo2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useBillingOverviewQuery } from '../../../app/api'
import { usePanelBase } from '../../../components/guards'
import { ErrorState, PageHeader, PageLoader, StatCard, Tabs } from '../../../components/ui'
import { formatMinor } from '../../../lib/billing'
import { STATUS_LABEL } from '../../../lib/format'
import { axisProps, shortDate, tooltipStyle } from '../_shared'

const sum = (o = {}) => Object.values(o).reduce((s, n) => s + n, 0)

function StatusList({ title, counts, to }) {
  const entries = Object.entries(counts || {}).sort((a, b) => b[1] - a[1])
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <Link to={to} className="link text-sm">
          View all
        </Link>
      </div>
      {entries.length ? (
        <ul className="space-y-2 text-sm">
          {entries.map(([s, n]) => (
            <li key={s} className="flex items-center justify-between">
              <Link to={`${to}?status=${s}`} className="hover:text-accent">
                {STATUS_LABEL[s] || s}
              </Link>
              <b>{n}</b>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">None yet.</p>
      )}
    </div>
  )
}

/** Membership & subscription dashboard. Every number comes from the database; money only for permitted roles. */
export default function Overview() {
  const base = usePanelBase()
  const [days, setDays] = useState(30)
  const { data, isLoading, error, refetch } = useBillingOverviewQuery({ days })
  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const m = data.memberships
  const s = data.subscriptions
  const r = data.revenue
  const cards = [
    { icon: RefreshCw, label: 'Total subscriptions', value: sum(m) + sum(s), sub: `${sum(m)} memberships · ${sum(s)} product`, to: 'plan-subscriptions' },
    { icon: CheckCircle2, label: 'Active', value: (m.active || 0) + (m.cancellation_pending || 0) + (s.active || 0), sub: `${(m.active || 0) + (m.cancellation_pending || 0)} memberships · ${s.active || 0} product`, tone: 'accent', to: 'memberships?status=active' },
    { icon: Clock, label: 'Pending payments', value: data.pendingPayments.count, sub: formatMinor(data.pendingPayments.amountMinor) + ' not collected', tone: 'secondary', to: 'payments?status=created' },
    { icon: CalendarClock, label: 'Awaiting renewal (7 days)', value: data.awaitingRenewal, sub: 'Manual renewal members', tone: 'secondary', to: 'memberships?status=active' },
    { icon: PauseCircle, label: 'Paused', value: s.paused || 0, sub: 'Product subscriptions', to: 'plan-subscriptions?status=paused' },
    { icon: AlertTriangle, label: 'Past due', value: (m.past_due || 0) + (s.past_due || 0), tone: (m.past_due || 0) + (s.past_due || 0) ? 'error' : 'primary', to: 'memberships?status=past_due' },
    { icon: XCircle, label: 'Expired · cancelled', value: `${m.expired || 0} · ${(m.cancelled || 0) + (s.cancelled || 0)}`, to: 'memberships?status=expired,cancelled' },
    { icon: Undo2, label: 'Refunds awaiting decision', value: data.pendingRefunds, tone: data.pendingRefunds ? 'secondary' : 'primary', to: 'payments?tab=refunds' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Memberships & subscriptions"
        subtitle="Live figures for memberships and recurring product subscriptions"
        actions={<Tabs tabs={[7, 30, 90, 365].map((d) => ({ value: d, label: d === 365 ? '1 year' : `${d} days` }))} value={days} onChange={setDays} />}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} to={`${base}/${c.to}`} className="transition hover:-translate-y-0.5">
            <StatCard {...c} />
          </Link>
        ))}
      </div>

      {r && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Crown} label="Membership revenue" value={formatMinor(r.membershipNetMinor)} sub={`Gross ${formatMinor(r.membershipGrossMinor)}`} />
          <StatCard icon={IndianRupee} label="Recurring product revenue" value={formatMinor(r.recurringNetMinor)} sub={`Gross ${formatMinor(r.recurringGrossMinor)}`} tone="accent" />
          <StatCard icon={Undo2} label="Refunds completed" value={formatMinor(r.refundsMinor)} tone="secondary" />
          <StatCard icon={CheckCircle2} label="Payments" value={`${data.payments.succeeded} ok · ${data.payments.failed} failed`} sub={`${data.renewalFailures} renewal failures`} tone={data.payments.failed ? 'error' : 'primary'} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        {r ? (
          <div className="card p-4 sm:p-5 xl:col-span-2">
            <h2 className="mb-4 font-semibold">Collected revenue by day</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.series.map((d) => ({ ...d, membership: d.membershipMinor / 100, recurring: d.recurringMinor / 100 }))} margin={{ left: 0, right: 8, top: 8 }}>
                  <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps} minTickGap={16} />
                  <YAxis {...axisProps} width={56} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                  <Tooltip {...tooltipStyle} labelFormatter={shortDate} formatter={(v, n) => [formatMinor(Math.round(v * 100)), n]} />
                  <Legend />
                  <Bar dataKey="membership" name="Membership" stackId="a" fill="var(--color-chart-1)" />
                  <Bar dataKey="recurring" name="Recurring products" stackId="a" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs text-muted">{data.definitions.revenue}</p>
          </div>
        ) : (
          <div className="card p-5 text-sm text-muted xl:col-span-2">Revenue figures need the Reports permission.</div>
        )}
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Renewal & retention</h2>
          <p className="font-heading text-4xl font-semibold">{data.retention.rate === null ? '—' : `${data.retention.rate}%`}</p>
          <p className="text-sm text-muted">membership retention in this period</p>
          <dl className="mt-4 space-y-2 text-sm">
            {[
              ['Renewed', data.retention.renewed],
              ['Expired', data.retention.expired],
              ['Ended after cancelling', data.retention.endedByCancellation],
            ].map(([k, n]) => (
              <div key={k} className="flex justify-between">
                <dt className="text-muted">{k}</dt>
                <dd className="font-semibold">{n}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted">{data.definitions.retention}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <StatusList title="Memberships by status" counts={m} to={`${base}/memberships`} />
        <StatusList title="Product subscriptions by status" counts={s} to={`${base}/plan-subscriptions`} />
      </div>
    </div>
  )
}
