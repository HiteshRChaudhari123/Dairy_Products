import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { useAdminPlansQuery } from '../../../app/api'
import { usePanelBase } from '../../../components/guards'
import { EmptyState, ErrorState, PageHeader, PageLoader, StatusBadge, Tabs } from '../../../components/ui'
import { selectUser } from '../../../features/auth/authSlice'
import { planPriceText } from '../../../lib/billing'
import { formatDate } from '../../../lib/format'

export default function Plans() {
  const base = usePanelBase()
  const navigate = useNavigate()
  const owner = useSelector(selectUser)?.role === 'superadmin'
  const [kind, setKind] = useState('')
  const [status, setStatus] = useState('')
  const { data = [], isLoading, error, refetch } = useAdminPlansQuery({ kind, status })

  return (
    <div>
      <PageHeader
        title="Plans"
        subtitle="Membership and product subscription plans. Published terms never change for existing subscribers: edits create a new version."
        actions={
          owner && (
            <Link to={`${base}/plans/new`} className="btn-primary">
              <Plus className="size-4" /> New plan
            </Link>
          )
        }
      />
      <div className="mb-5 flex flex-wrap gap-3">
        <Tabs
          tabs={[
            { value: '', label: 'All types' },
            { value: 'membership', label: 'Memberships' },
            { value: 'product', label: 'Product subscriptions' },
          ]}
          value={kind}
          onChange={setKind}
        />
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Any status</option>
          {['draft', 'published', 'unpublished', 'archived'].map((s) => (
            <option key={s} value={s}>
              {s[0].toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>
      {isLoading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data.length ? (
        <div className="card">
          <EmptyState icon="📋" title="No plans yet" text="Create a membership or a product subscription plan. Nothing is shown to customers until you publish it." action={owner && <Link to={`${base}/plans/new`} className="btn-primary">Create a plan</Link>} />
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table min-w-[720px]">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Type</th>
                <th>Live price</th>
                <th>Versions</th>
                <th className="text-right">Active subscribers</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p._id} className="cursor-pointer hover:bg-surface-2" onClick={() => navigate(`${base}/plans/${p._id}`)}>
                  <td>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted">/{p.slug}</p>
                  </td>
                  <td className="text-sm">{p.kind === 'membership' ? 'Membership' : 'Product subscription'}</td>
                  <td className="text-sm">{p.publishedVersion ? planPriceText(p.publishedVersion) : '—'}</td>
                  <td className="text-xs">
                    {p.publishedVersion ? `v${p.publishedVersion.version} live` : 'none live'}
                    {p.latest && p.latest.status === 'draft' && <span className="block text-warning">v{p.latest.version} draft · {formatDate(p.latest.updatedAt)}</span>}
                  </td>
                  <td className="text-right font-semibold">{p.activeSubscribers}</td>
                  <td>
                    <StatusBadge status={p.status} />
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
