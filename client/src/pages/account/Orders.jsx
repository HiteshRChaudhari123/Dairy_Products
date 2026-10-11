import { RefreshCw, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useDispatch } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { useMyOrdersQuery } from '../../app/api'
import ProductImage from '../../components/ProductImage'
import { EmptyState, ErrorState, Skeleton, StatusBadge, Tabs } from '../../components/ui'
import { formatDate, formatINR } from '../../lib/format'
import { reorder } from './reorder'

const ACTIVE = ['placed', 'confirmed', 'packed', 'out_for_delivery']
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function Orders() {
  const [filter, setFilter] = useState('all')
  const serverStatus = filter === 'delivered' || filter === 'cancelled' ? filter : undefined
  const { data = [], isLoading, error, refetch } = useMyOrdersQuery({ status: serverStatus })
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const orders = filter === 'active' ? data.filter((o) => ACTIVE.includes(o.status)) : data

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">My orders</h1>
      <Tabs tabs={FILTERS} value={filter} onChange={setFilter} />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon="📦"
          title="No orders here yet"
          text="Fresh milk, paneer and ghee are just a few taps away."
          action={
            <Link to="/" className="btn-primary">
              Start shopping
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o._id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">#{o.orderNo}</p>
                  <p className="text-xs text-muted">
                    Placed {formatDate(o.createdAt)}
                    {o.slot?.date && ` · Delivery ${formatDate(o.slot.date, { day: 'numeric', month: 'short' })}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {o.source === 'subscription' && (
                    <span className="chip bg-primary-soft text-brand">
                      <RefreshCw className="size-3" /> Subscription
                    </span>
                  )}
                  <StatusBadge status={o.status} />
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                {o.items.slice(0, 4).map((it) => (
                  <div key={it._id || it.variantId} className="size-14 shrink-0">
                    <ProductImage src={it.image} name={it.name} icon="🥛" rounded="rounded-lg" size="text-2xl" />
                  </div>
                ))}
                {o.items.length > 4 && <span className="text-sm text-muted">+{o.items.length - 4} more</span>}
                <p className="ml-2 line-clamp-2 min-w-0 flex-1 text-sm text-muted">
                  {o.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                <p className="font-heading font-bold">{formatINR(o.total)}</p>
                <div className="flex gap-2">
                  <button
                    className="btn-outline btn-sm"
                    onClick={() => {
                      reorder(dispatch, o)
                      toast.success('Items added to cart')
                      navigate('/cart')
                    }}
                  >
                    <RotateCcw className="size-3.5" /> Reorder
                  </button>
                  <Link to={`/account/orders/${o._id}`} className="btn-primary btn-sm">
                    View details
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
