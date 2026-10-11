import { CalendarClock, CheckCircle2, CreditCard, KeyRound, MapPin } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useMyOrderQuery } from '../../app/api'
import { ErrorState, PageLoader } from '../../components/ui'
import { formatINR, PAYMENT_LABEL } from '../../lib/format'

export default function OrderSuccess() {
  const { id } = useParams()
  const { data: order, isLoading, error, refetch } = useMyOrderQuery(id)


  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const slotDate = new Date(order.slot.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="container-page max-w-2xl py-10">
      <div className="text-center">
        <div className="relative mx-auto flex size-24 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          <span className="relative flex size-24 items-center justify-center rounded-full bg-primary text-on-primary">
            <CheckCircle2 className="size-12" />
          </span>
        </div>
        <h1 className="mt-6 text-2xl font-bold sm:text-3xl">Order placed! 🎉</h1>
        <p className="mt-2 text-muted">Thank you for choosing Gavyora. We're getting your fresh dairy ready.</p>
      </div>

      <div className="card mt-8 divide-y divide-line">
        <div className="flex items-center justify-between p-4">
          <span className="text-sm text-muted">Order number</span>
          <span className="font-mono font-semibold">{order.orderNo}</span>
        </div>
        <div className="flex items-start gap-3 p-4 text-sm">
          <CalendarClock className="size-5 shrink-0 text-brand" />
          <span>
            Arriving <b>{slotDate}</b>, {order.slot.label}
          </span>
        </div>
        <div className="flex items-start gap-3 p-4 text-sm">
          <MapPin className="size-5 shrink-0 text-brand" />
          <span>
            {order.address.name}, {order.address.line1}, {order.address.city} {order.address.pincode}
          </span>
        </div>
        <div className="flex items-start gap-3 p-4 text-sm">
          <CreditCard className="size-5 shrink-0 text-brand" />
          <span className="flex-1">
            {PAYMENT_LABEL[order.payment.method]} · {order.payment.status === 'paid' ? 'Paid' : 'Pay on delivery'}
          </span>
          <b>{formatINR(order.total)}</b>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-4 rounded-2xl bg-secondary-soft p-5">
        <KeyRound className="size-8 shrink-0 text-warning" />
        <div className="flex-1">
          <p className="text-sm font-semibold">Your delivery OTP</p>
          <p className="text-xs text-muted">Share this 4-digit code with the delivery partner when your order arrives.</p>
        </div>
        <span className="font-mono text-3xl font-bold tracking-widest">{order.deliveryOtp}</span>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link to={`/account/orders/${order._id}`} className="btn-primary flex-1">
          Track order
        </Link>
        <Link to="/" className="btn-outline flex-1">
          Continue shopping
        </Link>
      </div>
    </div>
  )
}
