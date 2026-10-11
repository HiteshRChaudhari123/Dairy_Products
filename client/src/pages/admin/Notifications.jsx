import { Bell, CalendarClock, Send, Users, XCircle } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { errorMessage, useCampaignAudienceQuery, useCampaignsQuery, useCancelCampaignMutation, useCreateCampaignMutation, useZonesQuery } from '../../app/api'
import { LogoMark } from '../../components/Logo'
import { EmptyState, ErrorState, Field, Modal, PageHeader, Skeleton } from '../../components/ui'
import { formatDateTime } from '../../lib/format'

const AUDIENCES = [
  ['all', 'All customers'],
  ['subscribers', 'Subscribers & members'],
  ['inactive', 'No order in 30 days'],
  ['zone', 'Customers in a zone'],
  ['delivery', 'Delivery partners'],
]
const CHANNELS = [
  ['push', 'Push'],
  ['sms', 'SMS'],
  ['email', 'Email'],
]
const STATUS = {
  scheduled: ['Scheduled', 'bg-accent-soft text-brand'],
  sending: ['Sending', 'bg-secondary-soft text-warning'],
  sent: ['Sent', 'bg-success/10 text-success'],
  cancelled: ['Cancelled', 'bg-surface-2 text-muted'],
  failed: ['Failed', 'bg-error/10 text-error'],
}
const EMPTY = { audience: 'all', zone: '', channels: [], title: '', body: '', link: '', scheduleAt: '' }
const SMS_LENGTH = 160

function PhonePreview({ title, body }) {
  return (
    <div className="mx-auto w-full max-w-[280px] rounded-[2.2rem] border-8 border-night bg-night p-3 pt-8 shadow-xl" aria-hidden="true">
      <p className="mb-6 text-center text-xs text-white/70">Preview</p>
      <div className="rounded-2xl bg-white/90 p-3 text-night shadow backdrop-blur">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] text-night/60 uppercase">
          <LogoMark className="size-4" /> Gavyora · now
        </div>
        <p className="text-sm font-semibold">{title || 'Notification title'}</p>
        <p className="line-clamp-3 text-xs">{body || 'Your message will appear here.'}</p>
      </div>
      <div className="h-40" />
    </div>
  )
}

function AudienceCount({ audience, zone }) {
  const skip = audience === 'zone' && !zone
  const { data, isFetching, error } = useCampaignAudienceQuery({ audience, zone }, { skip })
  if (skip) return <span className="text-muted">Choose a zone</span>
  if (error) return <span className="text-error">{errorMessage(error)}</span>
  if (isFetching || !data) return <Skeleton className="inline-block h-4 w-16 align-middle" />
  return (
    <span>
      <b>{data.count.toLocaleString('en-IN')}</b> {data.count === 1 ? 'person' : 'people'}
    </span>
  )
}

function CampaignRow({ c }) {
  const [cancel, { isLoading }] = useCancelCampaignMutation()
  const [label, tone] = STATUS[c.status] || [c.status, 'bg-surface-2']
  const audience = AUDIENCES.find((a) => a[0] === c.audience)?.[1]
  const results = Object.entries(c.results || {})
  return (
    <li className="card flex items-start gap-3 p-4">
      <Bell className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{c.title}</p>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
        </div>
        <p className="line-clamp-2 text-sm text-muted">{c.body}</p>
        <p className="mt-1 text-xs text-muted">
          {audience}
          {c.zone?.name ? ` (${c.zone.name})` : ''} · {c.recipients} recipients · in-app{c.channels?.length ? ` + ${c.channels.join(', ')}` : ''} ·{' '}
          {c.status === 'scheduled' ? `sends ${formatDateTime(c.scheduleAt)}` : c.sentAt ? `sent ${formatDateTime(c.sentAt)}` : `created ${formatDateTime(c.createdAt)}`} · by {c.createdBy?.name}
        </p>
        {results.length > 0 && (
          <p className="mt-1 text-xs">
            {results.map(([ch, r]) => `${ch}: ${r.delivered} delivered${r.failed ? `, ${r.failed} failed` : ''}${r.skipped ? `, ${r.skipped} skipped` : ''}`).join(' · ')}
          </p>
        )}
        {c.error && <p className="mt-1 text-xs text-error">{c.error}</p>}
      </div>
      {c.status === 'scheduled' && (
        <button
          className="btn-ghost btn-sm px-2 text-error"
          disabled={isLoading}
          onClick={() =>
            cancel(c._id)
              .unwrap()
              .then(() => toast.success('Campaign cancelled'))
              .catch((e) => toast.error(errorMessage(e)))
          }
          aria-label={`Cancel campaign ${c.title}`}
        >
          <XCircle className="size-4" /> Cancel
        </button>
      )}
    </li>
  )
}

