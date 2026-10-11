import Coupon from '../models/Coupon.js'
import { Setting, Zone } from '../models/misc.js'
import Order from '../models/Order.js'
import Product from '../models/Product.js'
import User from '../models/User.js'
import { addDays, dateKey, httpError } from './http.js'
import { memberPricing } from '../services/memberships.js'
import { notify } from '../services/notify.js'
import { creditBalance, debitBalance } from '../services/productSubscriptions.js'
import { walletChange } from './services.js'

/** Store orders can be booked for tomorrow up to a week ahead, in one of the configured slots. */
function checkSlot(slot, settings) {
  const earliest = dateKey(addDays(new Date(), 1))
  const latest = dateKey(addDays(new Date(), 7))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slot?.date || '') || slot.date < earliest || slot.date > latest) {
    throw httpError(400, 'Please choose a delivery date between tomorrow and the next 7 days')
  }
  if (!settings.slots.includes(slot.label)) throw httpError(400, 'Please choose one of the available delivery slots')
}

/**
 * Price a cart from the database (never trust client prices).
 * items: [{ product, variantId, qty }]
 * user: applies member benefits. locked: subscription deliveries priced at the subscription's locked plan prices
 * ({ prices: { [variantId]: rupees }, deliveryFee, taxPercent }) instead of today's catalogue and fees.
 */
export async function quote({ items, couponCode, pincode, user, locked }) {
  if (!items?.length) throw httpError(400, 'Your cart is empty')
  const settings = await Setting.get()
  const products = await Product.find({ _id: { $in: items.map((i) => i.product) } }).populate('category', 'name')
  const lines = []
  const problems = []
  for (const item of items) {
    const p = products.find((x) => String(x._id) === String(item.product))
    const v = p?.variants.id(item.variantId)
    if (!p || !p.isActive || !v) {
      problems.push({ ...item, reason: 'No longer available' })
      continue
    }
    if (v.stock < item.qty) problems.push({ ...item, reason: v.stock ? `Only ${v.stock} left` : 'Out of stock' })
    lines.push({
      product: p._id,
      name: p.name,
      image: p.images?.[0],
      category: p.category?.name,
      variantId: v._id,
      variantLabel: v.label,
      price: locked ? (locked.prices[String(v._id)] ?? v.price) : v.price,
      mrp: v.mrp,
      qty: item.qty,
    })
  }
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0)
  const mrpTotal = lines.reduce((s, l) => s + l.mrp * l.qty, 0)

  let discount = 0
  let coupon = null
  let couponError = null
  if (couponCode) {
    coupon = await Coupon.findOne({ code: couponCode.toUpperCase().trim() })
    try {
      if (!coupon) throw httpError(400, 'Invalid coupon code')
      discount = coupon.discountFor(subtotal)
    } catch (e) {
      couponError = e.message
      coupon = null
    }
  }

  let zone = null
  let serviceable = true
  if (pincode) {
    const anyZones = await Zone.exists({ isActive: true })
    zone = await Zone.findOne({ isActive: true, pincodes: pincode })
    serviceable = !anyZones || !!zone
  }

  if (locked) {
    // Subscription delivery: the fee and tax were agreed when the customer subscribed.
    const deliveryFee = locked.deliveryFee || 0
    const tax = Math.round(subtotal * (locked.taxPercent || 0)) / 100
    const total = Math.round((subtotal + deliveryFee + tax) * 100) / 100
    return { lines, problems, subtotal, mrpTotal, savings: mrpTotal - subtotal, discount: 0, deliveryFee, tax, total, serviceable, minOrderValue: 0, freeDeliveryAbove: 0, settings, memberDiscount: 0 }
  }

  const member = await memberPricing(user?._id, { afterCoupon: subtotal - discount })
  const afterDiscount = subtotal - discount - member.discount
  let deliveryFee = afterDiscount >= settings.freeDeliveryAbove || member.freeDelivery ? 0 : settings.deliveryFee
  if (zone?.extraFee && !member.freeDelivery) deliveryFee += zone.extraFee
  const tax = Math.round((afterDiscount * settings.taxPercent) / 100)
  const total = afterDiscount + deliveryFee + tax

  return {
    lines,
    problems,
    subtotal,
    mrpTotal,
    savings: mrpTotal - subtotal + discount + member.discount,
    discount,
    memberDiscount: member.discount,
    memberFreeDelivery: member.freeDelivery && (settings.deliveryFee > 0 || !!zone?.extraFee) && afterDiscount < settings.freeDeliveryAbove,
    membership: member.membership ? { _id: member.membership._id, plan: member.planName, limitReached: !!member.limitReached } : null,
    couponCode: coupon?.code,
    couponError,
    deliveryFee,
    tax,
    total,
    serviceable,
    minOrderValue: settings.minOrderValue,
    freeDeliveryAbove: settings.freeDeliveryAbove,
    settings,
  }
}

