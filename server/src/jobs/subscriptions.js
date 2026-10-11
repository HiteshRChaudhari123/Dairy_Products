import { Setting } from '../models/misc.js'
import Subscription from '../models/Subscription.js'
import User from '../models/User.js'
import { firstEditableDate, pastCutoff, recordEvent, todayKey, addDaysKey } from '../services/common.js'
import { notify } from '../services/notify.js'
import { perDeliveryMinor, setSubscriptionStatus, startTopup } from '../services/productSubscriptions.js'
import { autoAssign, placeOrder } from '../utils/orders.js'

const itemsText = (items) => items.map((i) => `${i.qty} × ${i.productName} ${i.variantLabel || ''}`.trim()).join(', ')

/**
 * Create the orders for every subscription due on `date` (YYYY-MM-DD).
 * - Plan subscriptions are priced at their locked plan prices. Prepaid ones draw from their balance (topping up from
 *   the wallet first when auto-renew is on); if it is too low the delivery is skipped and the subscription is past due.
 * - Pay-per-delivery subscriptions pay from the wallet, else cash on delivery.
 * Safe to run more than once for the same date: `lastGeneratedFor` skips done work, and a unique index on
 * (subscription, slot.date) stops a second order even when two runs overlap.
 */
export async function generateSubscriptionOrders(date) {
  const settings = await Setting.get()
  const holidays = settings.billing?.holidays || []
  const result = { date, created: 0, skipped: 0, failed: [], holiday: holidays.includes(date) }
  if (result.holiday) return result
  const subs = await Subscription.find({ status: 'active', lastGeneratedFor: { $ne: date } })
  for (const sub of subs) {
    const due = sub.itemsFor(date, { holidays })
    if (!due.length) {
      result.skipped++
      continue
    }
    try {
      const user = await User.findById(sub.user)
      if (!user || user.isBlocked) throw new Error('Customer unavailable')
      const items = due.map((i) => ({ product: i.product, variantId: i.variantId, qty: i.qty }))
      const locked = sub.terms
        ? {
            prices: Object.fromEntries(due.map((i) => [String(i.variantId), i.price])),
            deliveryFee: (sub.terms.product?.deliveryFeeMinor || 0) / 100,
            taxPercent: sub.terms.product?.goodsTaxPercent || 0,
          }
        : undefined
      let order
      const args = { user, items, address: sub.address, slot: { date, label: sub.slot || settings.slots[0] }, source: 'subscription', subscription: sub._id, locked }
      if (sub.billingMode === 'prepaid') {
        const cost = perDeliveryMinor(sub, due)
        if (sub.prepaidBalanceMinor < cost && sub.autoRenew) {
          await startTopup({ sub, user, paymentMethod: 'wallet', idempotencyKey: `auto-topup:${sub._id}:${date}`, auto: true }).catch(() => null)
        }
        try {
          order = await placeOrder({ ...args, paymentMethod: 'prepaid' })
        } catch (e) {
          if (e.status !== 402) throw e
          const fresh = await Subscription.findById(sub._id)
          if (fresh.status === 'active') await setSubscriptionStatus(fresh, 'past_due', { type: 'balance_exhausted', note: `Not enough balance for ${date}` })
          await notify(sub.user, 'delivery_skipped', { date, reason: 'Your prepaid balance ran out. Top up to restart deliveries.' }, { key: `skipped:${sub._id}:${date}`, link: `/subscriptions/${sub._id}` })
          throw e
        }
      } else {
        try {
          order = await placeOrder({ ...args, paymentMethod: 'wallet' })
        } catch (e) {
          if (!/wallet/i.test(e.message)) throw e
          order = await placeOrder({ ...args, paymentMethod: 'cod' })
        }
      }
      await Subscription.updateOne({ _id: sub._id }, { lastGeneratedFor: date })
      result.created++
      if (await autoAssign(order).catch(() => null)) result.assigned = (result.assigned || 0) + 1
      await notify(sub.user, 'delivery_upcoming', { items: itemsText(due), slot: sub.slot, date }, { key: `upcoming:${sub._id}:${date}`, link: `/subscriptions/${sub._id}` })
    } catch (e) {
      if (e.code === 11000) {
        // Another run already created this delivery.
        await Subscription.updateOne({ _id: sub._id }, { lastGeneratedFor: date })
        result.skipped++
        continue
      }
      result.failed.push({ subscription: sub._id, reason: e.message })
      // The job retries every run until midnight; tell the customer (and log the event) only on the first failure.
      // Prepaid balance-outs (402) already sent their own "skipped" notice above.
      if (e.status === 402) continue
      const reason =
        e.status === 409 ? 'A product in your subscription is out of stock right now.' : e.status === 400 ? e.message : 'We could not create this delivery.'
      const first = await notify(sub.user, 'delivery_at_risk', { date, reason }, { key: `at-risk:${sub._id}:${date}`, link: `/subscriptions/${sub._id}` })
      if (first) await recordEvent({ entityType: 'subscription', entity: sub._id, user: sub.user, type: 'delivery_failed', note: e.message, data: { date } })
    }
  }
  return result
}

/** Once the daily cut-off has passed, tomorrow's deliveries are locked and can be generated. */
export async function generateDueDeliveries(now = new Date()) {
  const settings = await Setting.get()
  if (!pastCutoff(settings.billing?.deliveryCutoff, now)) return { waiting: `until ${settings.billing?.deliveryCutoff || '21:00'}` }
  const date = addDaysKey(todayKey(now), 1)
  // Sanity check: the first editable date must now be the day after tomorrow.
  if (firstEditableDate(settings.billing, 0, now) <= date) return { waiting: 'cut-off not reached' }
  return generateSubscriptionOrders(date)
}
