import { Activity, CheckCircle2, Circle, Clock, Cpu, Database, Package, RefreshCw, ShoppingBag, Users } from 'lucide-react'
import { useState } from 'react'
import { useSystemHealthQuery } from '../../app/api'
import { PageHeader, StatCard } from '../../components/ui'
import { loadList, save } from '../../lib/storage'

const INTEGRATIONS = [
  ['MongoDB Atlas', 'Production database', 'MONGO_URI'],
  ['Razorpay', 'UPI, cards, wallets, webhooks', 'RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET'],
  ['Cloudinary', 'Product photos, KYC documents', 'CLOUDINARY_URL'],
  ['MSG91 / Twilio', 'OTP and order SMS', 'MSG91_AUTH_KEY or TWILIO_*'],
  ['Firebase Cloud Messaging', 'Push notifications (app)', 'FIREBASE_SERVICE_ACCOUNT'],
  ['Google Maps', 'Address pins, live tracking, routing', 'GOOGLE_MAPS_API_KEY'],
  ['Email (Resend / SMTP)', 'Invoices, password reset', 'RESEND_API_KEY or SMTP_*'],
]

const LAUNCH = [
  'Buy gavyora.com, gavyora.in and gavyora.co.in (auto-renew + domain lock)',
  'Point the domain to Vercel and enable SSL (HTTPS)',
  'File trademark (Class 29 + 35) on IP India',
  'FSSAI licence number added in Global settings',
  'GST registration and GSTIN added in Global settings',
  'Legal pages reviewed (terms, privacy, refund, shipping)',
  'Razorpay live keys + webhook configured',
  'MongoDB Atlas production cluster with backups',
  'Android app published on Google Play',
  'iOS app published on the App Store',
]

function uptime(sec) {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`].filter(Boolean).join(' ')
}

export default function System() {
  const { data, error, isFetching, refetch, fulfilledTimeStamp } = useSystemHealthQuery(undefined, { pollingInterval: 10000 })
  const [done, setDone] = useState(() => loadList('gv_launch_checklist'))
  const toggle = (item) => {
    const next = done.includes(item) ? done.filter((d) => d !== item) : [...done, item]
    setDone(next)
    save('gv_launch_checklist', next)
  }
  const up = !!data && !error

  return (
    <div>
      <PageHeader
        title="System health"
        subtitle={fulfilledTimeStamp ? `Checked ${new Date(fulfilledTimeStamp).toLocaleTimeString('en-IN')} · refreshes every 10s` : 'Checking…'}
        actions={
          <button className="btn-outline btn-sm" onClick={refetch} disabled={isFetching}>
            <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
        }
      />

      <div className={`card mb-6 flex items-center gap-3 p-4 ${up ? 'border-gold-line' : 'border-error/40'}`}>
        <span className="relative flex size-3">
          {up && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />}
          <span className={`relative inline-flex size-3 rounded-full ${up ? 'bg-success' : 'bg-error'}`} />
        </span>
        <p className="font-medium">{up ? 'API is online and responding' : error ? 'API is not responding' : 'Checking API…'}</p>
      </div>

      {data && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Clock} label="Uptime" value={uptime(data.uptimeSeconds)} />
          <StatCard icon={Activity} label="Node.js" value={data.node} tone="accent" />
          <StatCard icon={Cpu} label="Memory" value={`${data.memoryMB} MB`} tone="secondary" />
          <StatCard icon={Database} label="Database" value="Connected" tone="primary" />
          <StatCard icon={Users} label="Users" value={data.counts.users} />
          <StatCard icon={Package} label="Products" value={data.counts.products} tone="secondary" />
          <StatCard icon={ShoppingBag} label="Orders" value={data.counts.orders} tone="accent" />
          <StatCard icon={RefreshCw} label="Subscriptions" value={data.counts.subscriptions} />
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="card p-5">
          <h2 className="font-semibold">Integrations checklist</h2>
          <p className="mb-4 text-sm text-muted">Secrets never leave the server. Add each key to <code className="rounded bg-surface-2 px-1">server/.env</code>, then restart the API.</p>
          <ul className="divide-y divide-line">
            {INTEGRATIONS.map(([name, use, env]) => (
              <li key={name} className="flex items-start gap-3 py-3">
                <Circle className="mt-0.5 size-5 shrink-0 text-muted" />
                <div className="min-w-0">
                  <p className="font-medium">{name}</p>
                  <p className="text-sm text-muted">{use}</p>
                  <code className="mt-1 block text-xs break-all text-brand">{env}</code>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Launch readiness</h2>
            <span className="chip bg-primary-soft text-brand">
              {done.length}/{LAUNCH.length} done
            </span>
          </div>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(done.length / LAUNCH.length) * 100}%` }} />
          </div>
          <ul className="space-y-1">
            {LAUNCH.map((item) => {
              const on = done.includes(item)
              return (
                <li key={item}>
                  <button onClick={() => toggle(item)} className="flex w-full items-start gap-3 rounded-lg p-2 text-left text-sm hover:bg-surface-2">
                    {on ? <CheckCircle2 className="size-5 shrink-0 text-brand" /> : <Circle className="size-5 shrink-0 text-muted" />}
                    <span className={on ? 'text-muted line-through' : ''}>{item}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}
