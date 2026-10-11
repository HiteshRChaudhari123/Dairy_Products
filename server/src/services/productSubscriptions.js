// Plan-based product subscriptions: checkout, prepaid balance, pause/resume, changes and cancellation.
//
//   pending_payment ──paid──▶ active ◀──▶ paused
//                               │ ▲
//                balance runs out │ └── topped up
//                               ▼
//                            past_due        any live state ──▶ cancelled · suspended (override) ◀──▶ active
import { PaymentTransaction, termsOf } from '../models/billing.js'
import { Setting } from '../models/misc.js'
import Subscription from '../models/Subscription.js'
import { httpError, pick } from '../utils/http.js'
import { addDaysKey, dateRange, firstEditableDate, formatMinor, recordEvent, todayKey } from './common.js'
import { notify } from './notify.js'
import { collect, createTransaction, onPaid, recordBalanceRefund } from './payments.js'
import { deliveryCost, deliveryDates, resolveItems, versionById } from './plans.js'

export const ADDRESS_FIELDS = ['name', 'phone', 'line1', 'line2', 'landmark', 'city', 'state', 'pincode']

const TRANSITIONS = {
  pending_payment: ['active', 'failed', 'cancelled'],
  active: ['paused', 'past_due', 'cancelled', 'suspended'],
  paused: ['active', 'cancelled', 'suspended'],
  past_due: ['active', 'cancelled', 'suspended'],
  suspended: ['active', 'cancelled'],
  failed: ['active'],
  cancelled: [],
}
export const canTransitionSubscription = (from, to) => TRANSITIONS[from]?.includes(to)

export async function setSubscriptionStatus(sub, to, { req, note, type = 'status', data, actorName } = {}) {
  const from = sub.status
  if (from !== to && !canTransitionSubscription(from, to)) throw httpError(400, `A ${from.replaceAll('_', ' ')} subscription cannot become ${to.replaceAll('_', ' ')}`)
  sub.status = to
  await sub.save()
  await recordEvent({ entityType: 'subscription', entity: sub._id, user: sub.user, type, from, to, req, note, data, actorName })
  return sub
}

/** Pause rules for a subscription (plan policy, or permissive defaults for older subscriptions). */
export const pausePolicy = (sub) => ({ allowed: true, minDays: 1, maxDays: 90, noticeDays: 0, ...(sub.terms?.policies?.pause || {}) })

/** Cost of one delivery of the regular basket, in paise. */
export const perDeliveryMinor = (sub, items = sub.items) =>
  deliveryCost(items, { deliveryFeeMinor: sub.terms?.product?.deliveryFeeMinor || 0, goodsTaxPercent: sub.terms?.product?.goodsTaxPercent || 0 })

/** Prepaid amount to cover the plan's prepay window from a given date (top-ups and renewals). */
export async function prepayQuote(sub, fromDate) {
  const settings = await Setting.get()
  const days = sub.terms?.product?.prepayDays || 30
  const each = perDeliveryMinor(sub)
  const dates = deliveryDates({ frequency: sub.frequency, days: sub.days }, sub.items, fromDate, days, settings.billing?.holidays || [])
  const amount = each * Math.max(1, dates.length)
  return {
    currency: sub.terms?.currency || 'INR',
    lines: [{ description: `${Math.max(1, dates.length)} deliveries (${days} days) at ${(each / 100).toFixed(2)} each`, qty: Math.max(1, dates.length), unitMinor: each, amountMinor: amount }],
    subtotalMinor: amount,
    discountMinor: 0,
    taxPercent: 0,
    taxMinor: 0,
    totalMinor: amount,
    balanceCreditMinor: amount,
    deliveries: dates.length,
    perDeliveryMinor: each,
  }
}

