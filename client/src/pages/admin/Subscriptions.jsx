import { Download, Milk, PackagePlus, Printer } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  errorMessage,
  useAdminSubscriptionsQuery,
  useGenerateSubscriptionOrdersMutation,
  useMilkSheetQuery,
} from '../../app/api'
import { EmptyState, ErrorState, PageHeader, PageLoader, StatusBadge, Tabs } from '../../components/ui'
import { addDays, dateKey, formatDate, FREQUENCY_LABEL, telHref, WEEKDAYS } from '../../lib/format'
import { ConfirmModal, downloadCSV, PrintStyles } from './_shared'

function MilkSheet() {
  const [date, setDate] = useState(dateKey(addDays(new Date(), 1)))
  const { data, isLoading, isFetching, error, refetch } = useMilkSheetQuery(date)
  const [generate, { isLoading: generating }] = useGenerateSubscriptionOrdersMutation()
  const [confirm, setConfirm] = useState(false)

  const run = async () => {
    try {
      const r = await generate({ date }).unwrap()
      toast.success(`${r.created} orders created · ${r.skipped} skipped${r.failed.length ? ` · ${r.failed.length} failed` : ''}`)
      if (r.failed.length) toast.error(r.failed[0].reason)
      setConfirm(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const exportCSV = () =>
    downloadCSV(`milk-sheet-${date}.csv`, [
      ['Zone', 'Customer', 'Phone', 'Address', 'Pincode', 'Item', 'Qty', 'Slot'],
      ...data.deliveries.map((d) => [
        d.zone,
        d.customer,
        d.phone,
        [d.address?.line1, d.address?.line2, d.address?.city].filter(Boolean).join(', '),
        d.address?.pincode,
        d.item,
        d.qty,
        d.slot,
      ]),
    ])

  const grand = data?.totals.reduce((s, t) => s + t.qty, 0) || 0

  return (
    <div className="space-y-6">
      <PrintStyles />
      <div className="no-print flex flex-wrap items-end gap-3">
        <label>
          <span className="label">Delivery date</span>
          <input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline btn-sm" onClick={() => window.print()} disabled={!data}>
            <Printer className="size-4" /> Print sheet
          </button>
          <button className="btn-outline btn-sm" onClick={exportCSV} disabled={!data?.deliveries.length}>
            <Download className="size-4" /> Export CSV
          </button>
          <button className="btn-primary btn-sm" onClick={() => setConfirm(true)}>
            <PackagePlus className="size-4" /> Generate orders for this date
          </button>
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data.deliveries.length ? (
        <div className="card">
          <EmptyState icon="🥛" title="No deliveries" text={`No subscription deliveries are due on ${formatDate(date)}.`} />
        </div>
      ) : (
        <div className={`space-y-6 ${isFetching ? 'opacity-60' : ''}`}>
          <h2 className="hidden text-xl font-bold print:block">Milk sheet · {formatDate(date)}</h2>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="card overflow-x-auto p-4 sm:p-5">
              <h3 className="mb-3 flex items-center gap-2 font-semibold">
                <Milk className="size-5 text-brand" /> Totals to pack
              </h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {data.totals.map((t) => (
                    <tr key={t.item}>
                      <td>{t.item}</td>
                      <td className="text-right font-semibold">{t.qty}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="font-bold">Grand total</td>
                    <td className="text-right font-bold text-brand">{grand}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
              {data.zones.map((z) => (
                <div key={z.zone} className="card p-4">
                  <h3 className="mb-2 font-semibold">📍 {z.zone}</h3>
                  <ul className="space-y-1 text-sm">
                    {z.items.map((i) => (
                      <li key={i.item} className="flex justify-between gap-2">
                        <span className="truncate">{i.item}</span>
                        <b>{i.qty}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="card overflow-x-auto">
            <h3 className="border-b border-line px-5 py-3 font-semibold">Delivery list ({data.deliveries.length})</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>Customer</th>
                  <th>Address</th>
                  <th>Item</th>
                  <th className="text-right">Qty</th>
                  <th>Slot</th>
                </tr>
              </thead>
              <tbody>
                {data.deliveries.map((d, i) => (
                  <tr key={i}>
                    <td>{d.zone}</td>
                    <td>
                      {d.customer}
                      {d.phone && (
                        <a href={telHref(d.phone)} className="block text-xs text-muted hover:text-accent">
                          {d.phone}
                        </a>
                      )}
                    </td>
                    <td className="min-w-48 text-xs">
                      {d.address?.line1}
                      {d.address?.line2 && `, ${d.address.line2}`}, {d.address?.city} – <b>{d.address?.pincode}</b>
                    </td>
                    <td>{d.item}</td>
                    <td className="text-right font-semibold">{d.qty}</td>
                    <td className="text-xs whitespace-nowrap">{d.slot}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={run}
        busy={generating}
        danger={false}
        title="Generate subscription orders?"
        confirmLabel={generating ? 'Generating…' : 'Generate orders'}
        text={`This creates one order per due subscription for ${formatDate(date)}, paid from the customer's wallet (or cash on delivery if the balance is low). It runs automatically every night at 9 PM, and it's safe to run again: subscriptions already processed for this date are skipped.`}
      />
    </div>
  )
}

function AllSubscriptions() {
  const [status, setStatus] = useState('active')
  const { data = [], isLoading, error, refetch } = useAdminSubscriptionsQuery({ status })
  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { value: 'active', label: 'Active' },
          { value: 'paused', label: 'Paused' },
          { value: 'cancelled', label: 'Cancelled' },
          { value: '', label: 'All' },
        ]}
        value={status}
        onChange={setStatus}
      />
      {isLoading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data.length ? (
        <div className="card">
          <EmptyState icon="🔁" title="No subscriptions" />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Product</th>
                <th className="text-right">Qty</th>
                <th>Frequency</th>
                <th>Start</th>
                <th>Paused days</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s._id}>
                  <td>
                    {s.user?.name}
                    <p className="text-xs text-muted">
                      {s.user?.phone} · {s.address?.pincode}
                    </p>
                  </td>
                  <td>
                    {/* Baskets can hold several products; older subscriptions are migrated into `items` too. */}
                    {(s.items?.length ? s.items : [s]).map((it) => (
                      <p key={String(it.variantId)}>
                        {it.productName} <span className="text-xs text-muted">{it.variantLabel}</span>
                      </p>
                    ))}
                    <p className="text-xs text-muted">{s.slot}</p>
                  </td>
                  <td className="text-right font-semibold">
                    {(s.items?.length ? s.items : [s]).map((it) => (
                      <p key={String(it.variantId)}>{it.qty}</p>
                    ))}
                  </td>
                  <td className="text-xs">
                    {FREQUENCY_LABEL[s.frequency]}
                    {s.frequency === 'custom' && <p className="text-muted">{s.days.map((d) => WEEKDAYS[d]).join(', ')}</p>}
                  </td>
                  <td className="text-xs whitespace-nowrap">{formatDate(s.startDate)}</td>
                  <td>{s.pausedDates.length || '—'}</td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function Subscriptions() {
  const [tab, setTab] = useState('sheet')
  return (
    <div>
      <div className="no-print">
        <PageHeader title="Subscriptions" subtitle="Plan tomorrow's milk run and manage recurring deliveries" />
        <div className="mb-5">
          <Tabs
            tabs={[
              { value: 'sheet', label: "Tomorrow's milk sheet" },
              { value: 'all', label: 'All subscriptions' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </div>
      {tab === 'sheet' ? <MilkSheet /> : <AllSubscriptions />}
    </div>
  )
}
