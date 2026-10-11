import { CheckCheck, Download, Search } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  errorMessage,
  useAdminOrdersQuery,
  useAssignOrderMutation,
  usePartnersQuery,
  useSetOrderStatusMutation,
} from '../../app/api'
import { usePanelBase } from '../../components/guards'
import { EmptyState, ErrorState, PageHeader, Pagination, Skeleton, StatusBadge, Tabs } from '../../components/ui'
import { formatDateTime, formatINR, PAYMENT_LABEL, STATUS_LABEL } from '../../lib/format'
import { downloadCSV } from './_shared'

const STATUSES = ['placed', 'confirmed', 'packed', 'out_for_delivery', 'delivered', 'undelivered', 'cancelled', 'returned']
const OPEN = ['placed', 'confirmed', 'packed', 'out_for_delivery']

function AssignSelect({ order, partners }) {
  const [assign, { isLoading }] = useAssignOrderMutation()
  if (!OPEN.includes(order.status)) return <span className="text-muted">{order.deliveryPartner?.name || '—'}</span>
  return (
    <select
      className="input min-w-36 py-1.5 text-xs"
      value={order.deliveryPartner?._id || ''}
      disabled={isLoading}
      onClick={(e) => e.stopPropagation()}
      onChange={async (e) => {
        try {
          await assign({ id: order._id, deliveryPartner: e.target.value || null }).unwrap()
          toast.success(e.target.value ? 'Delivery partner assigned' : 'Unassigned')
        } catch (err) {
          toast.error(errorMessage(err))
        }
      }}
    >
      <option value="">Unassigned</option>
      {partners.map((p) => (
        <option key={p._id} value={p._id}>
          {p.delivery?.isOnline ? '🟢' : '⚪'} {p.name}
        </option>
      ))}
    </select>
  )
}

