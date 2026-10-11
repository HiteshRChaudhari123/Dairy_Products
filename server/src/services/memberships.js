// Membership lifecycle and member benefits.
//
//   pending_payment ──paid──▶ active ──cancel (end of term)──▶ cancellation_pending ──term ends──▶ cancelled
//         │                    │  ▲                                    │ undo ─▶ active
//    abandoned ▶ failed        │  └──renewed── past_due (grace) ──grace ends──▶ expired
//                              ├──term ends, no renewal──▶ past_due / expired
//                              ├──cancel (immediate)──▶ cancelled
//                              └──suspend (override)──▶ suspended ──reinstate──▶ active
import { BENEFIT_STATES, Membership, PaymentTransaction, termsOf } from '../models/billing.js'
import Order from '../models/Order.js'
import { httpError } from '../utils/http.js'
import { DAY_MS, formatMinor, recordEvent } from './common.js'
import { notify } from './notify.js'
import { collect, createTransaction, onPaid, requestRefund } from './payments.js'
import { versionById } from './plans.js'

const TRANSITIONS = {
  pending_payment: ['active', 'failed'],
  active: ['cancellation_pending', 'past_due', 'expired', 'cancelled', 'suspended', 'active'],
  cancellation_pending: ['active', 'cancelled', 'suspended'],
  past_due: ['active', 'expired', 'cancelled', 'suspended'],
  suspended: ['active', 'cancelled', 'expired'],
  failed: ['active'], // a late but verified payment for an abandoned checkout
  cancelled: [],
  expired: [],
}

export const canTransitionMembership = (from, to) => TRANSITIONS[from]?.includes(to)
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

export async function setMembershipStatus(m, to, { req, note, type = 'status', data, actorName } = {}) {
  const from = m.status
  if (from !== to && !canTransitionMembership(from, to)) throw httpError(400, `A ${from.replaceAll('_', ' ')} membership cannot become ${to.replaceAll('_', ' ')}`)
  m.status = to
  await m.save()
  await recordEvent({ entityType: 'membership', entity: m._id, user: m.user, type, from, to, req, note, data, actorName })
  return m
}

/** The membership whose benefits apply right now, or null. */
export async function benefitMembership(userId) {
  const m = await Membership.findOne({ user: userId, status: { $in: BENEFIT_STATES } })
  if (!m) return null
  if (m.status === 'past_due' && (!m.graceUntil || m.graceUntil < new Date())) return null
  return m
}

/**
 * Member discount and free delivery for a store order (rupees in, rupees out). Applied by the order quote, so every
 * total the customer sees and pays is computed on the server.
 */
export async function memberPricing(userId, { afterCoupon }) {
  const none = { discount: 0, freeDelivery: false, membership: null }
  if (!userId) return none
  const m = await benefitMembership(userId)
  if (!m) return none
  const b = m.terms?.benefits || {}
  if (b.ordersPerTermLimit > 0) {
    const used = await Order.countDocuments({
      membership: m._id,
      createdAt: { $gte: m.currentPeriodStart },
      status: { $nin: ['cancelled'] },
      $or: [{ memberDiscount: { $gt: 0 } }, { memberFreeDelivery: true }],
    })
    if (used >= b.ordersPerTermLimit) return { ...none, membership: m, limitReached: true, planName: m.terms.name }
  }
  let discount = 0
  if (b.discountPercent > 0 && afterCoupon * 100 >= (b.minOrderForDiscountMinor || 0)) {
    discount = (afterCoupon * b.discountPercent) / 100
    if (b.maxDiscountPerOrderMinor > 0) discount = Math.min(discount, b.maxDiscountPerOrderMinor / 100)
    discount = Math.min(Math.round(discount), afterCoupon)
  }
  const freeDelivery = !!b.freeDelivery && (afterCoupon - discount) * 100 >= (b.freeDeliveryMinOrderMinor || 0)
  return { discount, freeDelivery, membership: m, planName: m.terms.name }
}

