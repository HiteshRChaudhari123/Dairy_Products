import { ArrowLeft, Send } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { Link, useParams } from 'react-router-dom'
import { errorMessage, useMyTicketQuery, useReplyMyTicketMutation } from '../../app/api'
import { ErrorState, PageLoader, StatusBadge } from '../../components/ui'
import { selectUser } from '../../features/auth/authSlice'
import { formatDateTime } from '../../lib/format'

export default function TicketDetail() {
  const { id } = useParams()
  const user = useSelector(selectUser)
  const { data: ticket, isLoading, error, refetch } = useMyTicketQuery(id, { pollingInterval: 20000 })
  const [reply, { isLoading: sending }] = useReplyMyTicketMutation()
  const [text, setText] = useState('')
  const end = useRef(null)

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [ticket?.messages?.length])

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const send = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    try {
      await reply({ id, text: text.trim() }).unwrap()
      setText('')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="container-page max-w-3xl py-6">
      <Link to="/support" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-accent">
        <ArrowLeft className="size-4" /> Help center
      </Link>
      <div className="card flex h-[calc(100vh-14rem)] min-h-[420px] flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate font-semibold">{ticket.subject}</h1>
            <p className="text-xs text-muted">Opened {formatDateTime(ticket.createdAt)}</p>
          </div>
          <StatusBadge status={ticket.status} />
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto bg-surface-2 p-4">
          {ticket.messages.map((m) => {
            const mine = String(m.from) === String(user?._id)
            return (
              <div key={m._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm sm:max-w-[70%] ${
                    mine ? 'rounded-br-sm bg-primary text-on-primary' : 'rounded-bl-sm bg-surface'
                  }`}
                >
                  {!mine && <p className="mb-0.5 text-xs font-semibold text-brand">{m.name || 'Gavyora support'}</p>}
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  <p className={`mt-1 text-right text-[10px] ${mine ? 'text-on-primary/70' : 'text-muted'}`}>{formatDateTime(m.at)}</p>
                </div>
              </div>
            )
          })}
          <div ref={end} />
        </div>

        <form onSubmit={send} className="flex gap-2 border-t border-line p-3">
          <input
            className="input"
            placeholder={ticket.status === 'resolved' ? 'Reply to reopen this ticket…' : 'Type your message…'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Message"
          />
          <button className="btn-primary px-4" disabled={sending || !text.trim()} aria-label="Send">
            <Send className="size-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
