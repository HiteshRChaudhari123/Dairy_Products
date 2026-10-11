import { ArrowLeft, Camera, CheckCircle2, MapPin, Navigation, Phone, Truck } from 'lucide-react'
import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useParams } from 'react-router-dom'
import { errorMessage, useDeliveryOrderQuery, useDeliveryStatusMutation, useUploadProofMutation } from '../../app/api'
import ProofPhoto, { compressPhoto } from '../../components/ProofPhoto'
import { ErrorState, Modal, PageLoader, StatusBadge } from '../../components/ui'
import { formatDateTime, formatINR, PAYMENT_LABEL, STATUS_LABEL, telHref } from '../../lib/format'
import { addressText, navigateUrl, toCollect } from './helpers'

function OtpInput({ value, onChange }) {
  const refs = useRef([])
  const digits = value.padEnd(4, ' ').split('').slice(0, 4)
  const setAt = (i, d) => {
    const arr = value.padEnd(4, ' ').split('')
    arr[i] = d || ' '
    onChange(arr.join('').replace(/\s+$/, ''))
  }
  return (
    <div className="flex justify-center gap-3">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          value={d.trim()}
          inputMode="numeric"
          maxLength={1}
          autoFocus={i === 0}
          aria-label={`OTP digit ${i + 1}`}
          className="input size-14 p-0 text-center text-2xl font-bold"
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(-1)
            setAt(i, v)
            if (v && i < 3) refs.current[i + 1]?.focus()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !d.trim() && i > 0) refs.current[i - 1]?.focus()
          }}
          onPaste={(e) => {
            const p = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
            if (p) {
              e.preventDefault()
              onChange(p)
              refs.current[Math.min(p.length, 3)]?.focus()
            }
          }}
        />
      ))}
    </div>
  )
}

