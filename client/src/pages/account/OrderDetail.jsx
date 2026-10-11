import { ArrowLeft, Bike, Check, FileText, HelpCircle, KeyRound, Phone, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { useDispatch } from 'react-redux'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { errorMessage, useCancelOrderMutation, useMyOrderQuery, useReturnOrderMutation } from '../../app/api'
import ProductImage from '../../components/ProductImage'
import { ErrorState, Field, Modal, PageLoader, StatusBadge } from '../../components/ui'
import ProofPhoto from '../../components/ProofPhoto'
import { formatDate, formatDateTime, formatINR, ORDER_STEPS, PAYMENT_LABEL, STATUS_LABEL, telHref } from '../../lib/format'
import { reorder } from './reorder'

function Tracker({ order }) {
  const closed = order.status === 'cancelled' || order.status === 'returned'
  const reached = closed
    ? // show how far it got before closing
      Math.max(0, ...order.timeline.map((t) => ORDER_STEPS.indexOf(t.status)))
    : ORDER_STEPS.indexOf(order.status)
  const when = (s) => order.timeline.filter((t) => t.status === s).at(0)?.at

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Order status</h2>
        <StatusBadge status={order.status} />
      </div>
      {closed && (
        <div className="mb-4 flex items-start gap-2 rounded-xl bg-error/10 p-3 text-sm text-error ">
          <X className="mt-0.5 size-4 shrink-0" />
          <span>
            This order was {STATUS_LABEL[order.status].toLowerCase()}
            {order.cancelReason ? `: ${order.cancelReason}` : ''}.
            {order.payment.status === 'refunded' && ` ${formatINR(order.total)} was refunded to your wallet.`}
          </span>
        </div>
      )}
      <ol className="flex flex-col gap-0 md:flex-row">
        {ORDER_STEPS.map((s, i) => {
          const done = i <= reached
          const current = !closed && i === reached
          const last = i === ORDER_STEPS.length - 1
          return (
            <li key={s} className="relative flex gap-3 pb-6 md:flex-1 md:flex-col md:items-center md:gap-2 md:pb-0 md:text-center">
              {!last && (
                <span
                  className={`absolute top-8 left-[15px] h-[calc(100%-2rem)] w-0.5 md:top-[15px] md:left-[calc(50%+18px)] md:h-0.5 md:w-[calc(100%-36px)] ${
                    i < reached ? 'bg-primary' : 'bg-line'
                  }`}
                />
              )}
              <span
                className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 ${
                  done ? 'border-gold bg-primary text-on-primary' : 'border-line bg-surface text-muted'
                } ${current ? 'ring-4 ring-gold/20' : ''}`}
              >
                {done ? <Check className="size-4" /> : <span className="text-xs">{i + 1}</span>}
              </span>
              <div>
                <p className={`text-sm font-medium ${done ? '' : 'text-muted'}`}>{STATUS_LABEL[s]}</p>
                {when(s) && <p className="text-xs text-muted">{formatDateTime(when(s))}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function ReasonModal({ open, onClose, title, placeholder, confirmLabel, onSubmit, loading, required }) {
  const [reason, setReason] = useState('')
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Keep order
          </button>
          <button className="btn-danger" disabled={loading || (required && reason.trim().length < 3)} onClick={() => onSubmit(reason.trim())}>
            {loading ? 'Please wait…' : confirmLabel}
          </button>
        </>
      }
    >
      <Field label={required ? 'Reason' : 'Reason (optional)'}>
        <textarea className="input min-h-24" placeholder={placeholder} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Modal>
  )
}

export default function OrderDetail() {
  const { id } = useParams()
  const { data: order, isLoading, error, refetch } = useMyOrderQuery(id, { pollingInterval: 15000 })
  const [cancelOrder, { isLoading: cancelling }] = useCancelOrderMutation()
  const [returnOrder, { isLoading: returning }] = useReturnOrderMutation()
  const [modal, setModal] = useState(null)
  const dispatch = useDispatch()
  const navigate = useNavigate()

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const canCancel = ['placed', 'confirmed'].includes(order.status)
  const canReturn =
    order.status === 'delivered' &&
    !order.returnRequested &&
    order.deliveredAt &&
    Date.now() - new Date(order.deliveredAt).getTime() < 24 * 60 * 60 * 1000
  const open = !['delivered', 'cancelled', 'returned'].includes(order.status)
  const partner = order.deliveryPartner

  const doCancel = async (reason) => {
    try {
      await cancelOrder({ id, reason }).unwrap()
      toast.success('Order cancelled')
      setModal(null)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const doReturn = async (reason) => {
    try {
      await returnOrder({ id, reason }).unwrap()
      toast.success('Return requested. Our team will contact you shortly.')
      setModal(null)
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/account/orders" className="mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-accent">
            <ArrowLeft className="size-4" /> All orders
          </Link>
          <h1 className="text-2xl font-bold">Order #{order.orderNo}</h1>
          <p className="text-sm text-muted">Placed on {formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/account/orders/${id}/invoice`} target="_blank" className="btn-outline btn-sm">
            <FileText className="size-4" /> Invoice
          </Link>
          <Link to={`/support?order=${id}`} className="btn-outline btn-sm">
            <HelpCircle className="size-4" /> Need help
          </Link>
          <button
            className="btn-outline btn-sm"
            onClick={() => {
              reorder(dispatch, order)
              toast.success('Items added to cart')
              navigate('/cart')
            }}
          >
            <RotateCcw className="size-4" /> Reorder
          </button>
        </div>
      </div>

      <Tracker order={order} />

      {order.returnRequested && (
        <p className="rounded-xl bg-secondary-soft p-3 text-sm">
          Return requested{order.returnReason ? `: “${order.returnReason}”` : ''}. We'll refund to your wallet once it's approved.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {open && order.deliveryOtp && (
            <div className="card flex items-center gap-4 border-gold-line bg-primary-soft p-4">
              <KeyRound className="size-8 shrink-0 text-brand" />
              <div className="flex-1">
                <p className="text-sm font-medium">Delivery OTP</p>
                <p className="text-xs text-muted">Share this code with the delivery partner only when you receive your order.</p>
              </div>
              <p className="font-heading text-2xl font-bold tracking-[0.3em] text-brand">{order.deliveryOtp}</p>
            </div>
          )}

          {order.status === 'out_for_delivery' && (
            <div className="card flex items-center gap-4 p-4">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
                <Bike className="size-6" aria-hidden />
              </span>
              <div>
                <p className="font-semibold">Your order is on the way</p>
                <p className="text-sm text-muted">
                  {order.slot?.label ? `Expected in your ${order.slot.label} slot. ` : ''}Keep your delivery OTP ready. This page updates automatically.
                </p>
              </div>
            </div>
          )}

          <div className="card p-5">
            <h2 className="mb-3 font-semibold">Items ({order.items.length})</h2>
            <ul className="divide-y divide-line">
              {order.items.map((it) => (
                <li key={it._id || it.variantId} className="flex items-center gap-3 py-3">
                  <div className="size-14 shrink-0">
                    <ProductImage src={it.image} name={it.name} icon="🥛" rounded="rounded-lg" size="text-2xl" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.name}</p>
                    <p className="text-xs text-muted">
                      {it.variantLabel} · {formatINR(it.price)} × {it.qty}
                    </p>
                  </div>
                  <p className="font-semibold">{formatINR(it.price * it.qty)}</p>
                </li>
              ))}
            </ul>
          </div>

          {order.proofAt && (
            <div className="card p-5">
              <ProofPhoto path={`/orders/mine/${order._id}/proof`} at={order.proofAt} />
            </div>
          )}

          <div className="card space-y-3 p-5 text-sm">
            <h2 className="font-semibold">Timeline</h2>
            <ul className="space-y-2">
              {[...order.timeline].reverse().map((t) => (
                <li key={t._id || t.at} className="flex gap-3">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  <span className="flex-1">
                    <b>{STATUS_LABEL[t.status] || t.status}</b>
                    {t.note && <span className="text-muted">: {t.note}</span>}
                  </span>
                  <span className="text-xs whitespace-nowrap text-muted">{formatDateTime(t.at)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-5">
          {partner && (
            <div className="card p-5">
              <h2 className="mb-3 font-semibold">Delivery partner</h2>
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-brand">
                  <Bike className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{partner.name}</p>
                  <p className="text-xs text-muted">{partner.delivery?.vehicle}</p>
                </div>
                {partner.phone && open && (
                  <a href={telHref(partner.phone)} className="btn-outline btn-sm" aria-label={`Call ${partner.name}`}>
                    <Phone className="size-4" />
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="card space-y-1 p-5 text-sm">
            <h2 className="mb-2 font-semibold">Delivery details</h2>
            <p className="font-medium">{order.address?.name}</p>
            <p className="text-muted">
              {[order.address?.line1, order.address?.line2, order.address?.landmark, order.address?.city, order.address?.state]
                .filter(Boolean)
                .join(', ')}{' '}
              - {order.address?.pincode}
            </p>
            <p className="text-muted">📞 {order.address?.phone}</p>
            {order.slot?.date && (
              <p className="pt-2">
                <span className="text-muted">Slot:</span> {formatDate(order.slot.date)}, {order.slot.label}
              </p>
            )}
          </div>

          <div className="card p-5 text-sm">
            <h2 className="mb-3 font-semibold">Payment summary</h2>
            <dl className="space-y-2">
              <Row label="Subtotal" value={formatINR(order.subtotal)} />
              {order.discount > 0 && <Row label={`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`} value={`− ${formatINR(order.discount)}`} green />}
              <Row label="Delivery fee" value={order.deliveryFee ? formatINR(order.deliveryFee) : 'FREE'} green={!order.deliveryFee} />
              {order.tax > 0 && <Row label="Tax" value={formatINR(order.tax)} />}
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
                <dt>Total</dt>
                <dd>{formatINR(order.total)}</dd>
              </div>
            </dl>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-surface-2 p-3">
              <span>{PAYMENT_LABEL[order.payment.method]}</span>
              <StatusBadge status={order.payment.status} />
            </div>
          </div>

          {(canCancel || canReturn) && (
            <div className="flex flex-col gap-2">
              {canCancel && (
                <button className="btn-outline border-error text-error hover:border-error hover:text-error" onClick={() => setModal('cancel')}>
                  Cancel order
                </button>
              )}
              {canReturn && (
                <button className="btn-outline" onClick={() => setModal('return')}>
                  Return / report a quality issue
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <ReasonModal
        open={modal === 'cancel'}
        onClose={() => setModal(null)}
        title="Cancel this order?"
        placeholder="e.g. Ordered by mistake"
        confirmLabel="Cancel order"
        onSubmit={doCancel}
        loading={cancelling}
      />
      <ReasonModal
        open={modal === 'return'}
        onClose={() => setModal(null)}
        title="Return this order"
        placeholder="e.g. Milk packet was leaking / curd was sour"
        confirmLabel="Request return"
        onSubmit={doReturn}
        loading={returning}
        required
      />
    </div>
  )
}

function Row({ label, value, green }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className={green ? 'font-medium text-brand' : ''}>{value}</dd>
    </div>
  )
}
