import { Search } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useCustomersQuery } from '../../app/api'
import { usePanelBase } from '../../components/guards'
import { EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from '../../components/ui'
import { formatDate, formatINR, telHref } from '../../lib/format'

export default function Customers() {
  const base = usePanelBase()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const page = Number(params.get('page')) || 1
  const [search, setSearch] = useState(q)
  const { data, isLoading, isFetching, error, refetch } = useCustomersQuery({ q, page })
  const items = data?.items || []

  const set = (patch) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    setParams(next)
  }

  return (
    <div>
      <PageHeader title="Customers" subtitle={data ? `${data.total} customers` : 'Everyone who shops with Gavyora'} />
      <form
        className="relative mb-4 max-w-md"
        onSubmit={(e) => {
          e.preventDefault()
          set({ q: search.trim(), page: '' })
        }}
      >
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input className="input pl-9" placeholder="Search name, email or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
      </form>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !items.length ? (
        <div className="card">
          <EmptyState icon="👥" title="No customers found" />
        </div>
      ) : (
        <div className={isFetching ? 'opacity-60' : ''}>
          <div className="card hidden overflow-x-auto md:block">
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th className="text-right">Orders</th>
                  <th className="text-right">Spent</th>
                  <th className="text-right">Wallet</th>
                  <th>Joined</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u._id} className="cursor-pointer hover:bg-surface-2" onClick={() => navigate(`${base}/customers/${u._id}`)}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-brand">{u.name[0]}</span>
                        <div>
                          <p className="font-medium">{u.name}</p>
                          <p className="text-xs text-muted">{u.email || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      {u.phone ? (
                        <a href={telHref(u.phone)} className="hover:text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                          {u.phone}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-right">{u.orders}</td>
                    <td className="text-right font-semibold">{formatINR(u.spent)}</td>
                    <td className="text-right">{formatINR(u.wallet)}</td>
                    <td className="text-xs">{formatDate(u.createdAt)}</td>
                    <td>
                      {u.isBlocked ? (
                        <span className="chip bg-error/10 text-error ">Blocked</span>
                      ) : (
                        <span className="chip bg-primary-soft text-brand">Active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 md:hidden">
            {items.map((u) => (
              <Link key={u._id} to={`${base}/customers/${u._id}`} className="card flex items-center gap-3 p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-brand">{u.name[0]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {u.name} {u.isBlocked && <span className="chip bg-error/10 text-error ">Blocked</span>}
                  </p>
                  <p className="truncate text-xs text-muted">{u.phone || u.email}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold">{formatINR(u.spent)}</p>
                  <p className="text-xs text-muted">{u.orders} orders</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
      <Pagination page={page} pages={data?.pages} onChange={(p) => set({ page: String(p) })} />
    </div>
  )
}