function DeliverModal({ order, onClose }) {
  const [otp, setOtp] = useState('')
  const [cashOk, setCashOk] = useState(false)
  const [photo, setPhoto] = useState(null) // compressed data URL
  const [preparing, setPreparing] = useState(false)
  const [err, setErr] = useState('')
  const [update, { isLoading }] = useDeliveryStatusMutation()
  const [upload, { isLoading: uploading }] = useUploadProofMutation()
  const cash = toCollect(order)

  const pick = async (file) => {
    if (!file) return
    setPreparing(true)
    try {
      setPhoto(await compressPhoto(file))
    } catch (e2) {
      toast.error(e2.message || 'Could not read that photo')
    } finally {
      setPreparing(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    try {
      // Upload the photo first so a delivered order never points at a missing proof.
      if (photo) await upload({ id: order._id, image: photo }).unwrap()
      await update({ id: order._id, status: 'delivered', otp, note: photo ? 'Delivered with OTP + photo proof' : undefined }).unwrap()
      toast.success('Delivered! Great job 🎉')
      onClose()
    } catch (e2) {
      setErr(errorMessage(e2))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Confirm delivery"
      size="max-w-md"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" form="deliver-form" disabled={otp.length !== 4 || (cash > 0 && !cashOk) || isLoading || uploading || preparing}>
            <CheckCircle2 className="size-4" /> Mark delivered
          </button>
        </>
      }
    >
      <form id="deliver-form" onSubmit={submit} className="space-y-5">
        <p className="text-center text-sm text-muted">Ask the customer for the 4-digit delivery OTP shown in their app.</p>
        <OtpInput value={otp} onChange={(v) => { setOtp(v); setErr('') }} />
        {err && <p className="rounded-xl bg-error/10 p-3 text-center text-sm text-error ">{err}</p>}
        {cash > 0 && (
          <label className="flex items-center gap-3 rounded-xl bg-secondary-soft p-3">
            <input type="checkbox" className="size-5 accent-primary" checked={cashOk} onChange={(e) => setCashOk(e.target.checked)} />
            <span className="font-medium">I have collected {formatINR(cash)} in cash</span>
          </label>
        )}
        <div>
          <p className="label">Photo proof (optional)</p>
          <label className="btn-outline w-full cursor-pointer">
            <Camera className="size-4" /> {preparing ? 'Preparing photo…' : photo ? 'Retake photo' : 'Take photo'}
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={(e) => pick(e.target.files[0])} />
          </label>
          {photo && (
            <div className="mt-3">
              <img src={photo} alt="Delivery proof preview" className="no-dim max-h-48 w-full rounded-xl object-cover" />
              <button type="button" className="btn-ghost btn-sm mt-1 text-error" onClick={() => setPhoto(null)}>
                Remove photo
              </button>
            </div>
          )}
          <p className="mt-1 text-xs text-muted">Saved with the order. The customer and the store can see it.</p>
        </div>
      </form>
    </Modal>
  )
}

export default function DeliveryOrder() {
  const { id } = useParams()
  const { data: o, isLoading, error, refetch } = useDeliveryOrderQuery(id)
  const [update, { isLoading: starting }] = useDeliveryStatusMutation()
  const [delivering, setDelivering] = useState(false)
  const [ticked, setTicked] = useState({})

  if (isLoading) return <PageLoader />
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const cash = toCollect(o)
  const start = async () => {
    try {
      await update({ id: o._id, status: 'out_for_delivery' }).unwrap()
      toast.success('Picked up. Drive safe!')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/delivery/orders" className="inline-flex items-center gap-1 text-sm text-muted hover:text-accent">
        <ArrowLeft className="size-4" /> Deliveries
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Order #{o.orderNo}</p>
          <h1 className="text-2xl font-bold">{o.address?.name}</h1>
        </div>
        <StatusBadge status={o.status} />
      </div>

      {o.status === 'delivered' && (
        <div className="flex items-center gap-3 rounded-2xl bg-primary-soft p-4 text-brand">
          <CheckCircle2 className="size-8 shrink-0" />
          <div>
            <p className="font-semibold">Delivered</p>
            <p className="text-sm">{formatDateTime(o.deliveredAt)}{o.codCollected ? ` · ${formatINR(o.total)} cash collected` : ''}</p>
          </div>
        </div>
      )}

      <section className="card p-4">
        <p className="flex gap-2">
          <MapPin className="mt-0.5 size-5 shrink-0 text-brand" /> <span>{addressText(o.address)}</span>
        </p>
        <p className="mt-2 text-sm text-muted">Slot: {o.slot?.label} · {o.slot?.date}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a href={navigateUrl(o.address)} target="_blank" rel="noreferrer" className="btn-outline">
            <Navigation className="size-4" /> Navigate
          </a>
          <a href={telHref(o.address?.phone)} className="btn-outline">
            <Phone className="size-4" /> {o.address?.phone}
          </a>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Items to hand over</h2>
        <ul className="space-y-2">
          {o.items.map((it, i) => (
            <li key={i}>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl p-2 hover:bg-surface-2">
                <input type="checkbox" className="size-5 accent-primary" checked={!!ticked[i]} onChange={(e) => setTicked((t) => ({ ...t, [i]: e.target.checked }))} />
                <span className={`flex-1 ${ticked[i] ? 'text-muted line-through' : ''}`}>
                  {it.name} <span className="text-muted">({it.variantLabel})</span>
                </span>
                <span className="text-lg font-bold">×{it.qty}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Payment</h2>
        {cash > 0 ? (
          <p className="rounded-xl bg-secondary-soft p-3 text-lg font-bold text-warning">Collect {formatINR(cash)} cash</p>
        ) : (
          <p className="rounded-xl bg-primary-soft p-3 font-semibold text-brand">Prepaid · nothing to collect</p>
        )}
        <p className="mt-2 text-sm text-muted">{PAYMENT_LABEL[o.payment?.method]} · Order total {formatINR(o.total)}</p>
      </section>

      {o.proofAt && (
        <section className="card p-4">
          <ProofPhoto path={`/delivery/orders/${o._id}/proof`} at={o.proofAt} />
        </section>
      )}
      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Timeline</h2>
        <ol className="space-y-3 border-l-2 border-line pl-4">
          {[...(o.timeline || [])].reverse().map((t, i) => (
            <li key={i} className="relative">
              <span className="absolute top-1.5 -left-[1.3rem] size-2.5 rounded-full bg-primary" />
              <p className="text-sm font-medium">{STATUS_LABEL[t.status] || t.status}</p>
              {t.note && <p className="text-sm text-muted">{t.note}</p>}
              <p className="text-xs text-muted">{formatDateTime(t.at)}</p>
            </li>
          ))}
        </ol>
      </section>

      {['placed', 'confirmed', 'packed', 'out_for_delivery'].includes(o.status) && (
        <div className="sticky bottom-20 z-20 lg:bottom-4">
          {o.status === 'out_for_delivery' ? (
            <button className="btn-primary h-14 w-full text-base shadow-lg" onClick={() => setDelivering(true)}>
              <CheckCircle2 className="size-5" /> Mark delivered
            </button>
          ) : (
            <button className="btn-secondary h-14 w-full text-base shadow-lg" onClick={start} disabled={starting}>
              <Truck className="size-5" /> Picked up, start delivery
            </button>
          )}
        </div>
      )}

      {delivering && <DeliverModal order={o} onClose={() => setDelivering(false)} />}
    </div>
  )
}
