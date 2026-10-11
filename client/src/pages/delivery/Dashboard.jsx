import { Banknote, CheckCircle2, ChevronRight, Clock, IndianRupee, MapPin, Navigation, Package, Phone, Star, XCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { Link } from 'react-router-dom'
import { errorMessage, useDeliveryOnlineMutation, useDeliveryOrdersQuery, useDeliverySummaryQuery } from '../../app/api'
import { ErrorState, PageLoader, StatCard, StatusBadge } from '../../components/ui'
import { selectUser } from '../../features/auth/authSlice'
import { formatINR, telHref } from '../../lib/format'
import { PHOTOS, responsiveImage } from '../../lib/images'
import { addressText, byStop, navigateUrl, toCollect } from './helpers'

function KycScreen({ status, note }) {
  const rejected = status === 'rejected'
  const steps = [
    ['Application submitted', true],
    ['Documents verified by our team', false],
    ['Zone assigned & account activated', false],
  ]
  return (
    <div className="mx-auto max-w-lg py-6 text-center">
      <div className={`mx-auto flex size-20 items-center justify-center rounded-full ${rejected ? 'bg-error/10 ' : 'bg-secondary-soft'}`}>
        {rejected ? <XCircle className="size-10 text-error" /> : <Clock className="size-10 text-warning" />}
      </div>
      <h1 className="mt-5 text-2xl font-bold">{rejected ? 'KYC needs attention' : 'Your application is under review'}</h1>
      <p className="mt-2 text-muted">
        {rejected
          ? 'We could not verify some of your details. Please update them and resubmit.'
          : 'We usually verify new partners within 24–48 hours. You will be able to take deliveries once approved.'}
      </p>
      {rejected && note && <p className="mt-4 rounded-xl bg-error/10 p-3 text-sm text-error ">Reason: {note}</p>}
      {!rejected && (
        <ol className="card mt-6 space-y-4 p-5 text-left">
          {steps.map(([label, done]) => (
            <li key={label} className="flex items-center gap-3">
              {done ? <CheckCircle2 className="size-6 text-brand" /> : <span className="size-6 rounded-full border-2 border-line" />}
              <span className={done ? 'font-medium' : 'text-muted'}>{label}</span>
            </li>
          ))}
        </ol>
      )}
      <Link to="/delivery/profile" className="btn-primary mt-6">
        {rejected ? 'Update KYC details' : 'View my profile'}
      </Link>
    </div>
  )
}

export default function Dashboard() {
  const user = useSelector(selectUser)
  const { data, isLoading, error, refetch } = useDeliverySummaryQuery(undefined, { pollingInterval: 30000 })
  const approved = data?.kycStatus === 'approved'
  const { data: orders = [] } = useDeliveryOrdersQuery('active', { skip: !approved, pollingInterval: 30000 })
  const [setOnline, { isLoading: switching }] = useDeliveryOnlineMutation()

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />
  if (!approved) return <KycScreen status={data.kycStatus} note={user?.delivery?.kycNote} />

  const toggle = async () => {
    try {
      await setOnline(!data.isOnline).unwrap()
      toast.success(data.isOnline ? 'You are offline' : 'You are online, ready for deliveries')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const next = [...orders].sort((a, b) => (a.status === 'out_for_delivery' ? -1 : b.status === 'out_for_delivery' ? 1 : byStop(a, b)))[0]
  const codPending = orders.reduce((s, o) => s + toCollect(o), 0)
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl bg-primary-dark p-5 text-white sm:p-7">
        <img {...responsiveImage(PHOTOS.delivery, '(min-width: 1024px) calc(100vw - 256px), 100vw')} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-night via-night/85 to-night/25" />
        <div className="relative">
          <p className="text-sm text-white/80">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
            {greet}, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="mt-1 text-sm text-white/85">Ride safe. Fresh milk is counting on you.</p>
        </div>
      </section>

      <button
        onClick={toggle}
        disabled={switching}
        className={`flex w-full items-center justify-between gap-4 rounded-2xl p-5 text-left transition ${
          data.isOnline ? 'bg-primary text-on-primary' : 'border-2 border-dashed border-line bg-surface'
        }`}
      >
        <span>
          <span className="block text-xl font-bold">{data.isOnline ? "You're online" : "You're offline"}</span>
          <span className={`block text-sm ${data.isOnline ? 'text-on-primary/80' : 'text-muted'}`}>
            {data.isOnline ? 'Tap to go offline when your shift ends' : 'Tap to go online and start delivering'}
          </span>
        </span>
        <span className={`relative h-9 w-16 shrink-0 rounded-full transition ${data.isOnline ? 'bg-white/30' : 'bg-line'}`}>
          <span className={`absolute top-1 size-7 rounded-full bg-white shadow transition-all ${data.isOnline ? 'left-8' : 'left-1'}`} />
        </span>
      </button>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard icon={Package} label="Active" value={data.active} />
        <StatCard icon={CheckCircle2} label="Delivered today" value={data.deliveredToday} tone="accent" />
        <StatCard icon={Banknote} label="COD to collect" value={formatINR(codPending)} sub={`Collected today ${formatINR(data.codToday)}`} tone="secondary" />
        <StatCard icon={IndianRupee} label="Total earnings" value={formatINR(data.earnings)} />
        <StatCard icon={Star} label="Rating" value={Number(data.rating || 0).toFixed(1)} tone="secondary" />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Next delivery</h2>
          <Link to="/delivery/orders" className="link flex items-center text-sm">
            All deliveries <ChevronRight className="size-4" />
          </Link>
        </div>
        {next ? (
          <div className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted">#{next.orderNo}</p>
                <p className="text-lg font-semibold">{next.address?.name}</p>
              </div>
              <StatusBadge status={next.status} />
            </div>
            <p className="mt-3 flex gap-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-brand" /> {addressText(next.address)}
            </p>
            <p className="mt-2 flex gap-2 text-sm text-muted">
              <Clock className="mt-0.5 size-4 shrink-0" /> {next.slot?.label} · {next.slot?.date}
            </p>
            {toCollect(next) > 0 && (
              <p className="mt-3 inline-flex rounded-xl bg-secondary-soft px-3 py-1.5 text-sm font-bold text-warning">
                Collect {formatINR(toCollect(next))} cash
              </p>
            )}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <a href={navigateUrl(next.address)} target="_blank" rel="noreferrer" className="btn-primary px-2">
                <Navigation className="size-4" /> Navigate
              </a>
              <a href={telHref(next.address?.phone)} className="btn-outline px-2">
                <Phone className="size-4" /> Call
              </a>
              <Link to={`/delivery/orders/${next._id}`} className="btn-outline px-2">
                Open
              </Link>
            </div>
          </div>
        ) : (
          <div className="card p-8 text-center">
            <p className="text-4xl">🎉</p>
            <p className="mt-2 font-semibold">No pending deliveries</p>
            <p className="text-sm text-muted">New orders assigned to you will show up here.</p>
          </div>
        )}
      </section>
    </div>
  )
}
