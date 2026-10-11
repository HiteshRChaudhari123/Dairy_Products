import { ArrowLeft, ChevronDown, MessageSquarePlus, Phone, Send } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import {
  errorMessage,
  useCreateTicketMutation,
  useMyTicketQuery,
  useMyTicketsQuery,
  useReplyMyTicketMutation,
  useSettingsQuery,
} from '../../app/api'
import { EmptyState, ErrorState, Field, Modal, PageHeader, Spinner, StatusBadge } from '../../components/ui'
import { selectUser } from '../../features/auth/authSlice'
import { formatDateTime, telHref } from '../../lib/format'

const FAQ = [
  ['When do I get paid?', 'Earnings are calculated per delivered order and paid every week to the bank account on your profile. You can see pending payouts on the Earnings tab.'],
  ['How do I deposit COD cash?', 'Deposit all cash collected on COD orders at the warehouse counter at the end of each shift. The store team will give you a receipt.'],
  ['The customer says they did not get an OTP', "The OTP is shown in the customer's order page in the Gavyora app/website. If they still can't find it, call support and we'll verify the delivery for you."],
  ['The customer is not available', 'Call the customer twice and wait 5 minutes. If they still do not answer, raise a ticket with the order number and bring the items back to the warehouse.'],
  ['A product is damaged or leaking', 'Do not hand over damaged items. Take a photo, raise a ticket with the order number, and return the item to the warehouse.'],
]

function Thread({ id, onBack }) {
  const { data: t, isLoading, error, refetch } = useMyTicketQuery(id)
  const [reply, { isLoading: sending }] = useReplyMyTicketMutation()
  const [text, setText] = useState('')
  const me = useSelector(selectUser)

  const send = async (e) => {
    e.preventDefault()
    try {
      await reply({ id, text }).unwrap()
      setText('')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="card p-4">
      <button className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-accent" onClick={onBack}>
        <ArrowLeft className="size-4" /> All tickets
      </button>
      {error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading || !t ? (
        <div className="py-10 text-center"><Spinner /></div>
      ) : (
        <>
          <div className="mb-4 flex items-start justify-between gap-2">
            <h2 className="font-semibold">{t.subject}</h2>
            <StatusBadge status={t.status} />
          </div>
          <ul className="space-y-3">
            {t.messages.map((m, i) => {
              const mine = m.from === me?._id
              return (
                <li key={i} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${mine ? 'bg-primary text-on-primary' : 'bg-surface-2'}`}>
                    {!mine && <p className="mb-0.5 text-xs font-semibold text-brand">{m.name}</p>}
                    <p className="whitespace-pre-line">{m.text}</p>
                    <p className={`mt-1 text-[10px] ${mine ? 'text-on-primary/70' : 'text-muted'}`}>{formatDateTime(m.at)}</p>
                  </div>
                </li>
              )
            })}
          </ul>
          <form onSubmit={send} className="mt-4 flex gap-2">
            <input className="input" placeholder="Type a reply…" value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn-primary px-4" disabled={!text.trim() || sending} aria-label="Send">
              <Send className="size-4" />
            </button>
          </form>
        </>
      )}
    </div>
  )
}

export default function Support() {
  const { data: settings } = useSettingsQuery()
  const { data: tickets = [], isLoading, error: ticketsError, refetch } = useMyTicketsQuery()
  const [create, { isLoading: creating }] = useCreateTicketMutation()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState({ subject: '', message: '' })

  const submit = async (e) => {
    e.preventDefault()
    try {
      const t = await create(form).unwrap()
      toast.success('Ticket raised. We will get back to you soon.')
      setOpen(false)
      setForm({ subject: '', message: '' })
      setSelected(t._id)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Support" subtitle="We're here to help you on the road." />

      {settings?.supportPhone && (
        <a href={telHref(settings.supportPhone)} className="flex items-center gap-4 rounded-2xl bg-error p-4 text-white">
          <Phone className="size-7 shrink-0" aria-hidden />
          <span>
            <span className="block font-semibold">Emergency / urgent help</span>
            <span className="block text-sm text-white/85">Call {settings.supportPhone}</span>
          </span>
        </a>
      )}

      <section>
        <h2 className="mb-3 font-semibold">Common questions</h2>
        <div className="card divide-y divide-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium">
                {q}
                <ChevronDown className="size-4 shrink-0 transition group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-sm text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">My tickets</h2>
          <button className="btn-primary btn-sm" onClick={() => setOpen(true)}>
            <MessageSquarePlus className="size-4" /> Raise ticket
          </button>
        </div>
        {selected ? (
          <Thread id={selected} onBack={() => setSelected(null)} />
        ) : ticketsError ? (
          <ErrorState error={ticketsError} onRetry={refetch} />
        ) : isLoading ? (
          <div className="py-10 text-center"><Spinner /></div>
        ) : tickets.length === 0 ? (
          <div className="card">
            <EmptyState icon="💬" title="No tickets yet" text="Raise a ticket for payout, order or app issues." />
          </div>
        ) : (
          <ul className="space-y-2">
            {tickets.map((t) => (
              <li key={t._id}>
                <button onClick={() => setSelected(t._id)} className="card flex w-full items-center justify-between gap-3 p-4 text-left hover:border-accent">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{t.subject}</span>
                    <span className="block text-xs text-muted">
                      {t.messages.length} message{t.messages.length > 1 ? 's' : ''} · {formatDateTime(t.updatedAt)}
                    </span>
                  </span>
                  <StatusBadge status={t.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Raise a support ticket"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary" form="ticket-form" disabled={creating}>Submit</button>
          </>
        }
      >
        <form id="ticket-form" onSubmit={submit} className="space-y-4">
          <Field label="Subject">
            <input className="input" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} required minLength={3} placeholder="e.g. Payout not received for last week" />
          </Field>
          <Field label="Describe the issue" hint="Include the order number if it's about a delivery">
            <textarea className="input min-h-32" value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} required minLength={3} />
          </Field>
        </form>
      </Modal>
    </div>
  )
}
