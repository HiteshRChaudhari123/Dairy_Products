import { Bell, CheckCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMarkNotificationsReadMutation, useNotificationsQuery } from '../../app/api'
import { EmptyState, ErrorState, Skeleton } from '../../components/ui'
import { formatDateTime } from '../../lib/format'

export default function Notifications() {
  const { data, isLoading, error, refetch } = useNotificationsQuery()
  const [markRead, { isLoading: marking }] = useMarkNotificationsReadMutation()
  if (isLoading) return <Skeleton className="h-64" />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-muted">{data.unread ? `${data.unread} unread` : 'You are all caught up'}</p>
        </div>
        {data.unread > 0 && (
          <button className="btn-outline btn-sm" disabled={marking} onClick={() => markRead()}>
            <CheckCheck className="size-4" /> Mark all read
          </button>
        )}
      </div>
      {!data.items.length ? (
        <div className="card">
          <EmptyState icon="🔔" title="No notifications yet" text="Updates about your membership, subscriptions, payments and deliveries appear here." />
        </div>
      ) : (
        <ul className="card divide-y divide-line">
          {data.items.map((n) => {
            const body = (
              <>
                <Bell className={`mt-0.5 size-5 shrink-0 ${n.readAt ? 'text-muted' : 'text-brand'}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={`block ${n.readAt ? '' : 'font-semibold'}`}>{n.title}</span>
                  {n.body && <span className="block text-sm text-muted">{n.body}</span>}
                  <span className="mt-0.5 block text-xs text-muted">{formatDateTime(n.createdAt)}</span>
                </span>
                {!n.readAt && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
              </>
            )
            const cls = 'flex items-start gap-3 p-4 hover:bg-surface-2'
            const open = () => !n.readAt && markRead([n._id])
            return (
              <li key={n._id}>
                {/* Announcements may link to an https:// site (the server only allows https or site paths). */}
                {n.link?.startsWith('https://') ? (
                  <a href={n.link} target="_blank" rel="noopener noreferrer" className={cls} onClick={open}>
                    {body}
                  </a>
                ) : n.link ? (
                  <Link to={n.link} className={cls} onClick={open}>
                    {body}
                  </Link>
                ) : (
                  <button className={`${cls} w-full text-left`} onClick={open}>
                    {body}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
