import { ArrowLeft, KeyRound, MapPin, Phone, Printer, RotateCcw, User } from 'lucide-react'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useParams } from 'react-router-dom'
import {
  errorMessage,
  useAdminOrderQuery,
  useAssignOrderMutation,
  usePartnersQuery,
  useResolveMissedMutation,
  useSetOrderStatusMutation,
  useSettingsQuery,
} from '../../app/api'
import { hasPerm, usePanelBase } from '../../components/guards'
import { useSelector } from 'react-redux'
import { selectUser } from '../../features/auth/authSlice'
import { ReasonModal } from './billing/_billing'
import ProductImage from '../../components/ProductImage'
import { ErrorState, Modal, PageHeader, PageLoader, StatusBadge } from '../../components/ui'
import ProofPhoto from '../../components/ProofPhoto'
import { formatDate, formatDateTime, formatINR, PAYMENT_LABEL, STATUS_LABEL, telHref } from '../../lib/format'
import { NEXT_STATUSES, PrintStyles } from './_shared'

const ACTION_LABEL = {
  confirmed: 'Confirm order',
  packed: 'Mark packed',
  out_for_delivery: 'Out for delivery',
  delivered: 'Mark delivered',
  undelivered: 'Mark undelivered',
  cancelled: 'Cancel order',
  returned: 'Mark returned',
}

function PrintableInvoice({ order, settings }) {
  return (
    <div className="hidden bg-white p-8 text-sm text-black print:block">
      <div className="flex justify-between border-b pb-4">
        <div>
          <h2 className="text-2xl font-bold text-night">{settings?.storeName || 'Gavyora'}</h2>
          <p>{settings?.address}</p>
          <p>
            {settings?.supportPhone} · {settings?.supportEmail}
          </p>
          <p>
            FSSAI: {settings?.fssaiNo || '—'} · GSTIN: {settings?.gstNo || '—'}
          </p>
        </div>
        <div className="text-right">
          <h3 className="text-lg font-bold">TAX INVOICE</h3>
          <p>Invoice no: INV-{order.orderNo}</p>
          <p>Date: {formatDate(order.createdAt)}</p>
        </div>
      </div>
      <div className="mt-4">
        <p className="font-semibold">Bill / Ship to</p>
        <p>{order.address?.name}</p>
        <p>
          {order.address?.line1}
          {order.address?.line2 ? `, ${order.address.line2}` : ''}
        </p>
        <p>
          {order.address?.city}, {order.address?.state} {order.address?.pincode}
        </p>
        <p>Phone: {order.address?.phone}</p>
      </div>
      <table className="mt-6 w-full border-collapse">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Item</th>
            <th>Size</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Rate</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i._id} className="border-b">
              <td className="py-2">{i.name}</td>
              <td>{i.variantLabel}</td>
              <td className="text-right">{i.qty}</td>
              <td className="text-right">{formatINR(i.price)}</td>
              <td className="text-right">{formatINR(i.price * i.qty)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 ml-auto w-64 space-y-1">
        <p className="flex justify-between"><span>Subtotal</span><span>{formatINR(order.subtotal)}</span></p>
        {order.discount > 0 && <p className="flex justify-between"><span>Discount</span><span>-{formatINR(order.discount)}</span></p>}
        <p className="flex justify-between"><span>Delivery</span><span>{formatINR(order.deliveryFee)}</span></p>
        {order.tax > 0 && <p className="flex justify-between"><span>Tax</span><span>{formatINR(order.tax)}</span></p>}
        <p className="flex justify-between border-t pt-1 text-base font-bold"><span>Total</span><span>{formatINR(order.total)}</span></p>
        <p className="text-xs">Paid via {PAYMENT_LABEL[order.payment.method]} ({order.payment.status})</p>
      </div>
      <p className="mt-10 text-center text-xs">Thank you for choosing farm-fresh dairy!</p>
    </div>
  )
}