/** Create the subscription (pending payment) and its first payment. */
export async function startProductCheckout({ user, plan, version, quote, address, slot, startDate, paymentMethod, idempotencyKey, autoRenew }) {
  const prior = await PaymentTransaction.findOne({ user: user._id, idempotencyKey })
  if (prior) return { tx: prior, subscription: await Subscription.findById(prior.subscription), payment: prior.status === 'created' ? await collect(prior, user) : {} }

  const terms = termsOf(version)
  terms.product.goodsTaxPercent = quote.goodsTaxPercent
  const amount = quote.totalMinor
  const sub = await Subscription.create({
    user: user._id,
    plan: plan._id,
    planVersion: version._id,
    terms,
    billingMode: version.product.billingMode,
    items: quote.items.map((i) => pick(i, ['product', 'variantId', 'productName', 'variantLabel', 'price', 'qty'])),
    frequency: quote.schedule.frequency,
    days: quote.schedule.days,
    startDate,
    slot,
    address: pick(address, ADDRESS_FIELDS),
    status: amount > 0 ? 'pending_payment' : 'active',
    autoRenew: !!autoRenew && version.policies?.renewal?.autoRenewAllowed !== false,
    termsAcceptedAt: new Date(),
  })
  await recordEvent({ entityType: 'subscription', entity: sub._id, user: user._id, type: 'checkout_started', to: sub.status, actorName: user.name, data: { totalMinor: amount } })
  const { tx } = await createTransaction({
    user,
    idempotencyKey,
    purpose: 'subscription_prepay',
    subscription: sub._id,
    planVersion: version._id,
    provider: amount === 0 ? 'free' : paymentMethod,
    currency: quote.currency,
    amountMinor: amount,
    breakdown: { ...quote, items: undefined, schedule: undefined },
  })
  const payment = await collect(tx, user)
  return { tx: await PaymentTransaction.findById(tx._id), subscription: await Subscription.findById(sub._id), payment }
}

/** Add money to a prepaid subscription (manual top-up, renewal, or automatic from the wallet). */
export async function startTopup({ sub, user, paymentMethod, idempotencyKey, auto = false }) {
  if (sub.billingMode !== 'prepaid') throw httpError(400, 'This subscription is paid per delivery, so it has no balance to top up')
  if (!['active', 'paused', 'past_due'].includes(sub.status)) throw httpError(400, 'Only live subscriptions can be topped up')
  const settings = await Setting.get()
  const quote = await prepayQuote(sub, firstEditableDate(settings.billing))
  const { tx } = await createTransaction({
    user,
    idempotencyKey,
    purpose: 'subscription_topup',
    subscription: sub._id,
    planVersion: sub.planVersion,
    provider: paymentMethod,
    currency: quote.currency,
    amountMinor: quote.totalMinor,
    breakdown: { ...quote, auto },
  })
  const payment = tx.status === 'created' ? await collect(tx, user) : {}
  return { tx: await PaymentTransaction.findById(tx._id), payment }
}

/** Fulfilment for verified subscription payments: credit the prepaid balance and activate. */
async function onSubscriptionPaid(tx) {
  const credit = tx.breakdown?.balanceCreditMinor ?? 0
  let sub = credit > 0 ? await Subscription.findByIdAndUpdate(tx.subscription, { $inc: { prepaidBalanceMinor: credit } }, { returnDocument: 'after' }) : await Subscription.findById(tx.subscription)
  if (!sub) throw new Error('Subscription not found')
  await recordEvent({ entityType: 'subscription', entity: sub._id, user: sub.user, type: tx.purpose === 'subscription_prepay' ? 'paid' : 'topped_up', note: `${formatMinor(tx.amountMinor)} (${tx.provider})`, data: { transaction: tx._id, creditMinor: credit } })
  if (['pending_payment', 'failed'].includes(sub.status)) {
    sub = await setSubscriptionStatus(sub, 'active', { type: 'activated' })
    await notify(sub.user, 'subscription_activated', { plan: sub.terms?.name || 'subscription', start: sub.startDate }, { key: `sub-activated:${sub._id}`, link: `/subscriptions/${sub._id}` })
  } else if (sub.status === 'past_due' && sub.prepaidBalanceMinor >= perDeliveryMinor(sub)) {
    await setSubscriptionStatus(sub, 'active', { type: 'resumed', note: 'Balance topped up' })
  }
}
onPaid(['subscription_prepay', 'subscription_topup'], onSubscriptionPaid)

/** Atomically draw one delivery from the prepaid balance; null when the balance is too low. */
export const debitBalance = (subId, amountMinor) =>
  Subscription.findOneAndUpdate({ _id: subId, prepaidBalanceMinor: { $gte: amountMinor } }, { $inc: { prepaidBalanceMinor: -amountMinor } }, { returnDocument: 'after' })

