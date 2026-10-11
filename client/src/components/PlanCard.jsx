import { ArrowRight, BadgeCheck, CalendarDays, Crown, PauseCircle, RefreshCw, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { benefitLines, BILLING_MODE_TEXT, formatMinor, FREQUENCY_TEXT, planPriceText, policyLines } from '../lib/billing'

/**
 * Customer-facing plan card. Everything shown comes from the plan's published version: nothing is invented here.
 * `to` is the action link; omit it (admin preview) to render a non-interactive button.
 */
export default function PlanCard({ plan, to, cta, highlight = false }) {
  const v = plan.version || {}
  const product = plan.kind === 'product'
  const Icon = product ? RefreshCw : Crown
  const benefits = product ? [] : benefitLines(v)
  const policies = policyLines(v, plan.kind)
  const pv = v.product || {}
  const tax = v.taxPercent > 0 && v.priceMinor > 0 ? `+ ${v.taxPercent}% GST on the plan fee` : null

  return (
    <article className={`card flex h-full flex-col p-5 sm:p-6 ${highlight ? 'ring-2 ring-accent/40' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-brand">
          <Icon className="size-5" strokeWidth={1.5} aria-hidden />
        </span>
        <span className="chip bg-surface-2 text-muted">{product ? 'Product subscription' : 'Membership'}</span>
      </div>
      <h3 className="mt-4 font-heading text-2xl font-semibold">{v.name || plan.name}</h3>
      {v.tagline && <p className="mt-1 text-sm text-muted">{v.tagline}</p>}

      <p className="mt-4 font-heading text-[28px] leading-none font-semibold">{planPriceText(v)}</p>
      <p className="mt-1 text-xs text-muted">
        {product ? (pv.billingMode === 'prepaid' ? `Plus your products, prepaid for ${pv.prepayDays} days at a time` : 'Plus your products, paid per delivery') : `Lasts ${v.durationDays} days`}
        {tax ? ` · ${tax}` : ''}
      </p>

      {product ? (
        <ul className="mt-5 space-y-2 text-sm">
          <li className="flex gap-2">
            <BadgeCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            {BILLING_MODE_TEXT[pv.billingMode] || 'Recurring deliveries'}
          </li>
          {pv.discountPercent > 0 && (
            <li className="flex gap-2">
              <BadgeCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden /> {pv.discountPercent}% below today's store price on eligible products
            </li>
          )}
          <li className="flex gap-2">
            <CalendarDays className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            {(pv.frequencies || []).map((f) => FREQUENCY_TEXT[f]).join(' · ')}
          </li>
          <li className="flex gap-2">
            <Truck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            {pv.deliveryFeeMinor > 0 ? `${formatMinor(pv.deliveryFeeMinor)} delivery fee per delivery` : 'No delivery fee'}
          </li>
          <li className="flex gap-2">
            <BadgeCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            Up to {pv.maxItems} products, {pv.minQty}–{pv.maxQty} of each per delivery
          </li>
        </ul>
      ) : (
        benefits.length > 0 && (
          <ul className="mt-5 space-y-2 text-sm">
            {benefits.map((b) => (
              <li key={b} className="flex gap-2">
                <BadgeCheck className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden /> {b}
              </li>
            ))}
          </ul>
        )
      )}

      {policies.length > 0 && (
        <ul className="mt-5 space-y-1.5 border-t border-line pt-4 text-xs text-muted">
          {policies.map((p) => (
            <li key={p} className="flex gap-2">
              <PauseCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {p}
            </li>
          ))}
        </ul>
      )}
      {v.availability && v.availability.allZones === false && <p className="mt-3 text-xs text-muted">Available in selected delivery areas only.</p>}

      <div className="mt-auto pt-6">
        {to ? (
          <Link to={to} className="btn-primary w-full">
            {cta || (product ? 'Choose products' : 'Become a member')} <ArrowRight className="size-4" />
          </Link>
        ) : (
          <span className="btn-primary w-full opacity-80">{cta || 'Subscribe'}</span>
        )}
      </div>
    </article>
  )
}