export default function OrderDetail() {
  const { id } = useParams()
  const base = usePanelBase()
  const { data: order, isLoading, error, refetch } = useAdminOrderQuery(id)
  const { data: partners = [] } = usePartnersQuery({ kyc: 'approved' })
  const { data: settings } = useSettingsQuery()
  const [setStatus, { isLoading: saving }] = useSetOrderStatusMutation()
  const [assign, { isLoading: assigning }] = useAssignOrderMutation()
  const [action, setAction] = useState(null)
  const [note, setNote] = useState('')
  const [resolveMissed, { isLoading: crediting }] = useResolveMissedMutation()
  const [crediting_, setCrediting] = useState(false)
  const user = useSelector(selectUser)

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  // An undelivered order is resolved on the Missed deliveries page (new date, refund or credit).
  const next = order.status === 'undelivered' ? [] : NEXT_STATUSES[order.status] || []
  const open = ['placed', 'confirmed', 'packed', 'out_for_delivery'].includes(order.status)

  const runAction = async () => {
    try {
      await setStatus({ id, status: action, note: note || undefined }).unwrap()
      toast.success(`Order ${STATUS_LABEL[action].toLowerCase()}`)
      setAction(null)
      setNote('')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const doAssign = async (partnerId) => {
    try {
      await assign({ id, deliveryPartner: partnerId || null }).unwrap()
      toast.success(partnerId ? 'Delivery partner assigned' : 'Unassigned')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <>
      <div className="no-print">
        <Link to={`${base}/orders`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-accent">
          <ArrowLeft className="size-4" /> All orders
        </Link>
        <PageHeader
          title={`Order ${order.orderNo}`}
          subtitle={`Placed ${formatDateTime(order.createdAt)}${order.source === 'subscription' ? ' · from subscription' : ''}`}
          actions={
            <>
              <StatusBadge status={order.status} />
              <button className="btn-outline btn-sm" onClick={() => window.print()}>
                <Printer className="size-4" /> Print invoice
              </button>
            </>
          }
        />

        {order.status === 'undelivered' && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error/30 bg-error/10 p-4">
            <div>
              <p className="font-semibold text-error">Delivery missed</p>
              <p className="text-sm">{order.failureReason || 'No reason recorded'}</p>
            </div>
            <Link to={`${base}/missed-deliveries`} className="btn-danger btn-sm">
              Resolve missed delivery
            </Link>
          </div>
        )}

        {order.status === 'delivered' && hasPerm(user, 'orders') && !order.missedResolution?.action && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-4">
            <p className="text-sm">Customer says this delivery never arrived or was incomplete? Credit it after checking.</p>
            <button className="btn-outline btn-sm" onClick={() => setCrediting(true)}>
              Credit for missing delivery
            </button>
          </div>
        )}
        {order.missedResolution?.action && (
          <p className="mb-6 rounded-xl bg-surface-2 p-4 text-sm">
            Resolved ({order.missedResolution.action}) by {order.missedResolution.by}: {order.missedResolution.note}
          </p>
        )}

        {order.returnRequested && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error/30 bg-error/10 p-4 ">
            <div className="flex items-start gap-3">
              <RotateCcw className="mt-0.5 size-5 text-error" />
              <div>
                <p className="font-semibold text-error">Return requested</p>
                <p className="text-sm">{order.returnReason}</p>
              </div>
            </div>
            <button className="btn-danger btn-sm" onClick={() => setAction('returned')}>
              Approve return & refund
            </button>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {next.length > 0 && (
              <div className="card p-4 sm:p-5">
                <h2 className="mb-3 font-semibold">Update status</h2>
                <div className="flex flex-wrap gap-2">
                  {next.map((s) => (
                    <button
                      key={s}
                      className={s === 'cancelled' || s === 'returned' ? 'btn-outline btn-sm text-error' : 'btn-primary btn-sm'}
                      onClick={() => setAction(s)}
                    >
                      {ACTION_LABEL[s]}
                    </button>
                  ))}
                </div>
                {next.includes('delivered') && (
                  <p className="mt-2 text-xs text-muted">Delivery partners mark orders delivered with the customer's OTP. Use this only to override.</p>
                )}
              </div>
            )}

            <div className="card overflow-hidden">
              <h2 className="border-b border-line px-5 py-3 font-semibold">Items ({order.items.length})</h2>
              <ul className="divide-y divide-line">
                {order.items.map((i) => (
                  <li key={i._id} className="flex items-center gap-3 px-5 py-3">
                    <ProductImage src={i.image} name={i.name} className="size-12! shrink-0" size="text-2xl" rounded="rounded-lg" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{i.name}</p>
                      <p className="text-xs text-muted">
                        {i.variantLabel} · {formatINR(i.price)} × {i.qty}
                      </p>
                    </div>
                    <p className="font-semibold">{formatINR(i.price * i.qty)}</p>
                  </li>
                ))}
              </ul>
              <div className="space-y-1.5 border-t border-line bg-surface-2 px-5 py-4 text-sm">
                <p className="flex justify-between"><span className="text-muted">Subtotal</span>{formatINR(order.subtotal)}</p>
                {order.discount > 0 && (
                  <p className="flex justify-between text-brand">
                    <span>Discount {order.couponCode && `(${order.couponCode})`}</span>-{formatINR(order.discount)}
                  </p>
                )}
                <p className="flex justify-between"><span className="text-muted">Delivery fee</span>{order.deliveryFee ? formatINR(order.deliveryFee) : 'Free'}</p>
                {order.tax > 0 && <p className="flex justify-between"><span className="text-muted">Tax</span>{formatINR(order.tax)}</p>}
                <p className="flex justify-between border-t border-line pt-2 text-base font-bold"><span>Total</span>{formatINR(order.total)}</p>
                <p className="flex items-center justify-between pt-1">
                  <span className="text-muted">{PAYMENT_LABEL[order.payment.method]}</span>
                  <StatusBadge status={order.payment.status} />
                </p>
              </div>
            </div>

            {order.proofAt && (
              <div className="card p-4 sm:p-5">
                <ProofPhoto path={`/orders/${order._id}/proof`} at={order.proofAt} />
              </div>
            )}

            <div className="card p-4 sm:p-5">
              <h2 className="mb-4 font-semibold">Timeline</h2>
              <ol className="relative space-y-4 border-l-2 border-line pl-5">
                {[...order.timeline].reverse().map((t) => (
                  <li key={t._id} className="relative">
                    <span className="absolute top-1 -left-[27px] size-3 rounded-full border-2 border-surface bg-primary" />
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={t.status} />
                      <span className="text-xs text-muted">{formatDateTime(t.at)}</span>
                      {t.by && <span className="text-xs text-muted">· by {t.by}</span>}
                    </div>
                    {t.note && <p className="mt-1 text-sm">{t.note}</p>}
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <div className="space-y-6">
            <div className="card space-y-3 p-4 text-sm sm:p-5">
              <h2 className="font-semibold">Customer</h2>
              <p className="flex items-center gap-2">
                <User className="size-4 text-muted" /> {order.user?.name}
              </p>
              <p className="flex items-center gap-2">
                <Phone className="size-4 text-muted" />
                <a href={telHref(order.address?.phone)} className="link">{order.address?.phone}</a>
              </p>
              {order.user?.email && <p className="text-muted">{order.user.email}</p>}
              <div className="flex gap-2 border-t border-line pt-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted" />
                <p>
                  {order.address?.name}
                  <br />
                  {order.address?.line1}
                  {order.address?.line2 && `, ${order.address.line2}`}
                  {order.address?.landmark && <><br />Near {order.address.landmark}</>}
                  <br />
                  {order.address?.city}, {order.address?.state} – <b>{order.address?.pincode}</b>
                </p>
              </div>
              <div className="border-t border-line pt-3">
                <p className="text-muted">Delivery slot</p>
                <p className="font-medium">
                  {order.slot?.date && formatDate(order.slot.date)} · {order.slot?.label}
                </p>
              </div>
            </div>

            <div className="card space-y-3 p-4 text-sm sm:p-5">
              <h2 className="font-semibold">Delivery</h2>
              {open ? (
                <select className="input" value={order.deliveryPartner?._id || ''} disabled={assigning} onChange={(e) => doAssign(e.target.value)}>
                  <option value="">Unassigned</option>
                  {partners.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.delivery?.isOnline ? '🟢 Online' : '⚪ Offline'} · {p.name} ({p.active} active)
                    </option>
                  ))}
                </select>
              ) : (
                <p>{order.deliveryPartner?.name || 'Not assigned'}</p>
              )}
              {order.deliveryPartner && (
                <p className="text-muted">
                  {order.deliveryPartner.phone} · {order.deliveryPartner.delivery?.vehicle}
                </p>
              )}
              <p className="flex items-center gap-2 rounded-lg bg-surface-2 p-3">
                <KeyRound className="size-4 text-brand" /> Delivery OTP:
                <b className="font-mono text-base tracking-widest">{order.deliveryOtp}</b>
              </p>
              {order.deliveredAt && <p className="text-muted">Delivered {formatDateTime(order.deliveredAt)}</p>}
              {order.cancelReason && <p className="text-error">Cancel reason: {order.cancelReason}</p>}
            </div>
          </div>
        </div>
      </div>

      {crediting_ && (
        <ReasonModal
          open
          title={`Credit ${order.orderNo}`}
          text={`${formatINR(order.total)} goes to the ${order.payment.method === 'prepaid' ? 'subscription balance' : "customer's wallet"}. Use only after confirming the delivery was missed.`}
          busy={crediting}
          confirmLabel="Credit full amount"
          onClose={() => setCrediting(false)}
          onConfirm={(reason) =>
            resolveMissed({ id: order._id, action: 'credit', note: reason })
              .unwrap()
              .then(() => {
                toast.success('Credited')
                setCrediting(false)
                refetch()
              })
              .catch((e) => toast.error(errorMessage(e)))
          }
        />
      )}
      <PrintStyles />
      <PrintableInvoice order={order} settings={settings} />

      <Modal
        open={!!action}
        onClose={() => setAction(null)}
        title={action ? ACTION_LABEL[action] : ''}
        size="max-w-md"
        footer={
          <>
            <button className="btn-outline" onClick={() => setAction(null)}>
              Back
            </button>
            <button
              className={['cancelled', 'returned', 'undelivered'].includes(action) ? 'btn-danger' : 'btn-primary'}
              onClick={runAction}
              disabled={saving || (action === 'undelivered' && note.trim().length < 3)}
            >
              {action && ACTION_LABEL[action]}
            </button>
          </>
        }
      >
        {(action === 'cancelled' || action === 'returned') && order.payment.status === 'paid' && (
          <p className="mb-3 rounded-lg bg-secondary-soft p-3 text-sm">{formatINR(order.total)} will be refunded to the customer's wallet.</p>
        )}
        <label className="label" htmlFor="status-note">
          {action === 'undelivered' ? 'Why could it not be delivered? (required)' : 'Note (optional)'}
        </label>
        <textarea id="status-note" className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Visible in the order timeline" />
      </Modal>
    </>
  )
}