export default function Orders() {
  const base = usePanelBase()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const get = (k) => params.get(k) || ''
  const filters = {
    status: get('status'),
    q: get('q'),
    date: get('date'),
    source: get('source'),
    returns: get('returns'),
    unassigned: get('unassigned'),
    page: Number(get('page')) || 1,
  }
  const [search, setSearch] = useState(filters.q)
  const [selected, setSelected] = useState([])
  const { data, isFetching, isLoading, error, refetch } = useAdminOrdersQuery(filters)
  const { data: partners = [] } = usePartnersQuery({ kyc: 'approved' })
  const [setStatus, { isLoading: confirming }] = useSetOrderStatusMutation()

  const update = (patch) => {
    const next = new URLSearchParams(params)
    Object.entries({ page: '', ...patch }).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next)
    setSelected([])
  }

  const orders = data?.items || []
  const placedIds = orders.filter((o) => o.status === 'placed').map((o) => o._id)

  const bulkConfirm = async () => {
    let ok = 0
    for (const id of selected) {
      try {
        await setStatus({ id, status: 'confirmed', note: 'Bulk confirmed' }).unwrap()
        ok++
      } catch (e) {
        toast.error(errorMessage(e))
      }
    }
    toast.success(`${ok} order${ok === 1 ? '' : 's'} confirmed`)
    setSelected([])
  }

  const exportCSV = () =>
    downloadCSV(`orders-page-${filters.page}.csv`, [
      ['Order no', 'Customer', 'Phone', 'Pincode', 'Items', 'Total', 'Payment', 'Payment status', 'Slot date', 'Slot', 'Partner', 'Status', 'Created'],
      ...orders.map((o) => [
        o.orderNo,
        o.address?.name,
        o.address?.phone,
        o.address?.pincode,
        o.items.reduce((s, i) => s + i.qty, 0),
        o.total,
        PAYMENT_LABEL[o.payment.method],
        o.payment.status,
        o.slot?.date,
        o.slot?.label,
        o.deliveryPartner?.name || '',
        STATUS_LABEL[o.status],
        new Date(o.createdAt).toLocaleString('en-IN'),
      ]),
    ])

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle={data ? `${data.total} order${data.total === 1 ? '' : 's'}` : 'Manage and fulfil customer orders'}
        actions={
          <>
            {selected.length > 0 && (
              <button className="btn-primary btn-sm" onClick={bulkConfirm} disabled={confirming}>
                <CheckCheck className="size-4" /> Confirm {selected.length}
              </button>
            )}
            <button className="btn-outline btn-sm" onClick={exportCSV} disabled={!orders.length}>
              <Download className="size-4" /> Export CSV
            </button>
          </>
        }
      />

      <Tabs
        tabs={[{ value: '', label: 'All' }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]}
        value={filters.status}
        onChange={(v) => update({ status: v, returns: '', unassigned: '' })}
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <form
          className="relative min-w-0 flex-1 basis-60"
          onSubmit={(e) => {
            e.preventDefault()
            update({ q: search.trim() })
          }}
        >
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Order no, name, phone or pincode" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <input type="date" className="input w-auto" value={filters.date} onChange={(e) => update({ date: e.target.value })} aria-label="Delivery date" />
        <select className="input w-auto" value={filters.source} onChange={(e) => update({ source: e.target.value })} aria-label="Source">
          <option value="">All sources</option>
          <option value="store">Store orders</option>
          <option value="subscription">Subscription</option>
        </select>
        <button
          className={`btn-sm btn ${filters.unassigned ? 'bg-primary text-on-primary' : 'btn-outline'}`}
          onClick={() => update({ unassigned: filters.unassigned ? '' : '1', status: '', returns: '' })}
        >
          Unassigned
        </button>
        <button
          className={`btn-sm btn ${filters.returns ? 'bg-primary text-on-primary' : 'btn-outline'}`}
          onClick={() => update({ returns: filters.returns ? '' : '1', status: '', unassigned: '' })}
        >
          Return requests
        </button>
      </div>

      <div className={`mt-4 transition ${isFetching && !isLoading ? 'opacity-60' : ''}`}>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : !orders.length ? (
          <div className="card">
            <EmptyState icon="📦" title="No orders found" text="Try changing the filters." />
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="card hidden overflow-x-auto md:block">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-8">
                      <input
                        type="checkbox"
                        aria-label="Select all placed orders"
                        checked={placedIds.length > 0 && placedIds.every((id) => selected.includes(id))}
                        onChange={(e) => setSelected(e.target.checked ? placedIds : [])}
                        disabled={!placedIds.length}
                      />
                    </th>
                    <th>Order</th>
                    <th>Customer</th>
                    <th className="text-right">Total</th>
                    <th>Payment</th>
                    <th>Slot</th>
                    <th>Partner</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o._id} className="cursor-pointer hover:bg-surface-2" onClick={() => navigate(`${base}/orders/${o._id}`)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        {o.status === 'placed' && (
                          <input type="checkbox" checked={selected.includes(o._id)} onChange={() => toggle(o._id)} aria-label={`Select ${o.orderNo}`} />
                        )}
                      </td>
                      <td>
                        <p className="font-semibold">{o.orderNo}</p>
                        <p className="text-xs text-muted">
                          {formatDateTime(o.createdAt)} · {o.items.reduce((s, i) => s + i.qty, 0)} items
                          {o.source === 'subscription' && ' · 🔁'}
                        </p>
                      </td>
                      <td>
                        <p>{o.address?.name}</p>
                        <p className="text-xs text-muted">
                          {o.address?.phone} · {o.address?.pincode}
                        </p>
                      </td>
                      <td className="text-right font-semibold">{formatINR(o.total)}</td>
                      <td>
                        <p className="text-xs">{PAYMENT_LABEL[o.payment.method]}</p>
                        <StatusBadge status={o.payment.status} />
                      </td>
                      <td className="text-xs">
                        <p>{o.slot?.date}</p>
                        <p className="text-muted">{o.slot?.label}</p>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <AssignSelect order={o} partners={partners} />
                      </td>
                      <td>
                        <StatusBadge status={o.status} />
                        {o.returnRequested && <span className="chip mt-1 block w-fit bg-error/10 text-error ">Return req.</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {orders.map((o) => (
                <div key={o._id} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      {o.status === 'placed' && (
                        <input type="checkbox" className="mt-1" checked={selected.includes(o._id)} onChange={() => toggle(o._id)} aria-label={`Select ${o.orderNo}`} />
                      )}
                      <Link to={`${base}/orders/${o._id}`}>
                        <p className="font-semibold">{o.orderNo}</p>
                        <p className="text-xs text-muted">{formatDateTime(o.createdAt)}</p>
                      </Link>
                    </div>
                    <StatusBadge status={o.status} />
                  </div>
                  <Link to={`${base}/orders/${o._id}`} className="mt-3 flex items-end justify-between text-sm">
                    <span>
                      {o.address?.name}
                      <span className="block text-xs text-muted">
                        {o.address?.pincode} · {PAYMENT_LABEL[o.payment.method]} · {o.slot?.date}
                      </span>
                    </span>
                    <span className="font-heading font-bold">{formatINR(o.total)}</span>
                  </Link>
                  <div className="mt-3">
                    <AssignSelect order={o} partners={partners} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <Pagination page={filters.page} pages={data?.pages} onChange={(p) => update({ ...filters, page: String(p) })} />
    </div>
  )
}
