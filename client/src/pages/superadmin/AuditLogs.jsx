import { Search } from 'lucide-react'
import { useState } from 'react'
import { useAuditLogsQuery } from '../../app/api'
import { EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from '../../components/ui'
import { useDebounced } from '../../hooks/useTheme'
import { formatDateTime } from '../../lib/format'

const ROLE_TONE = {
  superadmin: 'bg-secondary-soft text-warning',
  admin: 'bg-primary-soft text-brand',
  system: 'bg-surface-2 text-muted',
}

function RoleBadge({ role }) {
  return <span className={`chip capitalize ${ROLE_TONE[role] || 'bg-accent-soft text-brand'}`}>{role || 'system'}</span>
}

export default function AuditLogs() {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const search = useDebounced(q, 300)
  const { data, isFetching, error, refetch } = useAuditLogsQuery({ q: search, page })

  return (
    <div>
      <PageHeader title="Audit logs" subtitle="Who changed what, and when. Entries cannot be edited or deleted." />
      <div className="relative mb-4 max-w-md">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
        <input
          className="input pl-9"
          placeholder="Search action, person or details"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <div className="card">
          <EmptyState icon="📜" title="No log entries" text={q ? 'Try a different search.' : 'Changes made by admins will appear here.'} />
        </div>
      ) : (
        <>
          <div className={`card hidden overflow-x-auto md:block ${isFetching ? 'opacity-60' : ''}`}>
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l._id}>
                    <td className="whitespace-nowrap text-muted">{formatDateTime(l.createdAt)}</td>
                    <td className="whitespace-nowrap">
                      <span className="mr-2 font-medium">{l.actorName || 'System'}</span>
                      <RoleBadge role={l.role} />
                    </td>
                    <td>
                      <code className="chip bg-surface-2 font-mono">{l.action}</code>
                    </td>
                    <td className="text-muted">{l.entity || '—'}</td>
                    <td className="max-w-md break-words">{l.details || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className={`space-y-3 md:hidden ${isFetching ? 'opacity-60' : ''}`}>
            {data.items.map((l) => (
              <li key={l._id} className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <code className="chip bg-surface-2 font-mono">{l.action}</code>
                  <span className="text-xs text-muted">{formatDateTime(l.createdAt)}</span>
                </div>
                <p className="mt-2 text-sm">
                  <span className="font-medium">{l.actorName || 'System'}</span> <RoleBadge role={l.role} />
                </p>
                {l.details && <p className="mt-1 text-sm break-words text-muted">{l.details}</p>}
              </li>
            ))}
          </ul>
          <Pagination page={data.page} pages={data.pages} onChange={setPage} />
        </>
      )}
    </div>
  )
}
