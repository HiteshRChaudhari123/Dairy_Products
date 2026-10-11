import { CalendarDays, Clock, MapPin, PauseCircle, PlayCircle, Plus, Settings2, Sunrise, Wallet } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import { errorMessage, useMySubscriptionsQuery, useSubscriptionHistoryQuery, useUpdateSubscriptionMutation } from '../../app/api'
import ProductImage from '../../components/ProductImage'
import { EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge, Tabs } from '../../components/ui'
import { selectUser } from '../../features/auth/authSlice'
import { formatMinor, scheduleText } from '../../lib/billing'
import { dayName, formatDate } from '../../lib/format'
import { PHOTOS, responsiveImage } from '../../lib/images'

const STEPS = [
  ['🥛', 'Pick a plan and products', 'Choose milk, curd, paneer and more, and how many of each.'],
  ['📅', 'Choose your days', 'Every day, alternate days, weekly or only the weekdays you want.'],
  ['🌅', 'Wake up to freshness', 'We deliver in your chosen morning slot. Pause or change any time before the cut-off.'],
]

const BENEFITS = [
  [PauseCircle, 'Pause or skip anytime', 'Going on a trip? Pause a date range in one tap.'],
  [CalendarDays, 'Change one day', 'Guests coming? Get extra for just one day.'],
  [Wallet, 'Clear billing', 'Prepaid balance or wallet auto-pay, with every payment and invoice in your account.'],
  [Sunrise, 'Always fresh', 'Milked at dawn and at your door within hours.'],
]

function Marketing() {
  return (
    <div className="container-page py-6">
      <section className="relative flex flex-col overflow-hidden rounded-3xl bg-night text-white md:min-h-[380px] md:justify-center">
        <div className="relative h-56 sm:h-72 md:absolute md:inset-y-0 md:right-0 md:h-auto md:w-1/2">
          <img {...responsiveImage(PHOTOS.milkPour, '(min-width: 768px) 50vw, 100vw')} alt="Milk being poured into a glass" fetchPriority="high" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 hidden bg-[linear-gradient(90deg,var(--color-night)_0%,transparent_14%)] md:block" />
        </div>
        <div className="relative max-w-xl px-6 py-10 sm:px-12 sm:py-14 md:max-w-[50%]">
          <span className="chip bg-secondary font-semibold text-on-secondary">Dairy subscriptions</span>
          <h1 className="mt-4 text-3xl leading-tight font-bold sm:text-4xl">Fresh dairy at your door, on your schedule</h1>
          <p className="mt-3 text-white/85">Set it once. Pause, skip or change whenever you like.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/plans?kind=product" className="btn-premium">
              See subscription plans
            </Link>
            <Link to="/plans?kind=membership" className="btn border border-white/40 text-white hover:bg-white/10">
              Memberships
            </Link>
          </div>
        </div>
      </section>

      <h2 className="mt-12 mb-5 text-center text-2xl font-bold">How it works</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {STEPS.map(([icon, title, text], i) => (
          <div key={title} className="card p-6 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary-soft text-3xl">{icon}</div>
            <p className="mt-3 text-xs font-semibold text-brand">STEP {i + 1}</p>
            <h3 className="mt-1 font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BENEFITS.map(([Icon, title, text]) => (
          <div key={title} className="flex gap-3">
            <Icon className="size-6 shrink-0 text-brand" />
            <div>
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-muted">{text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MiniCalendar({ upcoming }) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {upcoming.map((d) => (
        <div key={d.date} className={`rounded-lg py-1.5 text-center ${d.qty ? 'bg-primary-soft text-brand' : 'bg-surface-2 text-muted'}`} title={d.paused ? 'Paused' : d.holiday ? 'Holiday' : d.qty ? `${d.qty} item(s)` : 'No delivery'}>
          <p className="text-[10px] uppercase">{dayName(d.date)}</p>
          <p className="text-xs font-semibold">{Number(d.date.slice(8))}</p>
          <p className="text-[10px]">{d.paused ? '⏸' : d.qty ? `×${d.qty}` : '–'}</p>
        </div>
      ))}
    </div>
  )
}

