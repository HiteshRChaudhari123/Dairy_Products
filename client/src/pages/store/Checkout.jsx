import { Banknote, Check, CreditCard, MapPin, Plus, TicketPercent, Wallet, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useDispatch, useSelector } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import {
  errorMessage,
  useAddAddressMutation,
  useAvailableCouponsQuery,
  usePlaceOrderMutation,
  useQuoteMutation,
  useSettingsQuery,
  useVerifyPaymentMutation,
} from '../../app/api'
import ProductImage from '../../components/ProductImage'
import { EmptyState, Field, Spinner } from '../../components/ui'
import { selectUser, setUser } from '../../features/auth/authSlice'
import { clearCart, selectCart, setCoupon } from '../../features/cart/cartSlice'
import { addDays, dateKey, formatINR } from '../../lib/format'
import { loadRazorpay } from '../../lib/razorpay'

const STEPS = ['Address', 'Delivery slot', 'Payment', 'Review']

const EMPTY_ADDRESS = { label: 'Home', name: '', phone: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '' }

function AddressForm({ onSaved, onCancel, defaults }) {
  const dispatch = useDispatch()
  const [addAddress, { isLoading }] = useAddAddressMutation()
  const [form, setForm] = useState({ ...EMPTY_ADDRESS, ...defaults })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    try {
      const res = await addAddress(form).unwrap()
      dispatch(setUser(res.user))
      toast.success('Address saved')
      onSaved(res.user.addresses.at(-1)._id)
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-xl border border-line p-4 sm:grid-cols-2">
      <Field label="Full name">
        <input className="input" required value={form.name} onChange={set('name')} />
      </Field>
      <Field label="Mobile number">
        <input className="input" required inputMode="numeric" maxLength={10} value={form.phone} onChange={set('phone')} />
      </Field>
      <Field label="Flat, house no., building" className="sm:col-span-2">
        <input className="input" required value={form.line1} onChange={set('line1')} />
      </Field>
      <Field label="Area, street (optional)">
        <input className="input" value={form.line2} onChange={set('line2')} />
      </Field>
      <Field label="Landmark (optional)">
        <input className="input" value={form.landmark} onChange={set('landmark')} />
      </Field>
      <Field label="City">
        <input className="input" required value={form.city} onChange={set('city')} />
      </Field>
      <Field label="State">
        <input className="input" required value={form.state} onChange={set('state')} />
      </Field>
      <Field label="Pincode">
        <input className="input" required inputMode="numeric" maxLength={6} value={form.pincode} onChange={set('pincode')} />
      </Field>
      <Field label="Save as">
        <div className="flex gap-2">
          {['Home', 'Work', 'Other'].map((l) => (
            <button
              type="button"
              key={l}
              onClick={() => setForm({ ...form, label: l })}
              className={`chip min-h-9 px-3 ${form.label === l ? 'bg-primary text-on-primary' : 'bg-surface-2'}`}
            >
              {l}
            </button>
          ))}
        </div>
      </Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button className="btn-primary" disabled={isLoading}>
          Save address
        </button>
      </div>
    </form>
  )
}