export default function Notifications() {
  const [form, setForm] = useState(EMPTY)
  const [confirming, setConfirming] = useState(false)
  const { data, isLoading, error, refetch } = useCampaignsQuery(undefined, { pollingInterval: 15000 })
  const { data: zones = [] } = useZonesQuery()
  const [create, { isLoading: sending }] = useCreateCampaignMutation()
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const providers = data?.providers || {}
  const offline = form.channels.filter((c) => !providers[c])

  const review = (e) => {
    e.preventDefault()
    if (form.title.trim().length < 3 || form.body.trim().length < 3) return toast.error('Add a title and a message (at least 3 characters each)')
    if (form.audience === 'zone' && !form.zone) return toast.error('Choose a zone')
    if (form.scheduleAt && new Date(form.scheduleAt) < new Date()) return toast.error('Choose a time in the future')
    setConfirming(true)
  }

  const send = async () => {
    try {
      await create({
        audience: form.audience,
        ...(form.audience === 'zone' ? { zone: form.zone } : {}),
        title: form.title.trim(),
        body: form.body.trim(),
        link: form.link.trim(),
        channels: form.channels,
        ...(form.scheduleAt ? { scheduleAt: new Date(form.scheduleAt).toISOString() } : {}),
      }).unwrap()
      toast.success(form.scheduleAt ? 'Campaign scheduled' : 'Sending now. Progress shows below.')
      setForm(EMPTY)
      setConfirming(false)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div>
      <PageHeader title="Notifications" subtitle="Send an announcement to a group of customers or delivery partners. It always appears in their in-app notifications." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <form onSubmit={review} className="card space-y-4 p-4 sm:p-5" noValidate>
          <fieldset>
            <legend className="label">Audience</legend>
            <div className="grid grid-cols-1 gap-2 xs:grid-cols-2">
              {AUDIENCES.map(([v, label]) => (
                <button
                  type="button"
                  key={v}
                  aria-pressed={form.audience === v}
                  onClick={() => set('audience', v)}
                  className={`min-h-11 rounded-xl border px-3 py-2.5 text-left text-sm transition ${form.audience === v ? 'border-gold bg-selected font-semibold text-brand' : 'border-line hover:border-accent'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {form.audience === 'zone' && (
              <Field label="Zone" className="mt-3">
                <select className="input" value={form.zone} onChange={(e) => set('zone', e.target.value)}>
                  <option value="">Choose a zone</option>
                  {zones.map((z) => (
                    <option key={z._id} value={z._id}>
                      {z.name} ({z.branch})
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <p className="mt-2 flex items-center gap-1.5 text-sm" aria-live="polite">
              <Users className="size-4 text-muted" aria-hidden="true" /> <AudienceCount audience={form.audience} zone={form.zone} />
            </p>
          </fieldset>

          <fieldset>
            <legend className="label">Also send by</legend>
            <div className="flex flex-wrap gap-4">
              {CHANNELS.map(([c, label]) => (
                <label key={c} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={form.channels.includes(c)}
                    onChange={(e) => set('channels', e.target.checked ? [...form.channels, c] : form.channels.filter((x) => x !== c))}
                  />
                  {label}
                  {data && !providers[c] && <span className="text-xs text-muted">(not connected)</span>}
                </label>
              ))}
            </div>
            {offline.length > 0 && (
              <p className="mt-1 text-xs text-muted">
                No {offline.join('/')} provider is connected yet, so those messages will be recorded as skipped. In-app delivery still happens.
              </p>
            )}
          </fieldset>

          <Field label="Title">
            <input className="input" maxLength={65} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Fresh A2 milk is back" />
          </Field>
          <Field label="Message" hint={`${form.body.length}/500 characters${form.channels.includes('sms') ? ` · ${Math.max(1, Math.ceil(form.body.length / SMS_LENGTH))} SMS each` : ''}`}>
            <textarea className="input" rows={4} maxLength={500} value={form.body} onChange={(e) => set('body', e.target.value)} placeholder="Subscribe this week and get 10% off your first month with code FRESH10." />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Open link (optional)" hint="A site path like /deals, or an https:// link">
              <input className="input" value={form.link} onChange={(e) => set('link', e.target.value)} />
            </Field>
            <Field label="Schedule (optional)" hint="Leave empty to send now">
              <input type="datetime-local" className="input" value={form.scheduleAt} onChange={(e) => set('scheduleAt', e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end">
            <button className="btn-primary">
              {form.scheduleAt ? <CalendarClock className="size-4" /> : <Send className="size-4" />} {form.scheduleAt ? 'Review & schedule' : 'Review & send'}
            </button>
          </div>
        </form>
        <div>
          <PhonePreview title={form.title} body={form.body} />
        </div>
      </div>

      <h2 className="mt-8 mb-3 font-semibold">Recent campaigns</h2>
      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : error ? (
        <div className="card">
          <ErrorState error={error} onRetry={refetch} />
        </div>
      ) : !data.items.length ? (
        <div className="card">
          <EmptyState icon="📣" title="No campaigns yet" text="Announcements you send or schedule will appear here with their delivery results." />
        </div>
      ) : (
        <ul className="space-y-3">
          {data.items.map((c) => (
            <CampaignRow key={c._id} c={c} />
          ))}
        </ul>
      )}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={form.scheduleAt ? 'Schedule this announcement?' : 'Send this announcement now?'}
        size="max-w-md"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setConfirming(false)}>
              Back
            </button>
            <button className="btn-primary" onClick={send} disabled={sending}>
              {form.scheduleAt ? 'Schedule' : 'Send now'}
            </button>
          </>
        }
      >
        <p className="text-sm">
          <b>{form.title}</b> goes to <AudienceCount audience={form.audience} zone={form.zone} /> ({AUDIENCES.find((a) => a[0] === form.audience)?.[1].toLowerCase()}) in-app
          {form.channels.length ? ` and by ${form.channels.join(', ')}` : ''}
          {form.scheduleAt ? ` on ${formatDateTime(form.scheduleAt)}` : ''}. Messages can't be recalled once sent.
        </p>
      </Modal>
    </div>
  )
}
