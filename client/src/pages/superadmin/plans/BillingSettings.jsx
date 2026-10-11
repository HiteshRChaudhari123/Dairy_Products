import { CheckCircle2, CircleAlert, Play, Plus, Save, X } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { errorMessage, useBillingJobsQuery, useBillingSettingsQuery, useRunBillingJobMutation, useUpdateBillingSettingsMutation } from '../../../app/api'
import { ErrorState, Field, PageHeader, PageLoader, Spinner, StatusBadge } from '../../../components/ui'
import { formatMinor, fromMinor, toMinor } from '../../../lib/billing'
import { formatDate, formatDateTime } from '../../../lib/format'

const JOB_TEXT = {
  'deliveries.generate': "Creates tomorrow's subscription orders once the cut-off passes (every 10 min)",
  'memberships.cycle': 'Ends terms, auto-renews, grace periods, retries and reminders (hourly)',
  'checkouts.expire': 'Closes unpaid checkouts after the expiry window (every 15 min)',
  'subscriptions.low-balance': 'Warns prepaid subscribers with fewer than 3 deliveries left (daily 10 AM)',
  'orders.expire-unpaid': 'Cancels online store orders left unpaid past the checkout window and returns their stock (every 15 min)',
  'campaigns.send': 'Sends announcements from the Notifications page when their scheduled time comes (every 5 min)',
  'notifications.retry': 'Retries email/SMS/push sends that failed in the last 24 hours, up to 3 attempts (every 20 min)',
  'audit.retention': 'Deletes audit logs older than the retention period (daily)',
  'jobs.prune': 'Keeps the last 500 runs per job (weekly)',
}

