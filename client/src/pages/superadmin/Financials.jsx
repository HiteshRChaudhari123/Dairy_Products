import { Bike, Download, IndianRupee, Percent, Truck, Wallet } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { errorMessage, useFinancialsQuery, useRecordPayoutMutation } from '../../app/api'
import { EmptyState, ErrorState, Field, Modal, PageHeader, PageLoader, StatCard, Tabs } from '../../components/ui'
import { formatINR } from '../../lib/format'
import { downloadCSV } from '../admin/_shared'

const monthLabel = (m) => new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })

function PayoutModal({ partner, onClose }) {
  const [amount, setAmount] = useState(partner.pending)
  const [record, { isLoading }] = useRecordPayoutMutation()
  const submit = async (e) => {
    e.preventDefault()
    try {
      await record({ id: partner._id, amount: Number(amount) }).unwrap()
      toast.success(`Payout of ${formatINR(amount)} recorded`)
      onClose()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Record payout · ${partner.name}`}
      size="max-w-md"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" form="payout-form" disabled={isLoading || !(amount > 0) || amount > partner.pending}>Record payout</button>
        </>
      }
    >
      <form id="payout-form" onSubmit={submit} className="space-y-3">
        <p className="text-sm text-muted">
          Transfer the money to <b className="text-ink">{partner.bank}</b> first (bank/UPI), then record it here.
        </p>
        <Field label="Amount (₹)" hint={`Pending: ${formatINR(partner.pending)}`} error={amount > partner.pending ? 'More than the pending amount' : undefined}>
          <input className="input" type="number" min={1} max={partner.pending} value={amount} onChange={(e) => setAmount(Number(e.target.value))} autoFocus />
        </Field>
      </form>
    </Modal>
  )
}

export default function Financials() {
  const [months, setMonths] = useState(6)
  const { data, isLoading, error, refetch } = useFinancialsQuery(months)
  const [paying, setPaying] = useState(null)

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const m = data.monthly
  const sum = (k) => m.reduce((s, r) => s + (r[k] || 0), 0)
  const chart = m.map((r) => ({ ...r, label: monthLabel(r.month), net: r.revenue - r.deliveryCost - r.tax }))

  const exportGst = () =>
    downloadCSV(`gavyora-gst-${months}m.csv`, [
      ['Month', 'Orders', 'Taxable value (INR)', 'GST (INR)', 'Invoice value (INR)'],
      ...m.map((r) => [r.month, r.orders, r.revenue - r.tax, r.tax, r.revenue]),
    ])

  return (
    <div>
      <PageHeader
        title="Financials & payouts"
        subtitle="Delivered orders only. Cancelled and returned orders are excluded."
        actions={
          <Tabs
            tabs={[3, 6, 12].map((n) => ({ value: n, label: `${n} months` }))}
            value={months}
            onChange={setMonths}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={IndianRupee} label="Revenue" value={formatINR(sum('revenue'))} sub={`${sum('orders')} orders`} />
        <StatCard icon={Percent} label="GST collected" value={formatINR(sum('tax'))} tone="accent" />
        <StatCard icon={Truck} label="Delivery fees earned" value={formatINR(sum('deliveryFees'))} tone="secondary" />
        <StatCard icon={Bike} label="Est. delivery cost" value={formatINR(sum('deliveryCost'))} sub="Partner payouts" tone="error" />
        <StatCard icon={Wallet} label="Wallet liability" value={formatINR(data.walletLiability)} sub="Customer wallet balances" tone="accent" />
      </div>

      <div className="card mt-6 p-4">
        <h2 className="mb-4 font-semibold">Revenue vs costs</h2>
        {chart.length === 0 ? (
          <EmptyState icon="📊" title="No delivered orders in this period" />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chart} margin={{ left: 0, right: 8 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: 'var(--color-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--color-muted)', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                <Tooltip formatter={(v) => formatINR(v)} contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-line)', borderRadius: 12 }} />
                <Legend />
                <Bar dataKey="revenue" name="Revenue" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="deliveryCost" name="Delivery cost" fill="var(--color-chart-1)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="discounts" name="Discounts" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} />
                <Line dataKey="net" name="Net after costs & GST" stroke="var(--color-chart-2)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between gap-2 p-4 pb-2">
            <h2 className="font-semibold">Monthly summary</h2>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="text-right">Orders</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">Discounts</th>
                <th className="text-right">Delivery cost</th>
              </tr>
            </thead>
            <tbody>
              {m.map((r) => (
                <tr key={r.month}>
                  <td className="whitespace-nowrap">{monthLabel(r.month)}</td>
                  <td className="text-right">{r.orders}</td>
                  <td className="text-right font-medium">{formatINR(r.revenue)}</td>
                  <td className="text-right">{formatINR(r.discounts)}</td>
                  <td className="text-right">{formatINR(r.deliveryCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card overflow-x-auto">
          <div className="flex items-center justify-between gap-2 p-4 pb-2">
            <h2 className="font-semibold">GST report</h2>
            <button className="btn-outline btn-sm" onClick={exportGst} disabled={!m.length}>
              <Download className="size-4" /> Export CSV
            </button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="text-right">Taxable value</th>
                <th className="text-right">GST</th>
              </tr>
            </thead>
            <tbody>
              {m.map((r) => (
                <tr key={r.month}>
                  <td className="whitespace-nowrap">{monthLabel(r.month)}</td>
                  <td className="text-right">{formatINR(r.revenue - r.tax)}</td>
                  <td className="text-right font-medium">{formatINR(r.tax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 pb-4 text-xs text-muted">Share this with your CA for GSTR-1 / GSTR-3B filing.</p>
        </div>
      </div>

      <div className="card mt-6 overflow-x-auto">
        <h2 className="p-4 pb-2 font-semibold">Delivery partner payouts</h2>
        {data.payouts.length === 0 ? (
          <EmptyState icon="🛵" title="No delivery partners yet" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Partner</th>
                <th>Bank</th>
                <th className="text-right">Earned</th>
                <th className="text-right">Paid out</th>
                <th className="text-right">Pending</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.payouts.map((p) => (
                <tr key={p._id}>
                  <td>
                    <p className="font-medium whitespace-nowrap">{p.name}</p>
                    <p className="text-xs text-muted">{p.phone}</p>
                  </td>
                  <td className="whitespace-nowrap">{p.bank}</td>
                  <td className="text-right">{formatINR(p.earned)}</td>
                  <td className="text-right">{formatINR(p.paidOut)}</td>
                  <td className={`text-right font-semibold ${p.pending > 0 ? 'text-warning' : ''}`}>{formatINR(p.pending)}</td>
                  <td className="text-right">
                    <button className="btn-outline btn-sm" disabled={p.pending <= 0} onClick={() => setPaying(p)}>
                      Record payout
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {paying && <PayoutModal partner={paying} onClose={() => setPaying(null)} />}
    </div>
  )
}