function StepCard({ index, step, setStep, title, summary, children }) {
  const done = step > index
  const active = step === index
  return (
    <section className={`card overflow-hidden ${active ? 'ring-2 ring-gold/30' : ''}`}>
      <header className="flex items-center gap-3 p-4">
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
            done ? 'bg-primary text-on-primary' : active ? 'bg-primary-soft text-brand' : 'bg-surface-2 text-muted'
          }`}
        >
          {done ? <Check className="size-4" /> : index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={`font-semibold ${!active && !done ? 'text-muted' : ''}`}>{title}</h2>
          {done && summary && <p className="truncate text-sm text-muted">{summary}</p>}
        </div>
        {done && (
          <button className="btn-ghost btn-sm text-brand" onClick={() => setStep(index)}>
            Change
          </button>
        )}
      </header>
      {active && <div className="border-t border-line p-4">{children}</div>}
    </section>
  )
}

export default function Checkout() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const user = useSelector(selectUser)
  const { items, coupon } = useSelector(selectCart)
  const { data: settings } = useSettingsQuery()
  const { data: coupons = [] } = useAvailableCouponsQuery()
  const [runQuote, { data: quote, isLoading: quoting }] = useQuoteMutation()
  const [placeOrder, { isLoading: placing }] = usePlaceOrderMutation()
  const [verifyPayment] = useVerifyPaymentMutation()

  const addresses = user?.addresses || []
  const [step, setStep] = useState(0)
  const [addressId, setAddressId] = useState(() => (addresses.find((a) => a.isDefault) || addresses[0])?._id)
  const [adding, setAdding] = useState(addresses.length === 0)
  const [slot, setSlot] = useState(null)
  const [method, setMethod] = useState(null)
  const [couponInput, setCouponInput] = useState(coupon)
  const [processing, setProcessing] = useState(false)

  const address = addresses.find((a) => a._id === addressId)
  const lineItems = useMemo(() => items.map((i) => ({ product: i.product, variantId: i.variantId, qty: i.qty })), [items])


  useEffect(() => {
    if (!lineItems.length) return
    runQuote({ items: lineItems, couponCode: coupon || undefined, pincode: address?.pincode }).catch(() => {})
  }, [lineItems, coupon, address?.pincode, runQuote])

  const days = [1, 2, 3].map((n) => dateKey(addDays(new Date(), n)))
  const slots = settings?.slots || []

  if (!items.length && !processing)
    return (
      <div className="container-page py-6">
        <EmptyState
          icon="🛒"
          title="Nothing to check out"
          text="Your cart is empty."
          action={
            <Link to="/" className="btn-primary">
              Continue shopping
            </Link>
          }
        />
      </div>
    )

  const total = quote?.total ?? 0
  const walletShort = (user?.wallet ?? 0) < total
  const blocked =
    !quote ||
    quote.problems?.length > 0 ||
    !quote.serviceable ||
    quote.subtotal < quote.minOrderValue ||
    !address ||
    !slot ||
    !method ||
    (method === 'wallet' && walletShort)

  const applyCoupon = (code) => {
    const c = (code ?? couponInput).trim().toUpperCase()
    setCouponInput(c)
    dispatch(setCoupon(c))
  }

  const finish = (order) => {
    navigate(`/order-success/${order._id}`, { replace: true })
    dispatch(clearCart())
  }

  const place = async () => {
    setProcessing(true)
    try {
      const { order, razorpay } = await placeOrder({
        items: lineItems,
        addressId,
        slot,
        paymentMethod: method,
        couponCode: quote?.couponCode || undefined,
      }).unwrap()
      if (!razorpay) return finish(order)

      if (!(await loadRazorpay())) throw new Error('Could not load the payment window. Check your connection.')
      const rzp = new window.Razorpay({
        key: razorpay.keyId,
        order_id: razorpay.orderId,
        amount: razorpay.amount,
        currency: razorpay.currency,
        name: 'Gavyora',
        description: `Order ${order.orderNo}`,
        prefill: { name: user.name, email: user.email, contact: user.phone },
        theme: { color: '#101D35' },
        handler: async (response) => {
          try {
            await verifyPayment({ id: order._id, ...response }).unwrap()
            finish(order)
          } catch (err) {
            toast.error(errorMessage(err, 'Payment could not be verified'))
            setProcessing(false)
          }
        },
        modal: {
          ondismiss: () => {
            toast('Payment cancelled. Your order is saved. You can cancel it from My orders.', { icon: 'ℹ️' })
            navigate(`/account/orders/${order._id}`)
            dispatch(clearCart())
          },
        },
      })
      rzp.open()
    } catch (err) {
      toast.error(err?.message && !err.data ? err.message : errorMessage(err))
      setProcessing(false)
    }
  }

  const METHODS = [
    settings?.codEnabled !== false && { id: 'cod', icon: Banknote, title: 'Cash on delivery', text: 'Pay in cash or UPI when your order arrives' },
    {
      id: 'wallet',
      icon: Wallet,
      title: 'Gavyora wallet',
      text: `Balance ${formatINR(user?.wallet)}`,
      disabled: walletShort,
      note: walletShort && 'Insufficient balance',
    },
    { id: 'online', icon: CreditCard, title: 'UPI / Card / Netbanking', text: 'Pay securely with Razorpay' },
  ].filter(Boolean)

  const summary = (
    <div className="card p-5">
      <h2 className="mb-4 font-semibold">Order summary</h2>
      <ul className="mb-4 max-h-56 space-y-3 overflow-y-auto">
        {items.map((l) => (
          <li key={`${l.product}:${l.variantId}`} className="flex items-center gap-3 text-sm">
            <div className="w-11 shrink-0">
              <ProductImage src={l.image} icon={l.icon} name={l.name} size="text-lg" rounded="rounded-lg" />
            </div>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{l.name}</span>
              <span className="text-xs text-muted">
                {l.variantLabel} × {l.qty}
              </span>
            </span>
            <span className="font-medium">{formatINR(l.price * l.qty)}</span>
          </li>
        ))}
      </ul>

      <div className="border-t border-line pt-4">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <TicketPercent className="size-4 text-brand" /> Apply coupon
        </p>
        {quote?.couponCode ? (
          <div className="flex items-center justify-between rounded-xl bg-primary-soft px-3 py-2 text-sm">
            <span>
              <b className="text-brand">{quote.couponCode}</b> applied · you save {formatINR(quote.discount)}
            </span>
            <button onClick={() => applyCoupon('')} aria-label="Remove coupon" className="p-1">
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                applyCoupon()
              }}
            >
              <input
                className="input uppercase"
                placeholder="Enter code"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
              />
              <button className="btn-outline" disabled={!couponInput.trim()}>
                Apply
              </button>
            </form>
            {coupon && quote?.couponError && <p className="mt-1.5 text-xs text-error">{quote.couponError}</p>}
            {coupons.length > 0 && (
              <div className="mt-3 space-y-2">
                {coupons.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => applyCoupon(c.code)}
                    className="flex w-full items-start gap-2 rounded-xl border border-dashed border-line p-2.5 text-left text-xs hover:border-accent"
                  >
                    <span className="chip bg-secondary-soft font-bold">{c.code}</span>
                    <span className="text-muted">{c.description}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <dl className="mt-4 space-y-2 border-t border-line pt-4 text-sm">
        {quote ? (
          <>
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd>{formatINR(quote.subtotal)}</dd>
            </div>
            {quote.discount > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">Coupon discount</dt>
                <dd className="text-success">−{formatINR(quote.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted">Delivery</dt>
              <dd>{quote.deliveryFee ? formatINR(quote.deliveryFee) : <span className="text-success">FREE</span>}</dd>
            </div>
            {quote.tax > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted">Tax</dt>
                <dd>{formatINR(quote.tax)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
              <dt>To pay</dt>
              <dd>{formatINR(quote.total)}</dd>
            </div>
            {quote.savings > 0 && <p className="text-center text-xs font-medium text-success">You save {formatINR(quote.savings)} on this order</p>}
          </>
        ) : (
          <div className="flex justify-center py-2">
            <Spinner />
          </div>
        )}
      </dl>

      {quote?.problems?.length > 0 && (
        <div className="mt-3 rounded-xl bg-error/10 p-3 text-xs text-error ">
          {quote.problems.map((p) => {
            const line = items.find((i) => i.product === p.product && i.variantId === p.variantId)
            return (
              <p key={`${p.product}:${p.variantId}`}>
                {line?.name || 'An item'}: {p.reason}
              </p>
            )
          })}
          <Link to="/cart" className="mt-1 inline-block font-semibold underline">
            Update cart
          </Link>
        </div>
      )}
      {quote && !quote.serviceable && (
        <p className="mt-3 rounded-xl bg-error/10 p-3 text-xs text-error ">
          Sorry, we don't deliver to {address?.pincode} yet. Please choose another address.
        </p>
      )}
      {quote && quote.subtotal < quote.minOrderValue && (
        <p className="mt-3 rounded-xl bg-secondary-soft p-3 text-xs">
          Minimum order is {formatINR(quote.minOrderValue)}. <Link to="/" className="link">Add more items</Link>
        </p>
      )}
    </div>
  )

  return (
    <div className="container-page py-6">
      <h1 className="mb-2 text-2xl font-bold">Checkout</h1>
      <ol className="scrollbar-none mb-6 flex items-center gap-2 overflow-x-auto text-xs sm:text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2 whitespace-nowrap">
            <span className={`font-medium ${i <= step ? 'text-brand' : 'text-muted'}`}>
              {i + 1}. {s}
            </span>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-line" />}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <StepCard
            index={0}
            step={step}
            setStep={setStep}
            title="Delivery address"
            summary={address && `${address.name}, ${address.line1}, ${address.city} ${address.pincode}`}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {addresses.map((a) => (
                <label
                  key={a._id}
                  className={`flex cursor-pointer gap-3 rounded-xl border-2 p-3 text-sm ${a._id === addressId ? 'border-gold bg-selected' : 'border-line'}`}
                >
                  <input type="radio" name="address" className="mt-1 accent-primary" checked={a._id === addressId} onChange={() => setAddressId(a._id)} />
                  <span>
                    <span className="flex items-center gap-2 font-semibold">
                      {a.name} <span className="chip bg-surface-2">{a.label}</span>
                    </span>
                    <span className="mt-1 block text-muted">
                      {a.line1}
                      {a.line2 && `, ${a.line2}`}, {a.city}, {a.state} – {a.pincode}
                    </span>
                    <span className="block text-muted">📞 {a.phone}</span>
                  </span>
                </label>
              ))}
            </div>
            {adding ? (
              <AddressForm
                defaults={{ name: user?.name || '', phone: user?.phone || '' }}
                onCancel={addresses.length ? () => setAdding(false) : undefined}
                onSaved={(id) => {
                  setAddressId(id)
                  setAdding(false)
                }}
              />
            ) : (
              <button className="btn-ghost mt-3 text-brand" onClick={() => setAdding(true)}>
                <Plus className="size-4" /> Add a new address
              </button>
            )}
            {address && !adding && (
              <button className="btn-primary mt-4 w-full sm:w-auto" onClick={() => setStep(1)}>
                <MapPin className="size-4" /> Deliver here
              </button>
            )}
          </StepCard>

          <StepCard
            index={1}
            step={step}
            setStep={setStep}
            title="Delivery slot"
            summary={slot && `${new Date(slot.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · ${slot.label}`}
          >
            <div className="space-y-4">
              {days.map((d, i) => (
                <div key={d}>
                  <p className="mb-2 text-sm font-medium">
                    {i === 0 ? 'Tomorrow' : new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long' })},{' '}
                    <span className="text-muted">{new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {slots.map((label) => {
                      const on = slot?.date === d && slot?.label === label
                      return (
                        <button
                          key={label}
                          onClick={() => setSlot({ date: d, label })}
                          className={`min-h-11 rounded-xl border-2 px-3 py-2 text-sm ${on ? 'border-gold bg-selected font-semibold text-brand' : 'border-line hover:border-accent'}`}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
            <button className="btn-primary mt-5 w-full sm:w-auto" disabled={!slot} onClick={() => setStep(2)}>
              Continue
            </button>
          </StepCard>

          <StepCard index={2} step={step} setStep={setStep} title="Payment method" summary={METHODS.find((m) => m.id === method)?.title}>
            <div className="space-y-2">
              {METHODS.map((m) => (
                <label
                  key={m.id}
                  className={`flex min-h-14 items-center gap-3 rounded-xl border-2 p-3 ${m.disabled ? 'opacity-60' : 'cursor-pointer'} ${method === m.id ? 'border-gold bg-selected' : 'border-line'}`}
                >
                  <input type="radio" name="pay" className="accent-primary" disabled={m.disabled} checked={method === m.id} onChange={() => setMethod(m.id)} />
                  <m.icon className="size-5 text-brand" />
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{m.title}</span>
                    <span className="block text-xs text-muted">{m.text}</span>
                  </span>
                  {m.note && (
                    <Link to="/account/wallet" className="text-xs font-medium text-brand">
                      Add money
                    </Link>
                  )}
                </label>
              ))}
            </div>
            <button className="btn-primary mt-5 w-full sm:w-auto" disabled={!method || (method === 'wallet' && walletShort)} onClick={() => setStep(3)}>
              Continue
            </button>
          </StepCard>

          <StepCard index={3} step={step} setStep={setStep} title="Review & place order">
            <div className="space-y-2 text-sm">
              <p>
                <span className="text-muted">Deliver to:</span> {address?.name}, {address?.line1}, {address?.city} {address?.pincode}
              </p>
              <p>
                <span className="text-muted">Slot:</span> {slot?.date} · {slot?.label}
              </p>
              <p>
                <span className="text-muted">Payment:</span> {METHODS.find((m) => m.id === method)?.title}
              </p>
            </div>
            <button className="btn-primary mt-5 w-full" disabled={blocked || placing || processing || quoting} onClick={place}>
              {placing || processing ? <Spinner className="size-4 text-current" /> : null}
              {method === 'online' ? `Pay ${formatINR(total)}` : `Place order · ${formatINR(total)}`}
            </button>
            <p className="mt-2 text-center text-xs text-muted">
              By placing this order you agree to our <Link to="/terms" className="link">terms</Link> and{' '}
              <Link to="/refund-policy" className="link">refund policy</Link>.
            </p>
          </StepCard>
        </div>

        <aside className="lg:sticky lg:top-36 lg:self-start">{summary}</aside>
      </div>
    </div>
  )
}