function Jobs() {
  const { data = [], isLoading, error, refetch } = useBillingJobsQuery(undefined, { pollingInterval: 30000 })
  const [run, { isLoading: running, originalArgs }] = useRunBillingJobMutation()
  if (isLoading) return <Spinner />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  return (
    <ul className="divide-y divide-line">
      {data.map((j) => {
        const last = j.runs[0]
        return (
          <li key={j.name} className="flex flex-wrap items-start gap-3 py-3">
            {last ? last.ok === false ? <CircleAlert className="mt-0.5 size-5 text-error" /> : <CheckCircle2 className="mt-0.5 size-5 text-success" /> : <span className="size-5" />}
            <div className="min-w-0 flex-1">
              <p className="font-mono text-sm">{j.name}</p>
              <p className="text-xs text-muted">{JOB_TEXT[j.name]}</p>
              <p className="text-xs text-muted">
                {last ? `Last run ${formatDateTime(last.startedAt)}${last.error ? ` · failed: ${last.error}` : last.result ? ` · ${JSON.stringify(last.result).slice(0, 120)}` : ''}` : 'Not run yet since start'}
              </p>
            </div>
            <button
              type="button"
              className="btn-outline btn-sm"
              disabled={running}
              onClick={() =>
                run(j.name)
                  .unwrap()
                  .then((r) => toast.success(`${j.name}: ${JSON.stringify(r.result).slice(0, 100)}`))
                  .catch((e) => toast.error(errorMessage(e)))
              }
            >
              {running && originalArgs === j.name ? <Spinner className="size-4" /> : <Play className="size-4" />} Run now
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export default function BillingSettings() {
  const { data, isLoading, error, refetch } = useBillingSettingsQuery()
  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  return <Form key={JSON.stringify(data.billing)} data={data} />
}

function Form({ data }) {
  const b = data.billing
  const [save, { isLoading }] = useUpdateBillingSettingsMutation()
  const [form, setForm] = useState({
    invoicePrefix: b.invoicePrefix || 'GV',
    deliveryCutoff: b.deliveryCutoff || '21:00',
    holidays: b.holidays || [],
    refundLimit: fromMinor(b.refundApprovalLimitMinor),
    reminderDays: (b.reminderDays || []).join(', '),
    checkoutExpiryMinutes: b.checkoutExpiryMinutes || 60,
    auditRetentionDays: b.auditRetentionDays || 0,
    templates: Object.fromEntries(Object.keys(data.defaults.notificationTemplates).map((k) => [k, { title: b.notificationTemplates?.[k]?.title || '', body: b.notificationTemplates?.[k]?.body || '' }])),
  })
  const [holiday, setHoliday] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const g = data.gateway

  const submit = async (e) => {
    e.preventDefault()
    const reminderDays = form.reminderDays.split(/[\s,]+/).filter(Boolean).map(Number)
    if (reminderDays.some((n) => !Number.isInteger(n) || n < 1 || n > 60)) return toast.error('Reminder days must be whole numbers from 1 to 60')
    try {
      await save({
        invoicePrefix: form.invoicePrefix.trim().toUpperCase(),
        deliveryCutoff: form.deliveryCutoff,
        holidays: form.holidays,
        refundApprovalLimitMinor: toMinor(form.refundLimit),
        reminderDays,
        checkoutExpiryMinutes: Number(form.checkoutExpiryMinutes),
        auditRetentionDays: Number(form.auditRetentionDays),
        notificationTemplates: form.templates,
      }).unwrap()
      toast.success('Billing settings saved')
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6 pb-10">
      <PageHeader
        title="Billing & subscription settings"
        subtitle="Rules for memberships, subscriptions, payments and deliveries. Currency: INR. Store GST and fees are under Global settings."
        actions={
          <button className="btn-primary" disabled={isLoading}>
            <Save className="size-4" /> Save
          </button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card space-y-4 p-5">
          <h2 className="font-semibold">Payment gateway</h2>
          <dl className="space-y-2 text-sm">
            {[
              ['Provider', 'Razorpay'],
              ['API keys', g.configured ? `Configured (${g.keyMode} mode)` : 'Not configured: online payment is off'],
              ['Webhook secret', g.webhookConfigured ? 'Configured' : 'Not configured: webhooks are rejected'],
              ['Webhook URL', `https://<your-api-domain>${g.webhookUrl}`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right font-medium break-all">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">Keys are set only in server/.env (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET) and are never sent to the browser. Webhook events to enable: payment.captured, order.paid, payment.failed, refund.processed, refund.failed.</p>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="font-semibold">Billing rules</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Invoice prefix" hint={`Next numbers look like ${form.invoicePrefix || 'GV'}/25-26/000001`}>
              <input className="input uppercase" maxLength={10} value={form.invoicePrefix} onChange={(e) => set('invoicePrefix', e.target.value)} />
            </Field>
            <Field label="Admin refund approval limit (₹)" hint={`Refunds above ${formatMinor(toMinor(form.refundLimit))} need a super admin`}>
              <input type="number" min="0" className="input" value={form.refundLimit} onChange={(e) => set('refundLimit', e.target.value)} />
            </Field>
            <Field label="Renewal reminder days" hint="Days before a term ends, comma separated">
              <input className="input" value={form.reminderDays} onChange={(e) => set('reminderDays', e.target.value)} />
            </Field>
            <Field label="Unpaid checkout expiry (minutes)">
              <input type="number" min="10" max="1440" className="input" value={form.checkoutExpiryMinutes} onChange={(e) => set('checkoutExpiryMinutes', e.target.value)} />
            </Field>
            <Field label="Audit log retention (days)" hint="0 keeps logs forever; minimum 90">
              <input type="number" min="0" className="input" value={form.auditRetentionDays} onChange={(e) => set('auditRetentionDays', e.target.value)} />
            </Field>
          </div>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="font-semibold">Delivery calendar</h2>
          <Field label="Daily cut-off (IST)" hint="Tomorrow's deliveries lock and are generated at this time">
            <input type="time" className="input w-40" value={form.deliveryCutoff} onChange={(e) => set('deliveryCutoff', e.target.value)} />
          </Field>
          <div>
            <span className="label">Holidays (no deliveries)</span>
            <div className="flex gap-2">
              <input type="date" className="input w-auto" value={holiday} onChange={(e) => setHoliday(e.target.value)} />
              <button type="button" className="btn-outline" disabled={!holiday} onClick={() => {
                  set('holidays', [...new Set([...form.holidays, holiday])].sort())
                  setHoliday('')
                }}>
                <Plus className="size-4" /> Add
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {form.holidays.map((d) => (
                <span key={d} className="chip bg-surface-2 py-1">
                  {formatDate(d + 'T00:00:00')}
                  <button type="button" onClick={() => set('holidays', form.holidays.filter((x) => x !== d))} aria-label={`Remove ${d}`}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              {!form.holidays.length && <span className="text-xs text-muted">No holidays set.</span>}
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-2 font-semibold">Background jobs</h2>
          <p className="mb-2 text-xs text-muted">Run automatically on the server (IST). Each run is locked so only one server runs it, and is safe to repeat.</p>
          <Jobs />
        </section>
      </div>

      <section className="card p-5">
        <h2 className="font-semibold">Notification templates</h2>
        <p className="mb-4 text-xs text-muted">Leave blank to use the default wording. Placeholders like {'{{plan}}'} are filled in automatically. In-app notifications always send; SMS / email / push send once a provider is connected.</p>
        <div className="grid gap-4 lg:grid-cols-2">
          {Object.entries(data.defaults.notificationTemplates).map(([k, def]) => (
            <div key={k} className="rounded-xl border border-line p-3">
              <div className="mb-2 flex items-center justify-between">
                <code className="text-xs">{k}</code>
                {(form.templates[k].title || form.templates[k].body) && <StatusBadge status="active" label="Custom" />}
              </div>
              <input className="input mb-2" placeholder={def.title} value={form.templates[k].title} onChange={(e) => set('templates', { ...form.templates, [k]: { ...form.templates[k], title: e.target.value } })} aria-label={`${k} title`} />
              <textarea className="input min-h-16" placeholder={def.body} value={form.templates[k].body} onChange={(e) => set('templates', { ...form.templates, [k]: { ...form.templates[k], body: e.target.value } })} aria-label={`${k} body`} />
            </div>
          ))}
        </div>
      </section>
    </form>
  )
}