export const creditBalance = (subId, amountMinor) => Subscription.updateOne({ _id: subId }, { $inc: { prepaidBalanceMinor: amountMinor } })

/** Pause (or un-pause) a date range, enforcing the cut-off and the plan's pause policy. */
export async function pauseRange(sub, { from, to, resume = false, req }) {
  if (to < from) throw httpError(400, 'End date must be after start date')
  const settings = await Setting.get()
  const policy = pausePolicy(sub)
  if (!resume && !policy.allowed) throw httpError(400, 'This plan does not allow pausing deliveries')
  const earliest = firstEditableDate(settings.billing, resume ? 0 : policy.noticeDays)
  if (from < earliest) throw httpError(400, `The earliest date you can change is ${earliest}`)
  const range = dateRange(from, to, 400)
  if (!resume && range.length < policy.minDays) throw httpError(400, `A pause must be at least ${policy.minDays} day(s)`)
  if (!resume && range.length > policy.maxDays) throw httpError(400, `A pause can be at most ${policy.maxDays} days`)
  const set = new Set(sub.pausedDates)
  range.forEach((d) => (resume ? set.delete(d) : set.add(d)))
  sub.pausedDates = [...set].filter((d) => d >= todayKey()).sort()
  await sub.save()
  await recordEvent({ entityType: 'subscription', entity: sub._id, user: sub.user, type: resume ? 'pause_removed' : 'pause', req, data: { from, to, days: range.length } })
  await notify(sub.user, resume ? 'subscription_resumed' : 'subscription_paused', { range: from === to ? `on ${from}` : `from ${from} to ${to}` })
  return sub
}

/** Pause indefinitely (status paused) or resume. */
export async function setPaused(sub, paused, { req, reason } = {}) {
  if (paused) {
    if (!pausePolicy(sub).allowed) throw httpError(400, 'This plan does not allow pausing deliveries')
    await setSubscriptionStatus(sub, 'paused', { req, type: 'paused', note: reason })
    await notify(sub.user, 'subscription_paused', { range: 'until you resume' })
  } else {
    const to = sub.billingMode === 'prepaid' && sub.prepaidBalanceMinor < perDeliveryMinor(sub) ? 'past_due' : 'active'
    if (sub.status !== to) await setSubscriptionStatus(sub, to, { req, type: 'resumed', note: reason })
    await notify(sub.user, 'subscription_resumed', {})
  }
  return sub
}

/**
 * Change basket items, quantities, schedule, slot or address. Changes apply from the first editable date (orders
 * for earlier dates are already generated). Returns the price difference per delivery.
 */
export async function changeSubscription(sub, body, { user, req, dryRun = false }) {
  const settings = await Setting.get()
  const effective = firstEditableDate(settings.billing)
  const before = perDeliveryMinor(sub)
  const changes = {}
  if (body.items) {
    if (sub.terms && sub.planVersion) {
      const version = await versionById(sub.planVersion)
      // Items already on the subscription keep their locked price; new ones get today's plan price.
      const resolved = await resolveItems(version, body.items)
      changes.items = resolved.map((r) => {
        const kept = sub.items.find((i) => String(i.variantId) === String(r.variantId))
        return { ...pick(r, ['product', 'variantId', 'productName', 'variantLabel', 'qty']), price: kept ? kept.price : r.price }
      })
    } else {
      // Older subscriptions: only quantities of the existing items can change.
      changes.items = sub.items.map((i) => {
        const r = body.items.find((x) => String(x.variantId) === String(i.variantId))
        return { ...(i.toObject ? i.toObject() : i), qty: r ? r.qty : i.qty }
      })
      if (changes.items.some((i) => i.qty < 1 || i.qty > 20)) throw httpError(400, 'Quantity must be between 1 and 20')
    }
  }
  const allowedFrequencies = sub.terms?.product?.frequencies || ['daily', 'alternate', 'weekly', 'custom']
  if (body.frequency) {
    if (!allowedFrequencies.includes(body.frequency)) throw httpError(400, 'This delivery frequency is not offered on your plan')
    changes.frequency = body.frequency
    changes.days = body.frequency === 'custom' ? body.days || sub.days : []
  } else if (body.days) changes.days = body.days
  if ((changes.frequency || sub.frequency) === 'custom' && !(changes.days || sub.days)?.length) throw httpError(400, 'Pick at least one delivery day')
  if (body.slot) {
    if (!settings.slots.includes(body.slot)) throw httpError(400, 'Choose one of the available delivery slots')
    changes.slot = body.slot
  }
  if (body.addressId) {
    const addr = user.addresses.id(body.addressId)
    if (!addr) throw httpError(400, 'Address not found')
    changes.address = pick(addr.toObject(), ADDRESS_FIELDS)
  }
  const after = perDeliveryMinor(sub, changes.items || sub.items)
  const summary = { effectiveFrom: effective, perDeliveryBeforeMinor: before, perDeliveryAfterMinor: after, differenceMinor: after - before }
  if (dryRun) return { summary }
  sub.set(changes)
  if (changes.items) sub.dayOverrides = sub.dayOverrides.filter((o) => o.date < effective)
  await sub.save()
  await recordEvent({ entityType: 'subscription', entity: sub._id, user: sub.user, type: 'changed', req, data: { ...summary, fields: Object.keys(changes) } })
  await notify(sub.user, 'subscription_changed', { from: effective })
  return { subscription: sub, summary }
}

