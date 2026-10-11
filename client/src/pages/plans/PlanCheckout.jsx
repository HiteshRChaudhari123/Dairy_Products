import { AlertTriangle, ArrowLeft, Check, CreditCard, Info, Lock, Minus, Plus, Trash2, Wallet } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useSelector } from 'react-redux'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { errorMessage, useMyMembershipQuery, usePlanCheckoutMutation, usePlanQuery, usePlanQuoteMutation, useVerifyTransactionMutation } from '../../app/api'
import PlanCard from '../../components/PlanCard'
import ProductImage from '../../components/ProductImage'
import { EmptyState, ErrorState, Field, PageLoader, Spinner } from '../../components/ui'
import { selectUser } from '../../features/auth/authSlice'
import { formatMinor, FREQUENCY_TEXT, newIdempotencyKey, openRazorpay } from '../../lib/billing'
import { formatDate, WEEKDAYS } from '../../lib/format'
import { usePageMeta } from '../../lib/meta'

const LIVE = ['pending_payment', 'active', 'cancellation_pending', 'past_due', 'suspended']

function Section({ n, title, children }) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 flex items-center gap-2 font-semibold">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-sm text-brand">{n}</span> {title}
      </h2>
      {children}
    </section>
  )
}

function ProductPicker({ catalog, items, setItems, pv }) {
  const max = pv.maxItems || 5
  const minQ = pv.minQty || 1
  const maxQ = pv.maxQty || 10
  const has = (vid) => items.some((i) => i.variantId === vid)
  const setQty = (vid, qty) => setItems(items.map((i) => (i.variantId === vid ? { ...i, qty: Math.min(maxQ, Math.max(minQ, qty)) } : i)))
  return (
    <div className="space-y-4">
      {items.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {items.map((i) => {
            const p = catalog.find((x) => x._id === i.product)
            const v = p?.variants.find((x) => x._id === i.variantId)
            return (
              <li key={i.variantId} className="flex flex-wrap items-center gap-3 p-3">
                <div className="w-12 shrink-0">
                  <ProductImage product={p} size="text-xl" rounded="rounded-lg" sizes="48px" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p?.name}</p>
                  <p className="text-xs text-muted">
                    {v?.label} · {formatMinor(Math.round((v?.planPrice || 0) * 100))} each
                  </p>
                </div>
                <div className="inline-flex items-center overflow-hidden rounded-full border border-line-strong">
                  <button type="button" className="flex size-9 items-center justify-center hover:bg-primary-soft disabled:opacity-40" disabled={i.qty <= minQ} onClick={() => setQty(i.variantId, i.qty - 1)} aria-label={`Fewer ${p?.name}`}>
                    <Minus className="size-4" />
                  </button>
                  <span className="min-w-8 text-center text-sm font-semibold">{i.qty}</span>
                  <button type="button" className="flex size-9 items-center justify-center hover:bg-primary-soft disabled:opacity-40" disabled={i.qty >= maxQ} onClick={() => setQty(i.variantId, i.qty + 1)} aria-label={`More ${p?.name}`}>
                    <Plus className="size-4" />
                  </button>
                </div>
                <button type="button" className="btn-ghost btn-sm px-2 text-error" onClick={() => setItems(items.filter((x) => x.variantId !== i.variantId))} aria-label={`Remove ${p?.name}`}>
                  <Trash2 className="size-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-xs text-muted">
        {items.length}/{max} products · {minQ}–{maxQ} of each per delivery
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {catalog.map((p) => (
          <div key={p._id} className="flex gap-3 rounded-xl border border-line p-3">
            <div className="w-14 shrink-0">
              <ProductImage product={p} size="text-2xl" rounded="rounded-lg" sizes="56px" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.variants.map((v) => {
                  const on = has(v._id)
                  return (
                    <button
                      key={v._id}
                      type="button"
                      disabled={on || !v.inStock || items.length >= max}
                      onClick={() => setItems([...items, { product: p._id, variantId: v._id, qty: minQ }])}
                      className={`rounded-lg border px-2.5 py-1.5 text-left text-xs transition disabled:cursor-not-allowed ${on ? 'border-primary bg-primary text-on-primary' : 'border-line hover:border-accent disabled:opacity-50'}`}
                      aria-pressed={on}
                    >
                      <span className="block font-semibold">
                        {on && <Check className="mr-0.5 inline size-3" />}
                        {v.label}
                      </span>
                      <span className="block">
                        {formatMinor(Math.round(v.planPrice * 100))}
                        {v.planPrice < v.price && <span className="ml-1 line-through opacity-60">{formatMinor(Math.round(v.price * 100))}</span>}
                      </span>
                      {!v.inStock && <span className="block">Out of stock</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PlanCheckout() {
  const { slug } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const user = useSelector(selectUser)
  const { data: plan, isLoading, error, refetch } = usePlanQuery(slug)
  const { data: mine } = useMyMembershipQuery(undefined, { skip: !user })
  const [runQuote, { data: quoted, error: quoteError, isLoading: quoting, reset: resetQuote }] = usePlanQuoteMutation()
  const [checkout, { isLoading: paying }] = usePlanCheckoutMutation()
  const [verify] = useVerifyTransactionMutation()
  const keyRef = useRef(newIdempotencyKey())
  usePageMeta(plan?.version?.name, plan?.version?.tagline)

  const v = plan?.version
  const pv = v?.product || {}
  const isProduct = plan?.kind === 'product'
  const addresses = useMemo(() => user?.addresses || [], [user])
  const [form, setForm] = useState(null)
  const [accept, setAccept] = useState(false)
  const [method, setMethod] = useState('wallet')
  const [autoRenew, setAutoRenew] = useState(false)

  // Initialise once the plan arrives (preselecting a product passed in the URL when the plan allows it).
  useEffect(() => {
    if (!plan || form) return
    const pick = plan.catalog?.find((p) => p._id === params.get('product'))
    const variant = pick?.variants.find((x) => x._id === params.get('variant') && x.inStock) || pick?.variants.find((x) => x.inStock)
    setForm({
      items: variant ? [{ product: pick._id, variantId: variant._id, qty: plan.version.product?.minQty || 1 }] : [],
      frequency: plan.version.product?.frequencies?.[0] || 'daily',
      days: [1, 3, 5],
      startDate: plan.checkout?.earliestStart,
      slot: plan.checkout?.slots?.[0],
      addressId: (addresses.find((a) => a.isDefault) || addresses[0])?._id || '',
    })
    if (!plan.checkout?.onlinePayments) setMethod('wallet')
  }, [plan, form, params, addresses])

  const input = useMemo(() => {
    if (!form || !isProduct) return {}
    return { items: form.items, frequency: form.frequency, days: form.frequency === 'custom' ? form.days : undefined, startDate: form.startDate, slot: form.slot, addressId: form.addressId }
  }, [form, isProduct])

  // Re-price on the server whenever the selection changes (prices are never computed in the browser).
  useEffect(() => {
    if (!user || !plan || !form) return
    if (isProduct && (!input.items.length || !input.addressId || !input.startDate)) return resetQuote()
    if (!isProduct && !addresses.length) return
    const t = setTimeout(() => runQuote({ slug, ...input }).catch(() => {}), 250)
    return () => clearTimeout(t)
  }, [user, plan, form, input, isProduct, addresses.length, slug, runQuote, resetQuote])

  if (isLoading || (plan && !form)) return <PageLoader />
  if (error?.status === 404 || error?.status === 400)
    return (
      <div className="container-page py-6">
        <EmptyState icon="🔍" title="This plan isn't available" text={errorMessage(error)} action={<Link to="/plans" className="btn-primary">See all plans</Link>} />
      </div>
    )
  if (error) return <ErrorState error={error} onRetry={refetch} />

  const q = quoted?.quote
  const liveMembership = !isProduct && mine?.current && LIVE.includes(mine.current.status) ? mine.current : null
  const walletMinor = Math.round((quoted?.walletBalance ?? user?.wallet ?? 0) * 100)
  const walletShort = q && method === 'wallet' && q.totalMinor > walletMinor
  const autoRenewAllowed = v.policies?.renewal?.autoRenewAllowed !== false && (!isProduct || pv.billingMode === 'prepaid')
  const ready = !!q && accept && !walletShort && !paying && (q.totalMinor === 0 || method)

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const pay = async () => {
    try {
      const res = await checkout({ slug, ...input, idempotencyKey: keyRef.current, acceptTerms: true, paymentMethod: method, autoRenew: autoRenewAllowed && autoRenew }).unwrap()
      const tx = res.transaction
      if (res.razorpay) {
        const rp = await openRazorpay({ razorpay: res.razorpay, description: v.name })
        if (rp) {
          try {
            await verify({ id: tx._id, ...rp }).unwrap()
          } catch (e) {
            toast.error(errorMessage(e, 'We could not confirm the payment yet. We will keep checking.'))
          }
        } else toast('Payment window closed. Nothing has been activated.', { icon: 'ℹ️' })
      }
      keyRef.current = newIdempotencyKey()
      navigate(`/plans/payment/${tx._id}`, { replace: true })
    } catch (e) {
      keyRef.current = newIdempotencyKey() // a failed attempt must not block a corrected retry
      toast.error(errorMessage(e))
    }
  }

  const loginNext = `/login?next=${encodeURIComponent(`/plans/${slug}`)}`

  return (
    <div className="container-page py-6">
      <Link to="/plans" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-accent">
        <ArrowLeft className="size-4" /> All plans
      </Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <div>
            <p className="eyebrow">{isProduct ? 'Product subscription' : 'Membership'}</p>
            <h1 className="h-page mt-1">{v.name}</h1>
            {v.description && <p className="mt-2 max-w-2xl text-muted">{v.description}</p>}
          </div>

          {!user ? (
            <div className="card p-6 text-center">
              <p className="text-muted">Log in to choose your options and see your exact price.</p>
              <Link to={loginNext} className="btn-primary mt-4">
                Log in to continue
              </Link>
            </div>
          ) : liveMembership ? (
            <div className="card flex flex-wrap items-center gap-4 p-5">
              <Info className="size-6 shrink-0 text-brand" />
              <p className="min-w-0 flex-1 text-sm">You already have a membership ({liveMembership.terms?.name}). You can renew it or switch plans from My membership.</p>
              <Link to="/account/membership" className="btn-primary btn-sm">
                My membership
              </Link>
            </div>
          ) : (
            <>
              {isProduct && (
                <>
                  <Section n="1" title="Choose products">
                    {plan.catalog?.length ? <ProductPicker catalog={plan.catalog} items={form.items} setItems={(items) => set({ items })} pv={pv} /> : <p className="text-sm text-muted">No products are available on this plan right now.</p>}
                  </Section>
                  <Section n="2" title="Delivery schedule">
                    <div className="grid gap-2 sm:grid-cols-4">
                      {(pv.frequencies || []).map((f) => (
                        <button key={f} type="button" onClick={() => set({ frequency: f })} aria-pressed={form.frequency === f} className={`min-h-11 rounded-xl border-2 px-3 text-sm ${form.frequency === f ? 'border-gold bg-selected font-semibold text-brand' : 'border-line hover:border-accent'}`}>
                          {FREQUENCY_TEXT[f]}
                        </button>
                      ))}
                    </div>
                    {form.frequency === 'custom' && (
                      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Delivery days">
                        {WEEKDAYS.map((d, i) => {
                          const on = form.days.includes(i)
                          return (
                            <button key={d} type="button" aria-pressed={on} onClick={() => set({ days: on ? form.days.filter((x) => x !== i) : [...form.days, i].sort() })} className={`size-11 rounded-full text-sm font-medium ${on ? 'bg-primary text-on-primary' : 'bg-surface-2'}`}>
                              {d}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {form.frequency === 'weekly' && <p className="mt-2 text-xs text-muted">Weekly deliveries fall on the same weekday as your start date.</p>}
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <Field label="Start date" hint={`Earliest: ${formatDate(plan.checkout.earliestStart + 'T00:00:00')} (changes lock at the nightly cut-off)`}>
                        <input type="date" className="input" min={plan.checkout.earliestStart} value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} required />
                      </Field>
                      <Field label="Delivery time">
                        <select className="input" value={form.slot} onChange={(e) => set({ slot: e.target.value })}>
                          {(plan.checkout.slots || []).map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  </Section>
                </>
              )}

              <Section n={isProduct ? '3' : '1'} title={isProduct ? 'Delivery address' : 'Your address'}>
                {addresses.length === 0 ? (
                  <p className="text-sm">
                    Add an address first so we can check this plan is available in your area.{' '}
                    <Link to="/account/addresses" className="link">
                      Add an address
                    </Link>
                  </p>
                ) : isProduct ? (
                  <div className="space-y-2">
                    {addresses.map((a) => (
                      <label key={a._id} className={`flex cursor-pointer gap-3 rounded-xl border-2 p-3 text-sm ${a._id === form.addressId ? 'border-gold bg-selected' : 'border-line'}`}>
                        <input type="radio" name="address" className="mt-1 accent-primary" checked={a._id === form.addressId} onChange={() => set({ addressId: a._id })} />
                        <span>
                          <b>{a.label}</b> · {a.name} · {a.phone}
                          <span className="block text-muted">
                            {a.line1}, {a.city} – {a.pincode}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">
                    Availability is checked against your default address ({(addresses.find((a) => a.isDefault) || addresses[0]).pincode}).{' '}
                    <Link to="/account/addresses" className="link">
                      Change default
                    </Link>
                  </p>
                )}
              </Section>

              <Section n={isProduct ? '4' : '2'} title="Payment">
                <div className="space-y-2">
                  {[
                    ['wallet', Wallet, 'Gavyora wallet', `Balance ${formatMinor(walletMinor)}`],
                    plan.checkout.onlinePayments && ['razorpay', CreditCard, 'UPI / card / netbanking', 'Secure payment with Razorpay'],
                  ]
                    .filter(Boolean)
                    .map(([id, Icon, title, text]) => (
                      <label key={id} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 p-3 ${method === id ? 'border-gold bg-selected' : 'border-line'}`}>
                        <input type="radio" name="pay" className="accent-primary" checked={method === id} onChange={() => setMethod(id)} />
                        <Icon className="size-5 text-brand" />
                        <span className="flex-1">
                          <span className="block text-sm font-semibold">{title}</span>
                          <span className="block text-xs text-muted">{text}</span>
                        </span>
                        {id === 'wallet' && walletShort && (
                          <Link to="/account/wallet" className="text-xs font-medium text-brand">
                            Add money
                          </Link>
                        )}
                      </label>
                    ))}
                  {!plan.checkout.onlinePayments && <p className="text-xs text-muted">Online payment is not switched on yet, so plans are paid from your wallet.</p>}
                </div>
                {autoRenewAllowed && (
                  <label className="mt-4 flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} />
                    <span>
                      {isProduct ? 'Top up automatically from my wallet when the balance runs low' : 'Renew automatically from my wallet at the end of each term'}
                      <span className="block text-xs text-muted">You can switch this off any time. Nothing is charged to a card automatically.</span>
                    </span>
                  </label>
                )}
              </Section>
            </>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-36 lg:self-start">
          {user && !liveMembership ? (
            <div className="card p-5">
              <h2 className="mb-3 font-semibold">Price breakdown</h2>
              {quoteError ? (
                <p className="flex gap-2 rounded-xl bg-error/10 p-3 text-sm text-error">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {errorMessage(quoteError)}
                </p>
              ) : !q ? (
                <p className="text-sm text-muted">{quoting ? <Spinner /> : isProduct ? 'Choose at least one product and an address to see your price.' : addresses.length ? <Spinner /> : 'Add an address to see your price.'}</p>
              ) : (
                <>
                  <dl className={`space-y-2 text-sm ${quoting ? 'opacity-60' : ''}`}>
                    {q.lines.map((l) => (
                      <div key={l.description} className="flex justify-between gap-3">
                        <dt className="text-muted">{l.description}</dt>
                        <dd className="shrink-0">{formatMinor(l.amountMinor)}</dd>
                      </div>
                    ))}
                    {q.discountMinor > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-muted">Discount</dt>
                        <dd className="text-success">−{formatMinor(q.discountMinor)}</dd>
                      </div>
                    )}
                    {q.taxMinor > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-muted">GST ({q.taxPercent}%) on plan fee</dt>
                        <dd>{formatMinor(q.taxMinor)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-line pt-3 text-base font-semibold">
                      <dt>Pay now</dt>
                      <dd>{formatMinor(q.totalMinor)}</dd>
                    </div>
                  </dl>
                  {isProduct && (
                    <ul className="mt-3 space-y-1 rounded-xl bg-surface-2 p-3 text-xs text-muted">
                      <li>
                        Each delivery: <b className="text-ink">{formatMinor(q.perDeliveryMinor)}</b>
                        {q.goodsTaxPercent > 0 && ` incl. ${q.goodsTaxPercent}% tax`}
                      </li>
                      {q.firstDelivery && <li>First delivery: {formatDate(q.firstDelivery + 'T00:00:00', { weekday: 'short', day: 'numeric', month: 'short' })}</li>}
                      {q.billingMode === 'prepaid' ? (
                        <li>
                          {q.deliveries} deliveries in the first {q.prepayDays} days are prepaid. Skipped days stay in your balance.
                        </li>
                      ) : (
                        <li>Each delivery is paid from your wallet the night before, or in cash if the wallet is low.</li>
                      )}
                      {q.savingsMinor > 0 && <li className="font-medium text-success">You save {formatMinor(q.savingsMinor)} against today's store prices</li>}
                    </ul>
                  )}
                  {!isProduct && <p className="mt-3 text-xs text-muted">Covers {q.durationDays} days from activation.</p>}
                </>
              )}

              {v.termsText && (
                <details className="mt-4 rounded-xl border border-line p-3 text-xs">
                  <summary className="cursor-pointer font-medium">Plan terms</summary>
                  <p className="mt-2 whitespace-pre-line text-muted">{v.termsText}</p>
                </details>
              )}
              <label className="mt-4 flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
                <span>
                  I accept the plan terms, the pause and cancellation policy, and the{' '}
                  <Link to="/terms" target="_blank" className="link">
                    terms of service
                  </Link>
                  .
                </span>
              </label>
              <button className="btn-primary mt-4 w-full" disabled={!ready} onClick={pay}>
                {paying ? <Spinner className="size-4 text-current" /> : <Lock className="size-4" />}
                {q ? (q.totalMinor === 0 ? 'Activate' : `Pay ${formatMinor(q.totalMinor)}`) : 'Pay'}
              </button>
              <p className="mt-2 text-center text-xs text-muted">Your plan starts only after the payment is confirmed.</p>
            </div>
          ) : (
            <PlanCard plan={plan} to={user ? undefined : loginNext} cta={user ? 'Current membership' : 'Log in to subscribe'} />
          )}
        </aside>
      </div>
    </div>
  )
}