function SubscriptionCard({ sub }) {
  const [update, { isLoading }] = useUpdateSubscriptionMutation()
  const canToggle = ['active', 'paused'].includes(sub.status)
  const toggle = async () => {
    const status = sub.status === 'paused' ? 'active' : 'paused'
    try {
      await update({ id: sub._id, status }).unwrap()
      toast.success(status === 'paused' ? 'Subscription paused' : 'Subscription resumed')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const first = sub.items[0]
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex gap-4">
        <div className="w-16 shrink-0 sm:w-20">
          <ProductImage product={first?.product} name={first?.productName} size="text-3xl" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{sub.plan?.name || sub.items.map((i) => i.productName).join(', ')}</h3>
            <StatusBadge status={sub.status} />
          </div>
          <p className="text-sm text-muted">
            {sub.items.map((i) => `${i.productName} ${i.variantLabel} ×${i.qty}`).join(' · ')}
          </p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3.5" /> {scheduleText(sub)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" /> {sub.slot}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="size-3.5" /> {sub.address?.pincode}
            </span>
          </p>
          <p className="mt-1 text-xs">
            {formatMinor(sub.perDeliveryMinor)} per delivery
            {sub.billingMode === 'prepaid' && (
              <>
                {' '}· Balance <b>{formatMinor(sub.prepaidBalanceMinor)}</b> ({sub.deliveriesLeft ?? 0} deliveries)
              </>
            )}
          </p>
        </div>
      </div>
      {sub.status === 'pending_payment' && <p className="mt-3 rounded-lg bg-secondary-soft p-2 text-xs">Waiting for payment confirmation. Deliveries start once it is confirmed.</p>}
      {sub.status === 'past_due' && <p className="mt-3 rounded-lg bg-error/10 p-2 text-xs text-error">Deliveries are on hold: the prepaid balance ran out. Top up to restart.</p>}
      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-muted">Next 7 days</p>
        <MiniCalendar upcoming={sub.upcoming} />
      </div>
      <div className="mt-4 flex gap-2">
        {canToggle && (
          <button className="btn-outline btn-sm flex-1" onClick={toggle} disabled={isLoading}>
            {sub.status === 'paused' ? <PlayCircle className="size-4" /> : <PauseCircle className="size-4" />}
            {sub.status === 'paused' ? 'Resume' : 'Pause'}
          </button>
        )}
        <Link to={`/subscriptions/${sub._id}`} className="btn-primary btn-sm flex-1">
          <Settings2 className="size-4" /> Manage
        </Link>
      </div>
    </div>
  )
}

function Past() {
  const { data = [], isLoading, error, refetch } = useSubscriptionHistoryQuery()
  if (isLoading) return <Skeleton className="h-32" />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (!data.length) return <EmptyState icon="🗂️" title="No past subscriptions" />
  return (
    <ul className="card divide-y divide-line">
      {data.map((s) => (
        <li key={s._id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
          <Link to={`/subscriptions/${s._id}`} className="min-w-0 hover:text-accent">
            <span className="block font-medium">{s.plan?.name || s.items?.map((i) => i.productName).join(', ')}</span>
            <span className="block text-xs text-muted">
              {s.code} · ended {formatDate(s.cancelledAt || s.updatedAt)}
              {s.cancelReason ? ` · ${s.cancelReason}` : ''}
            </span>
          </Link>
          <StatusBadge status={s.status} />
        </li>
      ))}
    </ul>
  )
}

export default function MySubscriptions() {
  const user = useSelector(selectUser)
  const [tab, setTab] = useState('current')
  const { data: subs = [], isLoading, error, refetch } = useMySubscriptionsQuery(undefined, { skip: !user })

  if (!user) return <Marketing />

  return (
    <div className="container-page py-6">
      <PageHeader
        title="My subscriptions"
        subtitle="Changes for tomorrow lock at tonight's cut-off"
        actions={
          <>
            <Link to="/account/membership" className="btn-outline">
              My membership
            </Link>
            <Link to="/plans?kind=product" className="btn-primary">
              <Plus className="size-4" /> New subscription
            </Link>
          </>
        }
      />
      <div className="mb-5">
        <Tabs
          tabs={[
            { value: 'current', label: 'Current' },
            { value: 'past', label: 'Past' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      {tab === 'past' ? (
        <Past />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : subs.length === 0 ? (
        <EmptyState icon="🥛" title="No subscriptions yet" text="Get fresh dairy delivered on your schedule. Pause or change anytime." action={<Link to="/plans?kind=product" className="btn-primary">See subscription plans</Link>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {subs.map((s) => (
            <SubscriptionCard key={s._id} sub={s} />
          ))}
        </div>
      )}
    </div>
  )
}