/** Atomically reserve stock for each line; rolls back on failure. */
async function reserveStock(lines) {
  const done = []
  for (const l of lines) {
    const ok = await Product.updateOne(
      { _id: l.product, variants: { $elemMatch: { _id: l.variantId, stock: { $gte: l.qty } } } },
      { $inc: { 'variants.$.stock': -l.qty, sold: l.qty } },
    )
    if (!ok.modifiedCount) {
      await restoreStock(done)
      throw httpError(409, `${l.name} (${l.variantLabel}) just went out of stock`)
    }
    done.push(l)
  }
}

export async function restoreStock(lines) {
  for (const l of lines) {
    await Product.updateOne(
      { _id: l.product, 'variants._id': l.variantId },
      { $inc: { 'variants.$.stock': l.qty, sold: -l.qty } },
    )
  }
}

export async function placeOrder({ user, items, address, slot, paymentMethod, couponCode, source = 'store', subscription, locked }) {
  const q = await quote({ items, couponCode, pincode: address.pincode, user, locked })
  if (q.problems.length) throw httpError(409, `${q.problems[0].reason}: please update your cart`)
  if (!q.serviceable) throw httpError(400, `Sorry, we don't deliver to ${address.pincode} yet`)
  if (source === 'store') {
    checkSlot(slot, q.settings)
    if (q.subtotal < q.minOrderValue) throw httpError(400, `Minimum order value is ₹${q.minOrderValue}`)
  }
  if (couponCode && q.couponError) throw httpError(400, q.couponError)
  if (paymentMethod === 'cod' && !q.settings.codEnabled) throw httpError(400, 'Cash on delivery is unavailable')

  await reserveStock(q.lines)
  const order = new Order({
    user: user._id,
    items: q.lines,
    address,
    slot,
    subtotal: q.subtotal,
    discount: q.discount,
    deliveryFee: q.deliveryFee,
    tax: q.tax,
    total: q.total,
    couponCode: q.couponCode,
    memberDiscount: q.memberDiscount || 0,
    memberFreeDelivery: !!q.memberFreeDelivery,
    membership: q.membership?._id,
    payment: { method: paymentMethod, status: 'pending' },
    source,
    subscription,
    timeline: [{ status: 'placed', note: source === 'subscription' ? 'Subscription delivery' : 'Order placed', by: 'system' }],
  })
  let debitedMinor = 0
  try {
    await order.validate() // assigns orderNo + delivery OTP
    if (paymentMethod === 'wallet') {
      await walletChange(user._id, -q.total, `Payment for order ${order.orderNo}`, order._id)
      order.payment.status = 'paid'
    } else if (paymentMethod === 'prepaid') {
      const amount = Math.round(q.total * 100)
      if (!(await debitBalance(subscription, amount))) throw httpError(402, 'Prepaid balance is too low for this delivery')
      debitedMinor = amount
      order.payment.status = 'paid'
    }
    await order.save()
  } catch (e) {
    if (debitedMinor) await creditBalance(subscription, debitedMinor)
    else if (order.payment.status === 'paid') {
      await walletChange(user._id, q.total, `Reversal for failed order ${order.orderNo}`)
    }
    await restoreStock(q.lines)
    throw e
  }
  if (q.couponCode) await Coupon.updateOne({ code: q.couponCode }, { $inc: { usedCount: 1 } })
  return order
}

/**
 * Assign an order to an approved, unblocked delivery partner whose zone covers the delivery pincode (the one with the
 * fewest open orders). Leaves the order unassigned when no partner fits; admins then assign it by hand as before.
 */
export async function autoAssign(order, { by = 'system' } = {}) {
  if (order.deliveryPartner || !order.address?.pincode) return null
  const zone = await Zone.findOne({ isActive: true, pincodes: order.address.pincode }).select('_id')
  if (!zone) return null
  const partners = await User.find({ role: 'delivery', isBlocked: false, 'delivery.kycStatus': 'approved', 'delivery.zone': zone._id }).select('name')
  if (!partners.length) return null
  const load = await Order.aggregate([
    { $match: { deliveryPartner: { $in: partners.map((p) => p._id) }, status: { $in: ['placed', 'confirmed', 'packed', 'out_for_delivery'] } } },
    { $group: { _id: '$deliveryPartner', n: { $sum: 1 } } },
  ])
  const count = Object.fromEntries(load.map((l) => [String(l._id), l.n]))
  const partner = partners.sort((a, b) => (count[a.id] || 0) - (count[b.id] || 0))[0]
  const r = await Order.updateOne(
    { _id: order._id, deliveryPartner: null },
    { $set: { deliveryPartner: partner._id }, $push: { timeline: { status: order.status, note: `Assigned to ${partner.name} (zone)`, by } } },
  )
  return r.modifiedCount ? partner : null
}

const TRANSITIONS = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled', 'undelivered'],
  delivered: ['returned'],
  // A missed delivery is resolved by redelivering (back to confirmed, new date) or cancelling with a refund.
  undelivered: ['confirmed', 'cancelled'],
  cancelled: [],
  returned: [],
}

