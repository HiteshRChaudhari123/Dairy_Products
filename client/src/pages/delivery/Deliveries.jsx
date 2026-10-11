import { Clock, MapPin, Navigation, Phone } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDeliveryOrdersQuery } from '../../app/api'
import { EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge, Tabs } from '../../components/ui'
import { formatDate, formatINR, telHref } from '../../lib/format'
import { byStop, itemsSummary, navigateUrl, toCollect } from './helpers'

function OrderCard({ o, stop }) {
  const cash = toCollect(o)
  const open = !['delivered', 'cancelled', 'returned'].includes(o.status)
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {stop && (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">{stop}</span>
          )}
          <div className="min-w-0">
            <p className="font-semibold">{o.address?.name}</p>
            <p className="text-xs text-muted">#{o.orderNo}</p>
          </div>
        </div>
        <StatusBadge status={o.status} />
      </div>
      <p className="mt-3 flex gap-2 text-sm">
        <MapPin className="mt-0.5 size-4 shrink-0 text-brand" />
        <span>
          {o.address?.line1}
          {o.address?.landmark ? `, near ${o.address.landmark}` : ''} · <b>{o.address?.pincode}</b>
        </span>
      </p>
      <p className="mt-1.5 flex gap-2 text-sm text-muted">
        <Clock className="mt-0.5 size-4 shrink-0" /> {o.slot?.label} · {formatDate(o.slot?.date)}
      </p>
      <p className="mt-2 line-clamp-2 text-sm text-muted">{itemsSummary(o.items)}</p>
      {cash > 0 && open && (
        <p className="mt-3 inline-flex rounded-xl bg-secondary-soft px-3 py-1.5 text-base font-bold text-warning">
          Collect {formatINR(cash)}
        </p>
      )}
      {open ? (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <a href={navigateUrl(o.address)} target="_blank" rel="noreferrer" className="btn-outline px-2">
            <Navigation className="size-4" /> Go
          </a>
          <a href={telHref(o.address?.phone)} className="btn-outline px-2">
            <Phone className="size-4" /> Call
          </a>
          <Link to={`/delivery/orders/${o._id}`} className="btn-primary px-2">
            Open
          </Link>
        </div>
      ) : (
        <Link to={`/delivery/orders/${o._id}`} className="link mt-3 inline-block text-sm">
          View details · {formatINR(o.total)}
        </Link>
      )}
    </div>
  )
}

export default function Deliveries() {
  const [scope, setScope] = useState('active')
  const { data = [], isLoading, error, refetch } = useDeliveryOrdersQuery(scope, { pollingInterval: 30000 })

  let content
  if (isLoading) content = <div className="grid gap-3 md:grid-cols-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48" />)}</div>
  else if (error) content = <ErrorState error={error} onRetry={refetch} />
  else if (!data.length)
    content = (
      <div className="card">
        <EmptyState
          icon={scope === 'history' ? '📦' : '🛵'}
          title={scope === 'history' ? 'No completed deliveries yet' : 'No deliveries right now'}
          text={scope === 'history' ? 'Delivered and cancelled orders will appear here.' : 'Orders assigned to you will show up here.'}
        />
      </div>
    )
  else if (scope === 'active') {
    const sorted = [...data].sort(byStop)
    const groups = sorted.reduce((g, o) => {
      const pin = o.address?.pincode || 'Other'
      ;(g[pin] ||= []).push(o)
      return g
    }, {})
    let n = 0
    content = Object.entries(groups).map(([pin, list]) => (
      <section key={pin} className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-muted">
          📍 {pin} · {list.length} stop{list.length > 1 ? 's' : ''}
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((o) => (
            <OrderCard key={o._id} o={o} stop={++n} />
          ))}
        </div>
      </section>
    ))
  } else
    content = (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.map((o) => (
          <OrderCard key={o._id} o={o} />
        ))}
      </div>
    )

  return (
    <div>
      <PageHeader title="Deliveries" subtitle={scope === 'active' ? 'Sorted by area so you can deliver in order.' : undefined} />
      <div className="mb-5">
        <Tabs
          tabs={[
            { value: 'active', label: 'Active' },
            { value: 'today', label: 'Today' },
            { value: 'history', label: 'History' },
          ]}
          value={scope}
          onChange={setScope}
        />
      </div>
      {content}
    </div>
  )
}
