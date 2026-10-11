import { ArrowLeft, CheckCircle2, RotateCcw, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import {
  errorMessage,
  useAdminTicketQuery,
  useAdminTicketsQuery,
  useReplyTicketMutation,
  useSetTicketStatusMutation,
} from '../../app/api'
import { usePanelBase } from '../../components/guards'
import { EmptyState, ErrorState, PageHeader, PageLoader, Spinner, StatusBadge, Tabs } from '../../components/ui'
import { formatDateTime, telHref } from '../../lib/format'

function Conversation({ id, onBack }) {
  const base = usePanelBase()
  const { data: t, isLoading, error, refetch } = useAdminTicketQuery(id, { pollingInterval: 15000 })
  const [reply, { isLoading: sending }] = useReplyTicketMutation()
  const [setStatus] = useSetTicketStatusMutation()
  const [text, setText] = useState('')
  const end = useRef(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [t?.messages?.length])

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const send = async (resolve) => {
    if (!text.trim()) return
    try {
      await reply({ id, text: text.trim(), resolve }).unwrap()
      setText('')
      toast.success(resolve ? 'Replied and resolved' : 'Reply sent')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="card flex h-[calc(100vh-12rem)] min-h-[28rem] flex-col">
      <div className="flex flex-wrap items-start gap-3 border-b border-line p-4">
        <button className="btn-ghost btn-sm -ml-2 px-2 lg:hidden" onClick={onBack} aria-label="Back to tickets">
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t.subject}</p>
          <p className="text-xs text-muted">
            {t.user?.name} · <span className="capitalize">{t.user?.role === 'delivery' ? 'Delivery partner' : t.user?.role}</span> ·{' '}
            {t.user?.phone ? (
              <a href={telHref(t.user.phone)} className="link">{t.user.phone}</a>
            ) : (
              t.user?.email && <a href={`mailto:${t.user.email}`} className="link">{t.user.email}</a>
            )}
            {t.order && (
              <>
                {' · '}
                <Link to={`${base}/orders/${t.order._id}`} className="link">
                  {t.order.orderNo}
                </Link>
              </>
            )}
          </p>
        </div>
        <StatusBadge status={t.status} />
        <button
          className="btn-outline btn-sm"
          onClick={() =>
            setStatus({ id, status: t.status === 'open' ? 'resolved' : 'open' })
              .unwrap()
              .then(() => toast.success(t.status === 'open' ? 'Ticket resolved' : 'Ticket reopened'))
              .catch((e) => toast.error(errorMessage(e)))
          }
        >
          {t.status === 'open' ? <CheckCircle2 className="size-4" /> : <RotateCcw className="size-4" />}
          {t.status === 'open' ? 'Resolve' : 'Reopen'}
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {t.messages.map((m) => {
          const staff = ['admin', 'superadmin'].includes(m.role)
          return (
            <div key={m._id} className={`flex ${staff ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${staff ? 'rounded-br-sm bg-primary text-on-primary' : 'rounded-bl-sm bg-surface-2'}`}>
                <p className={`mb-0.5 text-xs font-semibold ${staff ? 'text-on-primary/80' : 'text-muted'}`}>{m.name}</p>
                <p className="whitespace-pre-wrap">{m.text}</p>
                <p className={`mt-1 text-[10px] ${staff ? 'text-on-primary/70' : 'text-muted'}`}>{formatDateTime(m.at)}</p>
              </div>
            </div>
          )
        })}
        <div ref={end} />
      </div>
      <form
        className="border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault()
          send(false)
        }}
      >
        <textarea
          className="input resize-none"
          rows={2}
          placeholder="Type your reply…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(false)
          }}
        />
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn-outline btn-sm" disabled={!text.trim() || sending} onClick={() => send(true)}>
            Reply & resolve
          </button>
          <button className="btn-primary btn-sm" disabled={!text.trim() || sending}>
            {sending ? <Spinner className="size-4 text-current" /> : <Send className="size-4" />} Send
          </button>
        </div>
      </form>
    </div>
  )
}

export default function Tickets() {
  const [status, setStatus] = useState('open')
  const [selected, setSelected] = useState(null)
  const { data = [], isLoading, error, refetch } = useAdminTicketsQuery({ status }, { pollingInterval: 30000 })

  return (
    <div>
      <PageHeader title="Support tickets" subtitle="Help customers and delivery partners" />
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div className={selected ? 'hidden lg:block' : ''}>
          <div className="mb-3">
            <Tabs
              tabs={[
                { value: 'open', label: 'Open' },
                { value: 'resolved', label: 'Resolved' },
                { value: '', label: 'All' },
              ]}
              value={status}
              onChange={setStatus}
            />
          </div>
          {isLoading ? (
            <PageLoader />
          ) : error ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : !data.length ? (
            <div className="card">
              <EmptyState icon="🎧" title="No tickets" text={status === 'open' ? 'All caught up!' : undefined} />
            </div>
          ) : (
            <ul className="card divide-y divide-line overflow-hidden">
              {data.map((t) => (
                <li key={t._id}>
                  <button
                    className={`w-full px-4 py-3 text-left transition hover:bg-surface-2 ${selected === t._id ? 'bg-primary-soft' : ''}`}
                    onClick={() => setSelected(t._id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium">{t.subject}</p>
                      <StatusBadge status={t.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {t.user?.name} {t.user?.role === 'delivery' && '🛵'} · {formatDateTime(t.updatedAt)}
                    </p>
                    <p className="mt-1 line-clamp-1 text-sm text-muted">{t.messages.at(-1)?.text}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={selected ? '' : 'hidden lg:block'}>
          {selected ? (
            <Conversation key={selected} id={selected} onBack={() => setSelected(null)} />
          ) : (
            <div className="card">
              <EmptyState icon="💬" title="Select a ticket" text="Choose a ticket from the list to read and reply." />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
