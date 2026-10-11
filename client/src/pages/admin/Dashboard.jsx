import {
  AlertTriangle,
  Bike,
  CalendarClock,
  IndianRupee,
  LifeBuoy,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useStatsQuery } from '../../app/api'
import { usePanelBase } from '../../components/guards'
import { ErrorState, PageLoader, StatCard, StatusBadge, Tabs } from '../../components/ui'
import { PHOTOS, responsiveImage } from '../../lib/images'
import { formatDate, formatINR, STATUS_LABEL } from '../../lib/format'
import { axisProps, CHART_COLORS, minStock, shortDate, tooltipStyle } from './_shared'

export default function Dashboard() {
  const [days, setDays] = useState(14)
  const base = usePanelBase()
  const { data, isLoading, error, refetch } = useStatsQuery(days)

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const kpis = [
    { icon: IndianRupee, label: "Today's revenue", value: formatINR(data.today.revenue), sub: `${data.today.orders} orders today`, to: 'orders' },
    { icon: TrendingUp, label: `Revenue (${days} days)`, value: formatINR(data.periodRevenue), sub: `${data.periodOrders} orders`, tone: 'accent', to: 'reports' },
    { icon: RefreshCw, label: 'Active subscriptions', value: data.activeSubscriptions, tone: 'secondary', to: 'subscriptions' },
    { icon: Users, label: 'Customers', value: data.customers, tone: 'accent', to: 'customers' },
    { icon: Truck, label: 'Unassigned orders', value: data.unassigned, tone: data.unassigned ? 'error' : 'primary', to: 'orders?unassigned=1' },
    { icon: Bike, label: 'Pending KYC', value: data.pendingKyc, tone: data.pendingKyc ? 'secondary' : 'primary', to: 'delivery-partners?kyc=pending' },
    { icon: LifeBuoy, label: 'Open tickets', value: data.openTickets, tone: data.openTickets ? 'secondary' : 'primary', to: 'tickets' },
    { icon: ShoppingBag, label: 'Avg. order value', value: formatINR(data.periodOrders ? data.periodRevenue / data.periodOrders : 0), to: 'reports' },
  ]
  const categoryTotal = data.byCategory.reduce((s, c) => s + c.revenue, 0)

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-primary-dark text-white">
        <img {...responsiveImage(PHOTOS.field, '(min-width: 1024px) calc(100vw - 256px), 100vw')} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-night via-night/85 to-night/30" />
        <div className="relative flex flex-wrap items-end justify-between gap-4 p-5 sm:p-7">
          <div>
            <p className="text-sm text-white/80">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Good {new Date().getHours() < 12 ? 'morning' : 'day'}! 🌾</h1>
            <p className="mt-1 text-sm text-white/85">Here's how Gavyora is doing.</p>
          </div>
          <div className="rounded-full bg-surface/95 p-1 text-ink">
            <Tabs
              tabs={[7, 14, 30].map((d) => ({ value: d, label: `${d} days` }))}
              value={days}
              onChange={setDays}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} to={`${base}/${k.to}`} className="transition hover:-translate-y-0.5">
            <StatCard {...k} />
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="card p-4 sm:p-5 xl:col-span-2">
          <h2 className="mb-4 font-semibold">Revenue</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series} margin={{ left: 0, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps} minTickGap={16} />
                <YAxis {...axisProps} width={56} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                <Tooltip {...tooltipStyle} labelFormatter={shortDate} formatter={(v) => [formatINR(v), 'Revenue']} />
                <Area type="monotone" dataKey="revenue" stroke="var(--color-chart-1)" strokeWidth={2.5} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4 sm:p-5">
          <h2 className="mb-4 font-semibold">Revenue by category</h2>
          {data.byCategory.length ? (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.byCategory} dataKey="revenue" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {data.byCategory.map((c, i) => (
                        <Cell key={c.name} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="var(--color-surface)" />
                      ))}
                    </Pie>
                    <Tooltip {...tooltipStyle} formatter={(v) => formatINR(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {data.byCategory.slice(0, 6).map((c, i) => (
                  <li key={c.name} className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-muted">{Math.round((c.revenue / categoryTotal) * 100)}%</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted">No sales in this period.</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="card p-4 sm:p-5">
          <h2 className="mb-4 font-semibold">Orders per day</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.series} margin={{ left: -16, right: 8, top: 8 }}>
                <CartesianGrid stroke="var(--color-line)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} {...axisProps} minTickGap={16} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip {...tooltipStyle} labelFormatter={shortDate} cursor={{ fill: 'var(--color-surface-2)' }} />
                <Bar dataKey="orders" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} name="Orders" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(data.byStatus).map(([s, n]) => (
              <Link key={s} to={`${base}/orders?status=${s}`}>
                <StatusBadge status={s} label={`${STATUS_LABEL[s] || s}: ${n}`} />
              </Link>
            ))}
          </div>
        </div>

        <div className="card overflow-x-auto p-4 sm:p-5 xl:col-span-2">
          <h2 className="mb-3 font-semibold">Top products</h2>
          {data.topProducts.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th className="text-right">Units</th>
                  <th className="text-right">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.topProducts.map((p, i) => (
                  <tr key={p.name}>
                    <td className="text-muted">{i + 1}</td>
                    <td className="font-medium">{p.name}</td>
                    <td className="text-right">{p.qty}</td>
                    <td className="text-right font-semibold">{formatINR(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-muted">No sales in this period.</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="size-5 text-warning" /> Low stock
            </h2>
            <Link to={`${base}/inventory`} className="link text-sm">Inventory</Link>
          </div>
          {data.lowStock.length ? (
            <ul className="divide-y divide-line">
              {data.lowStock.map((p) => (
                <li key={p._id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="truncate">{p.name}</span>
                  <span className={`chip ${minStock(p) === 0 ? 'bg-error/10 text-error ' : 'bg-secondary-soft text-warning'}`}>
                    {minStock(p) === 0 ? 'Out of stock' : `${minStock(p)} left`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">All products are well stocked. 🎉</p>
          )}
        </div>
        <div className="card p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-semibold">
              <CalendarClock className="size-5 text-error" /> Expiring within 3 days
            </h2>
            <Link to={`${base}/inventory`} className="link text-sm">Inventory</Link>
          </div>
          {data.expiring.length ? (
            <ul className="divide-y divide-line">
              {data.expiring.flatMap((p) =>
                p.batches.map((b) => (
                  <li key={b._id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="truncate">
                      {p.name} <span className="text-muted">· {b.batchNo}</span>
                    </span>
                    <span className={`chip ${new Date(b.expiryDate) < new Date() ? 'bg-error/10 text-error ' : 'bg-secondary-soft text-warning'}`}>
                      {new Date(b.expiryDate) < new Date() ? 'Expired' : formatDate(b.expiryDate, { day: 'numeric', month: 'short' })}
                    </span>
                  </li>
                )),
              )}
            </ul>
          ) : (
            <p className="text-sm text-muted">No batches expiring soon.</p>
          )}
        </div>
      </div>
    </div>
  )
}
