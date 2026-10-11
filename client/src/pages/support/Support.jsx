import { ChevronDown, Mail, MessageCircle, Phone, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { errorMessage, useCreateTicketMutation, useMyOrdersQuery, useMyTicketsQuery, useSettingsQuery } from '../../app/api'
import PageHero from '../../components/PageHero'
import { EmptyState, ErrorState, Field, Modal, Skeleton, StatusBadge } from '../../components/ui'
import { PHOTOS } from '../../lib/images'
import { selectUser } from '../../features/auth/authSlice'
import { formatDate, formatDateTime, telHref } from '../../lib/format'

const FAQS = [
  ['What time is milk delivered?', 'Morning deliveries arrive between 6:00 and 8:00 AM, so fresh milk is at your door before breakfast. You can also pick the 8–10 AM or evening 5–7 PM slot at checkout.'],
  ['How does a milk subscription work?', 'Choose a product, quantity and schedule (every day, alternate days or selected weekdays). We deliver automatically every morning and pay from your Gavyora wallet, or collect cash if your wallet is low.'],
  ['Can I pause my subscription or go on vacation?', 'Yes. Open Subscriptions, choose the plan and tap Vacation mode to pause a date range, or Pause to stop until you resume. Changes made before 9 PM apply to the next morning.'],
  ['Can I change the quantity for just one day?', 'Yes. In your subscription, pick a date and set a different quantity, for example 2 packets for tomorrow because guests are coming.'],
  ['How do I cancel an order?', 'You can cancel from My orders until the order is packed. If you already paid online or with your wallet, the full amount goes back to your wallet instantly.'],
  ['How do refunds work?', 'Refunds are credited to your Gavyora wallet instantly and can be used on your next order or subscription. For a bank refund, raise a support ticket and we will process it in 5–7 working days.'],
  ['What if the milk or curd is spoiled or leaking?', 'Fresh dairy can be returned within 24 hours of delivery. Open the order and tap “Return / report a quality issue”, or raise a ticket with a photo, and we will refund or replace it.'],
  ['Which payment methods do you accept?', 'UPI, debit/credit cards, net banking and wallets through Razorpay, plus your Gavyora wallet and cash on delivery.'],
  ['Is cash on delivery available?', 'Yes, in all our serviceable pincodes. Please keep exact change ready. Subscription orders fall back to cash on delivery if your wallet balance is low.'],
  ['Do I need to return glass bottles?', 'Yes, please rinse the glass bottles and leave them outside your door. Our delivery partner will collect them on the next delivery.'],
  ['How long do your products stay fresh?', 'Pouch milk: 2 days refrigerated. Curd and paneer: about 5 days. Ghee: 9 months. Check the “best before” date on each pack and keep dairy refrigerated below 4°C.'],
  ['How do I change my delivery address?', 'Go to Account → Addresses to add or edit an address. For subscriptions, open the plan and choose a different address; it applies from the next delivery.'],
]

export default function Support() {
  const user = useSelector(selectUser)
  const { data: s } = useSettingsQuery()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [openIdx, setOpenIdx] = useState(0)
  const [modal, setModal] = useState(false)

  const orderParam = params.get('order') || ''
  const showModal = modal || (!!orderParam && !!user)

  const faqs = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? FAQS.filter(([a, b]) => (a + b).toLowerCase().includes(q)) : FAQS
  }, [query])

  // Contact options appear only for details set in Global settings; nothing is made up.
  const phone = s?.supportPhone
  const email = s?.supportEmail
  const whatsapp = telHref(phone).replace(/\D/g, '')

  return (
    <div className="container-page py-5 sm:py-8">
      <PageHero
        image={PHOTOS.breakfast}
        eyebrow="Help centre"
        title="How can we help you?"
        subtitle="Search our FAQs or reach our care team, 6 AM to 10 PM, every day."
        crumbs={[['Home', '/'], ['Help & support']]}
      >
        <div className="relative max-w-xl">
          <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            className="input py-3 pl-10"
            placeholder="Search e.g. refund, vacation, bottle"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search help articles"
          />
        </div>
      </PageHero>

      {(phone || email) && (
        <div className={`mt-6 grid gap-3 ${phone && email ? 'sm:grid-cols-3' : phone ? 'sm:grid-cols-2' : ''}`}>
          {phone && (
            <a href={telHref(phone)} className="card flex items-center gap-3 p-4 hover:border-accent">
              <Phone className="size-6 shrink-0 text-brand" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold">Call us</p>
                <p className="text-sm text-muted">{phone}</p>
              </div>
            </a>
          )}
          {phone && (
            <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="card flex items-center gap-3 p-4 hover:border-accent">
              <MessageCircle className="size-6 shrink-0 text-[#25D366]" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold">WhatsApp chat</p>
                <p className="text-sm text-muted">Message our care team</p>
              </div>
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="card flex items-center gap-3 p-4 hover:border-accent">
              <Mail className="size-6 shrink-0 text-accent" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold">Email</p>
                <p className="truncate text-sm text-muted">{email}</p>
              </div>
            </a>
          )}
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <section>
          <h2 className="mb-3 text-xl font-semibold">Frequently asked questions</h2>
          {faqs.length === 0 ? (
            <p className="card p-5 text-sm text-muted">No answers match “{query}”. Try another word, or raise a ticket and we'll help.</p>
          ) : (
            <div className="card divide-y divide-line">
              {faqs.map(([q, a], i) => (
                <div key={q}>
                  <button
                    className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left font-medium"
                    onClick={() => setOpenIdx(openIdx === i ? -1 : i)}
                    aria-expanded={openIdx === i}
                  >
                    {q}
                    <ChevronDown className={`size-4 shrink-0 transition ${openIdx === i ? 'rotate-180' : ''}`} />
                  </button>
                  {openIdx === i && <p className="px-4 pb-4 text-sm text-muted">{a}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        <aside>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">My tickets</h2>
            {user && (
              <button className="btn-primary btn-sm" onClick={() => setModal(true)}>
                <Plus className="size-4" /> Raise a ticket
              </button>
            )}
          </div>
          {user ? (
            <MyTickets />
          ) : (
            <div className="card p-5 text-center">
              <p className="text-sm text-muted">Log in to raise a ticket and track replies from our team.</p>
              <Link to="/login?next=/support" className="btn-primary mt-4">
                Log in
              </Link>
            </div>
          )}
        </aside>
      </div>

      {user && (
        <NewTicketModal
          key={orderParam}
          open={showModal}
          defaultOrder={orderParam}
          onClose={() => {
            setModal(false)
            if (orderParam) setParams({}, { replace: true })
          }}
        />
      )}
    </div>
  )
}

function MyTickets() {
  const { data = [], isLoading, error, refetch } = useMyTicketsQuery()
  if (isLoading) return <Skeleton className="h-40" />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (!data.length) return <EmptyState icon="💬" title="No tickets" text="Any issue you raise will appear here." />
  return (
    <ul className="card divide-y divide-line">
      {data.map((t) => (
        <li key={t._id}>
          <Link to={`/support/tickets/${t._id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{t.subject}</p>
              <p className="text-xs text-muted">Updated {formatDateTime(t.updatedAt)}</p>
            </div>
            <StatusBadge status={t.status} />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function NewTicketModal({ open, onClose, defaultOrder }) {
  const { data: orders = [] } = useMyOrdersQuery(undefined, { skip: !open })
  const [createTicket, { isLoading }] = useCreateTicketMutation()
  const navigate = useNavigate()
  const [form, setForm] = useState({ subject: '', order: defaultOrder, message: '' })

  const submit = async (e) => {
    e.preventDefault()
    try {
      const t = await createTicket({
        subject: form.subject.trim(),
        message: form.message.trim(),
        order: form.order || undefined,
      }).unwrap()
      toast.success('Ticket raised. We usually reply within a few hours.')
      setForm({ subject: '', order: '', message: '' })
      onClose()
      navigate(`/support/tickets/${t._id}`)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Raise a support ticket"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" form="ticket-form" disabled={isLoading}>
            {isLoading ? 'Sending…' : 'Submit ticket'}
          </button>
        </>
      }
    >
      <form id="ticket-form" onSubmit={submit} className="space-y-4">
        <Field label="Subject">
          <input
            className="input"
            required
            minLength={3}
            placeholder="e.g. Milk packet was leaking"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
          />
        </Field>
        <Field label="Related order (optional)">
          <select className="input" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })}>
            <option value="">Not about a specific order</option>
            {orders.map((o) => (
              <option key={o._id} value={o._id}>
                #{o.orderNo} · {formatDate(o.createdAt)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Describe the issue">
          <textarea
            className="input min-h-28"
            required
            minLength={3}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />
        </Field>
      </form>
    </Modal>
  )
}
