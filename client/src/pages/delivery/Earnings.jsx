import { Clock, IndianRupee, Landmark, Wallet } from 'lucide-react'
import { useSelector } from 'react-redux'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDeliveryEarningsQuery } from '../../app/api'
import { EmptyState, ErrorState, PageHeader, PageLoader, StatCard } from '../../components/ui'
import { selectUser } from '../../features/auth/authSlice'
import { addDays, dateKey, formatDate, formatINR } from '../../lib/format'

// Monday of the week containing `dateStr`.
const weekOf = (dateStr) => {
  const d = new Date(dateStr + 'T00:00:00')
  return dateKey(addDays(d, -((d.getDay() + 6) % 7)))
}

export default function Earnings() {
  const user = useSelector(selectUser)
  const { data, isLoading, error, refetch } = useDeliveryEarningsQuery()
  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  // Continuous last-30-days series, oldest → newest.
  const byDate = Object.fromEntries(data.daily.map((d) => [d.date, d]))
  const series = Array.from({ length: 30 }, (_, i) => {
    const key = dateKey(addDays(new Date(), i - 29))
    return { date: key, label: new Date(key + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), earned: byDate[key]?.earned || 0 }
  })
  const weeks = Object.values(
    data.daily.reduce((w, d) => {
      const k = weekOf(d.date)
      w[k] ||= { week: k, deliveries: 0, earned: 0, cod: 0 }
      w[k].deliveries += d.deliveries
      w[k].earned += d.earned
      w[k].cod += d.cod
      return w
    }, {}),
  ).sort((a, b) => b.week.localeCompare(a.week))

  return (
    <div className="space-y-6">
      <PageHeader title="Earnings" subtitle={`${formatINR(data.perOrder)} per delivered order`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={IndianRupee} label="Total earned" value={formatINR(data.total)} />
        <StatCard icon={Landmark} label="Paid out" value={formatINR(data.paidOut)} tone="accent" />
        <StatCard icon={Clock} label="Pending payout" value={formatINR(data.pending)} tone="secondary" />
        <StatCard icon={Wallet} label="Per order" value={formatINR(data.perOrder)} />
      </div>

      <div className="card p-4">
        <h2 className="mb-4 font-semibold">Last 30 days</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ left: -10, right: 4 }}>
              <CartesianGrid stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} interval={4} />
              <YAxis tick={{ fill: 'var(--color-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v}`} />
              <Tooltip formatter={(v) => [formatINR(v), 'Earned']} contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-line)', borderRadius: 12 }} />
              <Bar dataKey="earned" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl bg-accent-soft p-4 text-sm">
        <p className="font-semibold">How payouts work</p>
        <p className="mt-1 text-muted">
          Earnings are paid every week to your bank account on file
          {user?.delivery?.bankAccountLast4 ? ` (••${user.delivery.bankAccountLast4}, ${user.delivery.ifsc})` : ''}. Cash collected on COD orders must be deposited at the
          warehouse at the end of each shift.
        </p>
      </div>

      {data.daily.length === 0 ? (
        <div className="card">
          <EmptyState icon="💰" title="No deliveries in the last 30 days" text="Complete deliveries to start earning." />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="card overflow-x-auto">
            <h2 className="p-4 pb-2 font-semibold">Weekly totals</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Week of</th>
                  <th className="text-right">Deliveries</th>
                  <th className="text-right">Earned</th>
                  <th className="text-right">COD</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.week}>
                    <td className="whitespace-nowrap">{formatDate(w.week)}</td>
                    <td className="text-right">{w.deliveries}</td>
                    <td className="text-right font-semibold">{formatINR(w.earned)}</td>
                    <td className="text-right">{formatINR(w.cod)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card overflow-x-auto">
            <h2 className="p-4 pb-2 font-semibold">Daily breakdown</h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="text-right">Deliveries</th>
                  <th className="text-right">Earned</th>
                  <th className="text-right">COD collected</th>
                </tr>
              </thead>
              <tbody>
                {data.daily.map((d) => (
                  <tr key={d.date}>
                    <td className="whitespace-nowrap">{formatDate(d.date)}</td>
                    <td className="text-right">{d.deliveries}</td>
                    <td className="text-right font-semibold">{formatINR(d.earned)}</td>
                    <td className="text-right">{formatINR(d.cod)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