/** Start a new membership checkout (or replay it for the same idempotency key). */
export async function startMembershipCheckout({ user, plan, version, quote, paymentMethod, idempotencyKey, autoRenew }) {
  const prior = await PaymentTransaction.findOne({ user: user._id, idempotencyKey })
  if (prior) return { tx: prior, membership: await Membership.findById(prior.membership), payment: prior.status === 'created' ? await collect(prior, user) : {} }

  const live = await Membership.findOne({ user: user._id, status: { $in: ['active', 'cancellation_pending', 'past_due', 'suspended'] } })
  if (live) throw httpError(409, 'You already have a membership. Renew or change it from My membership.')
  // An earlier unpaid checkout is abandoned in favour of this one.
  for (const old of await Membership.find({ user: user._id, status: 'pending_payment' })) {
    await PaymentTransaction.updateMany({ membership: old._id, status: 'created' }, { $set: { status: 'expired' }, $push: { history: { status: 'expired', note: 'Replaced by a new checkout' } } })
    await setMembershipStatus(old, 'failed', { note: 'Replaced by a new checkout' })
  }
  const membership = await Membership.create({
    user: user._id,
    plan: plan._id,
    planVersion: version._id,
    terms: termsOf(version),
    status: 'pending_payment',
    autoRenew: !!autoRenew && version.policies?.renewal?.autoRenewAllowed !== false,
    termsAcceptedAt: new Date(),
  })
  await recordEvent({ entityType: 'membership', entity: membership._id, user: user._id, type: 'checkout_started', to: 'pending_payment', actorName: user.name, data: { totalMinor: quote.totalMinor } })
  const provider = quote.totalMinor === 0 ? 'free' : paymentMethod
  const { tx } = await createTransaction({
    user,
    idempotencyKey,
    purpose: 'membership',
    membership: membership._id,
    planVersion: version._id,
    provider,
    currency: quote.currency,
    amountMinor: quote.totalMinor,
    breakdown: quote,
  })
  const payment = await collect(tx, user)
  return { tx: await PaymentTransaction.findById(tx._id), membership: await Membership.findById(membership._id), payment }
}

/**
 * Price of the next term: the agreed terms, or the plan the customer switched to (applies from this renewal).
 * The single source for both the renewal charge and what the customer is shown before paying.
 */
export async function renewalQuote(membership) {
  if (!['active', 'cancellation_pending', 'past_due'].includes(membership.status)) throw httpError(400, 'This membership cannot be renewed. Buy a new one instead.')
  const version = membership.nextPlanVersion ? await versionById(membership.nextPlanVersion) : null
  const terms = version ? termsOf(version) : membership.terms
  const fee = terms.priceMinor
  const tax = Math.round((fee * (terms.taxPercent || 0)) / 100)
  const quote = {
    currency: terms.currency,
    planName: terms.name,
    lines: [{ description: `${terms.name} renewal · ${terms.durationDays} days`, qty: 1, unitMinor: fee, amountMinor: fee }],
    subtotalMinor: fee,
    discountMinor: 0,
    taxPercent: terms.taxPercent,
    taxMinor: tax,
    totalMinor: fee + tax,
    durationDays: terms.durationDays,
  }
  return { version, quote }
}

/** Pay for the next term now (manual renewal), from the wallet or online. */
export async function startRenewal({ membership, user, paymentMethod, idempotencyKey, auto = false }) {
  const { version, quote: base } = await renewalQuote(membership)
  const quote = { ...base, auto }
  const { tx } = await createTransaction({
    user,
    idempotencyKey,
    purpose: 'membership_renewal',
    membership: membership._id,
    planVersion: version?._id || membership.planVersion,
    provider: quote.totalMinor === 0 ? 'free' : paymentMethod,
    currency: quote.currency,
    amountMinor: quote.totalMinor,
    breakdown: quote,
  })
  const payment = tx.status === 'created' ? await collect(tx, user) : {}
  return { tx: await PaymentTransaction.findById(tx._id), payment }
}

/** Fulfilment for verified membership payments (first purchase and renewals). */
async function onMembershipPaid(tx) {
  const m = await Membership.findById(tx.membership)
  if (!m) throw new Error('Membership not found')
  const now = new Date()
  if (tx.purpose === 'membership') {
    if (m.status === 'active' && m.startedAt) return // already activated by another path
    const duration = m.terms.durationDays * DAY_MS
    Object.assign(m, { startedAt: now, currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + duration) })
    try {
      await setMembershipStatus(m, 'active', { type: 'activated', note: `Paid ${formatMinor(tx.amountMinor)} (${tx.provider})`, data: { transaction: tx._id } })
    } catch (e) {
      // A late payment for an abandoned checkout while another membership is live: give the money back.
      if (e.code !== 11000 && !/cannot become/.test(e.message)) throw e
      await requestRefund({ tx, amountMinor: tx.amountMinor, reason: 'Payment received for a checkout that had already closed', auto: true })
      return
    }
    await notify(m.user, 'membership_activated', { plan: m.terms.name, until: fmtDate(m.currentPeriodEnd) }, { key: `mbr-activated:${m._id}`, link: '/account/membership' })
    return
  }
  // Renewal: the new term starts when the current one ends (or now, if it already ended).
  if (tx.planVersion && String(tx.planVersion) !== String(m.planVersion)) {
    const v = await versionById(tx.planVersion)
    m.planVersion = v._id
    m.plan = v.plan
    m.terms = termsOf(v)
    m.nextPlanVersion = undefined
  }
  const base = m.currentPeriodEnd && m.currentPeriodEnd > now ? m.currentPeriodEnd : now
  Object.assign(m, {
    currentPeriodStart: base,
    currentPeriodEnd: new Date(base.getTime() + m.terms.durationDays * DAY_MS),
    graceUntil: undefined,
    renewalAttempts: 0,
    nextRetryAt: undefined,
    cancelAt: undefined,
  })
  await setMembershipStatus(m, 'active', { type: 'renewed', note: `Paid ${formatMinor(tx.amountMinor)} (${tx.provider})`, data: { transaction: tx._id } })
  await notify(m.user, 'membership_renewed', { plan: m.terms.name, until: fmtDate(m.currentPeriodEnd) }, { key: `mbr-renewed:${tx._id}`, link: '/account/membership' })
}
onPaid(['membership', 'membership_renewal'], onMembershipPaid)

