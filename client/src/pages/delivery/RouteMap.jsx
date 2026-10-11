import { ExternalLink, Info, Navigation } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useDeliveryOrdersQuery } from '../../app/api'
import { EmptyState, ErrorState, PageHeader, PageLoader, StatusBadge } from '../../components/ui'
import { formatINR } from '../../lib/format'
import { byStop, navigateUrl, routeUrl, toCollect } from './helpers'

// Deterministic pseudo-positions so the same stop always lands in the same place on the sketch.
function position(o, i, n) {
  let h = 0
  for (const c of o._id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const t = n > 1 ? i / (n - 1) : 0.5
  return { x: 40 + t * 520, y: 70 + ((h % 1000) / 1000) * 200 }
}

export default function RouteMap() {
  const { data = [], isLoading, error, refetch } = useDeliveryOrdersQuery('active', { pollingInterval: 30000 })
  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const stops = [...data].sort(byStop)
  const pts = stops.map((o, i) => position(o, i, stops.length))
  const cash = stops.reduce((s, o) => s + toCollect(o), 0)

  return (
    <div>
      <PageHeader
        title="Today's route"
        subtitle={stops.length ? `${stops.length} stops · ${formatINR(cash)} cash to collect` : undefined}
        actions={
          stops.length > 0 && (
            <a href={routeUrl(stops.map((o) => o.address))} target="_blank" rel="noreferrer" className="btn-primary">
              <ExternalLink className="size-4" /> Open full route in Google Maps
            </a>
          )
        }
      />

      {!stops.length ? (
        <div className="card">
          <EmptyState icon="🗺️" title="No stops yet" text="Your route appears here once orders are assigned to you." />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
          <div className="card overflow-hidden">
            <svg viewBox="0 0 600 340" className="h-auto w-full bg-primary-soft" role="img" aria-label="Route sketch">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M40 0H0V40" fill="none" stroke="var(--color-line)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="600" height="340" fill="url(#grid)" />
              <path d="M0 300 C150 250 250 330 600 260" stroke="var(--color-chart-2)" strokeWidth="14" fill="none" opacity="0.35" />
              <path d="M90 0 L140 340 M0 150 L600 120 M420 0 L380 340" stroke="var(--color-surface)" strokeWidth="10" opacity="0.9" />
              {pts.length > 1 && (
                <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--color-chart-1)" strokeWidth="3" strokeDasharray="8 6" />
              )}
              {pts.map((p, i) => (
                <g key={stops[i]._id}>
                  <circle cx={p.x} cy={p.y} r="15" fill={stops[i].status === 'out_for_delivery' ? 'var(--color-chart-2)' : 'var(--color-chart-1)'} stroke="#fff" strokeWidth="3" />
                  <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">
                    {i + 1}
                  </text>
                </g>
              ))}
            </svg>
            <p className="flex items-start gap-2 border-t border-line p-3 text-xs text-muted">
              <Info className="mt-0.5 size-4 shrink-0" />
              This is a sketch of your stop order. Live GPS tracking and optimised routing turn on once the Google Maps API key is added.
            </p>
          </div>

          <ol className="space-y-3">
            {stops.map((o, i) => (
              <li key={o._id} className="card flex items-start gap-3 p-3">
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-on-primary ${o.status === 'out_for_delivery' ? 'bg-warning' : 'bg-primary'}`}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <Link to={`/delivery/orders/${o._id}`} className="font-semibold hover:text-accent">{o.address?.name}</Link>
                  <p className="truncate text-sm text-muted">
                    {o.address?.line1} · {o.address?.pincode}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <StatusBadge status={o.status} />
                    {toCollect(o) > 0 && <span className="chip bg-secondary-soft font-semibold text-warning">{formatINR(toCollect(o))} COD</span>}
                  </div>
                </div>
                <a href={navigateUrl(o.address)} target="_blank" rel="noreferrer" className="btn-ghost btn-sm px-2" aria-label="Navigate">
                  <Navigation className="size-5 text-brand" />
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
