import { Download, FileText } from 'lucide-react'
import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { useSalesReportQuery } from '../../app/api'
import { EmptyState, ErrorState, PageHeader, PageLoader, StatCard } from '../../components/ui'
import { addDays, dateKey, formatDate, formatINR, PAYMENT_LABEL } from '../../lib/format'
import { CHART_COLORS, downloadCSV, PrintStyles, tooltipStyle } from './_shared'

const PRESETS = [
  ['Today', () => [dateKey(), dateKey()]],
  ['7 days', () => [dateKey(addDays(new Date(), -6)), dateKey()]],
  ['30 days', () => [dateKey(addDays(new Date(), -29)), dateKey()]],
  ['This month', () => [dateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), dateKey()]],
]

function Section({ title, onExport, children }) {
  return (
    <div className="card overflow-x-auto">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="font-semibold">{title}</h2>
        {onExport && (
          <button className="btn-ghost btn-sm no-print" onClick={onExport}>
            <Download className="size-4" /> Excel (CSV)
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

export default function Reports() {
  const [[from, to], setRange] = useState(PRESETS[2][1]())
  const { data, isLoading, isFetching, error, refetch } = useSalesReportQuery({ from, to })
  const tag = `${from}_to_${to}`

  return (
    <div>
      <PrintStyles />
      <PageHeader
        title="Reports"
        subtitle={`Sales from ${formatDate(from)} to ${formatDate(to)} (excluding cancelled and returned orders)`}
        actions={
          <button className="btn-outline btn-sm no-print" onClick={() => window.print()} disabled={!data}>
            <FileText className="size-4" /> PDF
          </button>
        }
      />
      <div className="no-print mb-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1">
          {PRESETS.map(([label, fn]) => {
            const [f, t] = fn()
            return (
              <button key={label} className={`btn-sm btn ${f === from && t === to ? 'bg-primary text-on-primary' : 'btn-outline'}`} onClick={() => setRange([f, t])}>
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
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Orders" value={data.summary.orders} />
            <StatCard label="Gross sales" value={formatINR(data.summary.gross)} />
            <StatCard label="Discounts" value={formatINR(data.summary.discount)} tone="secondary" />
            <StatCard label="Delivery fees" value={formatINR(data.summary.deliveryFees)} tone="accent" />
            <StatCard label="Tax" value={formatINR(data.summary.tax)} tone="accent" />
            <StatCard label="Net revenue" value={formatINR(data.summary.net)} />
          </div>

          {!data.summary.orders ? (
            <div className="card">
              <EmptyState icon="📊" title="No sales in this period" />
            </div>
          ) : (
            <>
              <Section
                title="Product-wise sales"
                onExport={() =>
                  downloadCSV(`products_${tag}.csv`, [['Product', 'Variant', 'Qty', 'Revenue (₹)'], ...data.byProduct.map((p) => [p.product, p.variant, p.qty, p.revenue])])
                }
              >
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Size</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byProduct.map((p) => (
                      <tr key={p.product + p.variant}>
                        <td className="font-medium">{p.product}</td>
                        <td className="text-muted">{p.variant}</td>
                        <td className="text-right">{p.qty}</td>
                        <td className="text-right font-semibold">{formatINR(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>

              <div className="grid gap-6 lg:grid-cols-2">
                <Section
                  title="Area-wise sales"
                  onExport={() =>
                    downloadCSV(`areas_${tag}.csv`, [['Pincode', 'City', 'Orders', 'Revenue (₹)'], ...data.byArea.map((a) => [a.pincode, a.city, a.orders, a.revenue])])
                  }
                >
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Pincode</th>
                        <th>City</th>
                        <th className="text-right">Orders</th>
                        <th className="text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.byArea.map((a) => (
                        <tr key={a.pincode}>
                          <td className="font-mono">{a.pincode}</td>
                          <td>{a.city}</td>
                          <td className="text-right">{a.orders}</td>
                          <td className="text-right font-semibold">{formatINR(a.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Section>

                <Section
                  title="Payment methods"
                  onExport={() =>
                    downloadCSV(`payments_${tag}.csv`, [['Method', 'Orders', 'Revenue (₹)'], ...data.byPayment.map((p) => [PAYMENT_LABEL[p.method], p.orders, p.revenue])])
                  }
                >
                  <div className="grid items-center gap-4 p-4 sm:grid-cols-2">
                    <div className="h-44">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={data.byPayment} dataKey="revenue" nameKey="method" innerRadius={40} outerRadius={70} paddingAngle={2}>
                            {data.byPayment.map((p, i) => (
                              <Cell key={p.method} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="var(--color-surface)" />
                            ))}
                          </Pie>
                          <Tooltip {...tooltipStyle} formatter={(v, n) => [formatINR(v), PAYMENT_LABEL[n] || n]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <ul className="space-y-2 text-sm">
                      {data.byPayment.map((p, i) => (
                        <li key={p.method} className="flex items-center gap-2">
                          <span className="size-2.5 shrink-0 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                          <span className="flex-1">
                            {PAYMENT_LABEL[p.method]}
                            <span className="block text-xs text-muted">{p.orders} orders</span>
                          </span>
                          <b>{formatINR(p.revenue)}</b>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Section>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