export function canTransition(from, to) {
  return TRANSITIONS[from]?.includes(to)
}

/** Move an order to a new status and apply the side effects (refunds, stock, payouts, points). */
export async function changeStatus(order, status, { by = 'system', note, force = false } = {}) {
  if (!force && !canTransition(order.status, status)) {
    throw httpError(400, `Cannot change order from ${order.status.replaceAll('_', ' ')} to ${status.replaceAll('_', ' ')}`)
  }
  const previous = order.status
  order.status = status
  order.timeline.push({ status, note, by })

  if (status === 'cancelled' || status === 'returned') {
    // Goods that went out and came back undelivered are perishable, so they are not put back in stock.
    if (status === 'cancelled' && previous !== 'undelivered') await restoreStock(order.items)
    const paid = order.payment.status === 'paid'
    if (paid && order.payment.method === 'prepaid' && order.subscription) {
      await creditBalance(order.subscription, Math.round(order.total * 100))
      order.payment.status = 'refunded'
      order.timeline.push({ status, note: `₹${order.total} returned to the subscription balance`, by: 'system' })
    } else if (paid) {
      await walletChange(order.user, order.total, `Refund for order ${order.orderNo}`, order._id)
      order.payment.status = 'refunded'
      order.timeline.push({ status, note: `₹${order.total} refunded to wallet`, by: 'system' })
    }
  }

  if (status === 'undelivered') {
    order.failureReason = note
    await notify(order.user, 'delivery_missed', { orderNo: order.orderNo, reason: note || 'not specified' }, { key: `missed:${order._id}:${order.timeline.length}`, link: `/account/orders/${order._id}` })
  }

  if (status === 'delivered') {
    order.deliveredAt = new Date()
    if (order.payment.method === 'cod') {
      order.payment.status = 'paid'
      order.codCollected = true
    }
    const settings = await Setting.get()
    if (order.deliveryPartner) {
      await User.updateOne({ _id: order.deliveryPartner }, { $inc: { 'delivery.earnings': settings.deliveryPayoutPerOrder } })
    }
    // Loyalty: 1 point per ₹100 spent.
    await User.updateOne({ _id: order.user }, { $inc: { loyaltyPoints: Math.floor(order.total / 100) } })
    await notify(order.user, 'delivery_completed', { orderNo: order.orderNo }, { key: `delivered:${order._id}`, link: `/account/orders/${order._id}` })
  }
  await order.save()
  return order
}

const UNPAID = ['pending', 'failed']

/**
 * Record a verified online payment for a store order (browser signature check or signed webhook). Safe to call more
 * than once. If the order was cancelled first (e.g. it expired unpaid), the money goes straight back to the wallet.
 */
export async function recordOnlinePayment(order, paymentId, note) {
  if (order.status === 'cancelled') {
    const claimed = await Order.findOneAndUpdate(
      { _id: order._id, 'payment.status': { $in: UNPAID } },
      {
        $set: { 'payment.status': 'refunded', 'payment.razorpayPaymentId': paymentId },
        $push: { timeline: { status: 'cancelled', note: `Payment received after the order was cancelled; ₹${order.total} refunded to wallet`, by: 'system' } },
      },
      { returnDocument: 'after' },
    )
    if (claimed) await walletChange(order.user, order.total, `Refund for order ${order.orderNo} (paid after it was cancelled)`, order._id)
    return claimed || Order.findById(order._id)
  }
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, 'payment.status': { $in: UNPAID } },
    { $set: { 'payment.status': 'paid', 'payment.razorpayPaymentId': paymentId }, $push: { timeline: { status: order.status, note, by: 'system' } } },
    { returnDocument: 'after' },
  )
  return updated || Order.findById(order._id)
}

/**
 * Online orders reserve stock when they are placed. If the customer never pays, cancel the order after the checkout
 * window (billing setting, default 60 minutes) and put the stock back. A payment that still arrives later is refunded
 * to the wallet by recordOnlinePayment.
 */
export async function expireUnpaidOnlineOrders(now = new Date()) {
  const { billing } = await Setting.get()
  const cutoff = new Date(now.getTime() - (billing?.checkoutExpiryMinutes || 60) * 60000)
  const stale = await Order.find({ 'payment.method': 'online', 'payment.status': { $in: UNPAID }, status: 'placed', createdAt: { $lt: cutoff } }).select('_id items')
  let cancelled = 0
  for (const o of stale) {
    // Claim first: only the run that flips the status puts the stock back, and a payment recorded meanwhile wins.
    const r = await Order.updateOne(
      { _id: o._id, status: 'placed', 'payment.status': { $in: UNPAID } },
      {
        $set: { status: 'cancelled', cancelReason: 'Payment not completed' },
        $push: { timeline: { status: 'cancelled', note: 'Cancelled automatically: payment was not completed in time', by: 'system' } },
      },
    )
    if (!r.modifiedCount) continue
    await restoreStock(o.items)
    cancelled++
  }
  return { cancelled }
}