/** One-day quantity change or skip, per item. */
export async function overrideDay(sub, { date, items }) {
  const settings = await Setting.get()
  const earliest = firstEditableDate(settings.billing)
  if (date < earliest) throw httpError(400, `The earliest date you can change is ${earliest}`)
  if (!sub.scheduledOn(date)) throw httpError(400, 'There is no delivery on that date')
  const clean = items
    .filter((it) => sub.items.some((i) => String(i.variantId) === String(it.variantId)))
    .filter((it) => {
      const base = sub.items.find((i) => String(i.variantId) === String(it.variantId))
      return base.qty !== it.qty
    })
  sub.dayOverrides = sub.dayOverrides.filter((o) => o.date !== date)
  if (clean.length) sub.dayOverrides.push({ date, items: clean })
  await sub.save()
  return sub
}

/** Cancel: no more deliveries; unused prepaid balance goes back to the wallet when the plan says so. */
export async function cancelSubscription(sub, { reason, req }) {
  if (sub.status === 'cancelled') throw httpError(400, 'This subscription is already cancelled')
  const balance = sub.prepaidBalanceMinor
  let refund = null
  const refundUnused = sub.terms?.policies?.cancellation?.refundUnusedBalance !== false
  if (balance > 0 && refundUnused) {
    const claimed = await Subscription.findOneAndUpdate({ _id: sub._id, prepaidBalanceMinor: balance }, { $set: { prepaidBalanceMinor: 0 } }, { returnDocument: 'after' })
    if (claimed) {
      refund = await recordBalanceRefund({ user: sub.user, subscription: sub._id, amountMinor: balance, reason: `Unused balance of subscription ${sub.code}`, req })
      sub.prepaidBalanceMinor = 0
    }
  }
  sub.cancelReason = reason
  sub.cancelledAt = new Date()
  sub.endDate = todayKey()
  sub.autoRenew = false
  // Unpaid first payments are closed so they can't be paid later.
  await PaymentTransaction.updateMany({ subscription: sub._id, status: 'created' }, { $set: { status: 'expired' }, $push: { history: { status: 'expired', note: 'Subscription cancelled' } } })
  await setSubscriptionStatus(sub, 'cancelled', { req, type: 'cancelled', note: reason, data: refund ? { refundMinor: refund.amountMinor } : undefined })
  await notify(sub.user, 'subscription_cancelled', { refund: refund ? ` ${formatMinor(refund.amountMinor)} was refunded to your wallet.` : '' }, { key: `sub-cancelled:${sub._id}` })
  return { subscription: sub, refund }
}

/** Upcoming deliveries for display (respects holidays, pauses and day overrides). */
export function upcoming(sub, days = 14, holidays = []) {
  const out = []
  for (let i = 1; i <= days; i++) {
    const d = addDaysKey(todayKey(), i)
    const items = sub.itemsFor(d, { holidays })
    out.push({ date: d, qty: items.reduce((s, it) => s + it.qty, 0), items: items.map((it) => ({ variantId: it.variantId, qty: it.qty })), paused: sub.pausedDates.includes(d), holiday: holidays.includes(d) })
  }
  return out
}
