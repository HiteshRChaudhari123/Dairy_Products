// Helpers for memberships, plan subscriptions and payments. Billing money comes from the API in integer paise.
import { FREQUENCY_LABEL, WEEKDAYS } from './format'
import { loadRazorpay } from './razorpay'

export const formatMinor = (minor = 0, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: minor % 100 ? 2 : 0 }).format((minor || 0) / 100)

export const toMinor = (rupees) => Math.round(Number(rupees || 0) * 100)
export const fromMinor = (minor) => Math.round(Number(minor || 0)) / 100

export const INTERVAL_LABEL = { month: 'month', quarter: 'quarter', year: 'year', custom: 'term' }
export const FREQUENCY_TEXT = { daily: 'Every day', alternate: 'Alternate days', weekly: 'Once a week', custom: 'Selected weekdays' }
export const BILLING_MODE_TEXT = { prepaid: 'Prepaid: pay for the delivery window up front', per_delivery: 'Pay per delivery from your wallet, else cash' }

export const PURPOSE_LABEL = {
  membership: 'Membership',
  membership_renewal: 'Membership renewal',
  subscription_prepay: 'Subscription payment',
  subscription_topup: 'Subscription top-up',
}
export const PROVIDER_LABEL = { razorpay: 'UPI / card (Razorpay)', wallet: 'Gavyora wallet', free: 'No payment due' }

/** A fresh key per checkout attempt: the server returns the same payment for a repeated key instead of charging twice. */
export const newIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`

/** Plan price line, e.g. "₹99 / month" or "Free". */
export function planPriceText(version) {
  if (!version) return ''
  if (!version.priceMinor) return 'No plan fee'
  const per = version.interval === 'custom' ? `${version.durationDays} days` : INTERVAL_LABEL[version.interval]
  return `${formatMinor(version.priceMinor, version.currency)} / ${per}`
}

/** Plain-language benefit lines built only from what the plan actually configures. */
export function benefitLines(version) {
  const b = version?.benefits || {}
  const out = []
  if (b.discountPercent > 0) {
    let s = `${b.discountPercent}% off store orders`
    if (b.maxDiscountPerOrderMinor > 0) s += ` (up to ${formatMinor(b.maxDiscountPerOrderMinor)} per order)`
    if (b.minOrderForDiscountMinor > 0) s += ` above ${formatMinor(b.minOrderForDiscountMinor)}`
    out.push(s)
  }
  if (b.freeDelivery) out.push(b.freeDeliveryMinOrderMinor > 0 ? `Free delivery on orders above ${formatMinor(b.freeDeliveryMinOrderMinor)}` : 'Free delivery on every order')
  if (b.ordersPerTermLimit > 0) out.push(`Benefits apply to ${b.ordersPerTermLimit} orders per term`)
  if (b.prioritySupport) out.push('Priority customer support')
  for (const o of b.exclusiveOffers || []) out.push(o)
  for (const p of b.perks || []) out.push(p)
  return out
}

/** Pause / cancellation / renewal policy lines shown before purchase. */
export function policyLines(version, kind) {
  const p = version?.policies || {}
  const out = []
  if (kind === 'product' || p.pause) {
    if (p.pause?.allowed === false) out.push('Pausing deliveries is not allowed on this plan')
    else if (p.pause) out.push(`Pause deliveries for ${p.pause.minDays}–${p.pause.maxDays} days at a time${p.pause.noticeDays ? `, with ${p.pause.noticeDays} days' notice` : ''}`)
  }
  const c = p.cancellation || {}
  if (kind === 'membership') {
    out.push(c.mode === 'immediate' ? 'Cancelling ends the membership straight away' : 'Cancelling stops renewal; benefits last until the end of the paid term')
    out.push(c.refund === 'prorata' ? 'Unused days are refunded to your wallet (pro-rata) on cancellation' : 'The membership fee is not refundable')
  } else {
    out.push(c.refundUnusedBalance === false ? 'Unused prepaid balance is not refunded on cancellation' : 'Unused prepaid balance is refunded to your wallet if you cancel')
  }
  if (p.renewal?.autoRenewAllowed === false) out.push('Renews manually only')
  if (p.gracePeriodDays) out.push(`${p.gracePeriodDays}-day grace period if a renewal payment fails`)
  return out
}

/**
 * Open the Razorpay checkout for a server-created gateway order. Resolves with the gateway's success response
 * (which the server must still verify), or null if the customer closed the window.
 */
export async function openRazorpay({ razorpay, description }) {
  if (!(await loadRazorpay())) throw new Error('Could not load the payment window. Check your connection.')
  return new Promise((resolve) => {
    const rzp = new window.Razorpay({
      key: razorpay.keyId,
      order_id: razorpay.orderId,
      amount: razorpay.amount,
      currency: razorpay.currency,
      name: 'Gavyora',
      description,
      prefill: { name: razorpay.name, email: razorpay.email, contact: razorpay.contact },
      theme: { color: '#101D35' },
      handler: (response) => resolve(response),
      modal: { ondismiss: () => resolve(null) },
    })
    rzp.open()
  })
}

/** "Mon, Wed, Fri" for custom schedules, else the frequency label. */
export const scheduleText = (s) => (s.frequency === 'custom' ? (s.days || []).map((d) => WEEKDAYS[d]).join(', ') : FREQUENCY_LABEL[s.frequency])