/** Cancel per the plan policy (end of term, or immediately with an optional pro-rata refund). */
export async function cancelMembership(m, { reason, req, immediate = false }) {
  if (!['active', 'cancellation_pending', 'past_due', 'suspended'].includes(m.status)) throw httpError(400, 'This membership is not active')
  const policy = m.terms.policies?.cancellation || {}
  m.cancelReason = reason
  m.autoRenew = false
  if (!immediate && policy.mode !== 'immediate' && m.status === 'active') {
    m.cancelAt = m.currentPeriodEnd
    await setMembershipStatus(m, 'cancellation_pending', { req, type: 'cancel_requested', note: reason })
    await notify(m.user, 'membership_cancelled', { plan: m.terms.name, until: fmtDate(m.cancelAt), refund: '' }, { key: `mbr-cancel:${m._id}:${m.cancelAt.toISOString()}` })
    return { membership: m, effective: m.cancelAt, refund: null }
  }
  let refund = null
  const now = new Date()
  if (policy.refund === 'prorata' && ['active', 'cancellation_pending'].includes(m.status) && m.currentPeriodEnd > now) {
    const tx = await PaymentTransaction.findOne({ membership: m._id, status: { $in: ['paid', 'partially_refunded'] }, purpose: { $in: ['membership', 'membership_renewal'] } }).sort('-paidAt')
    if (tx && tx.amountMinor > 0) {
      const term = m.currentPeriodEnd - m.currentPeriodStart
      const unused = Math.max(0, Math.min(1, (m.currentPeriodEnd - now) / term))
      const amountMinor = Math.min(Math.floor(tx.amountMinor * unused), tx.amountMinor - tx.refundedMinor)
      if (amountMinor > 0) refund = await requestRefund({ tx, amountMinor, reason: 'Unused membership days (pro-rata)', destination: 'wallet', req, auto: true })
    }
  }
  m.cancelledAt = now
  m.cancelAt = now
  await setMembershipStatus(m, 'cancelled', { req, type: 'cancelled', note: reason, data: refund ? { refund: refund._id, amountMinor: refund.amountMinor } : undefined })
  await notify(m.user, 'membership_cancelled', { plan: m.terms.name, until: fmtDate(now), refund: refund ? ` ${formatMinor(refund.amountMinor)} will be refunded to your wallet.` : '' }, { key: `mbr-cancelled:${m._id}` })
  return { membership: m, effective: now, refund }
}

export async function undoCancellation(m, { req }) {
  if (m.status !== 'cancellation_pending') throw httpError(400, 'There is no pending cancellation')
  m.cancelAt = undefined
  m.cancelReason = undefined
  return setMembershipStatus(m, 'active', { req, type: 'cancel_undone' })
}

/** Manual overrides (super admin, or an admin request approved by one). */
export async function applyMembershipOverride(m, action, payload, { req, reason }) {
  if (action === 'suspend') return setMembershipStatus(m, 'suspended', { req, type: 'override', note: reason })
  if (action === 'reinstate') {
    const to = m.currentPeriodEnd > new Date() ? 'active' : 'expired'
    return setMembershipStatus(m, to, { req, type: 'override', note: reason })
  }
  if (action === 'extend') {
    const days = Number(payload?.days)
    if (!Number.isInteger(days) || days < 1 || days > 365) throw httpError(400, 'Extend by 1 to 365 days')
    const from = m.currentPeriodEnd
    m.currentPeriodEnd = new Date((m.currentPeriodEnd || new Date()).getTime() + days * DAY_MS)
    if (m.cancelAt) m.cancelAt = m.currentPeriodEnd
    await m.save()
    await recordEvent({ entityType: 'membership', entity: m._id, user: m.user, type: 'extended', req, note: reason, data: { days, from, to: m.currentPeriodEnd } })
    await notify(m.user, 'membership_updated', { note: `Your membership was extended by ${days} days, until ${fmtDate(m.currentPeriodEnd)}.` })
    return m
  }
  throw httpError(400, 'Unknown action')
}
