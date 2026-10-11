import { Router } from 'express'
import { z } from 'zod'
import { env } from '../config/env.js'
import { allow, can, protect } from '../middleware/auth.js'
import { limits } from '../middleware/rateLimit.js'
import { noStore } from '../middleware/security.js'
import { WebhookEvent } from '../models/billing.js'
import Coupon from '../models/Coupon.js'
import Order, { ORDER_STATUSES } from '../models/Order.js'
import User from '../models/User.js'
import { escapeRegex, httpError, pick } from '../utils/http.js'
import { changeStatus, placeOrder, quote, recordOnlinePayment } from '../utils/orders.js'
import {
  createRazorpayOrder,
  razorpayEnabled,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from '../utils/razorpay.js'
import { audit } from '../utils/services.js'
import { handleGatewayEvent } from '../services/payments.js'
import { sendProof } from '../services/proofs.js'

const router = Router()

const itemsSchema = z
  .array(z.object({ product: z.string(), variantId: z.string(), qty: z.number().int().min(1).max(50) }))
  .min(1, 'Your cart is empty')

// Razorpay webhook (raw body is attached in app.js). Configure in Razorpay dashboard → Webhooks.
router.post('/payments/webhook', async (req, res) => {
  if (!verifyWebhookSignature(req.rawBody || '', req.headers['x-razorpay-signature'])) {
    return res.status(400).json({ message: 'Bad signature' })
  }
  const event = req.body
  // Razorpay retries deliveries; an event we already processed is acknowledged and ignored.
  const eventId = req.headers['x-razorpay-event-id']
  if (eventId && (await WebhookEvent.exists({ _id: String(eventId) }))) return res.json({ ok: true, duplicate: true })
  // Membership and subscription payments/refunds have their own transactions.
  const handled = await handleGatewayEvent(event)
  if (!handled && (event.event === 'payment.captured' || event.event === 'order.paid')) {
    const payment = event.payload?.payment?.entity
    const order = await Order.findOne({ 'payment.razorpayOrderId': payment?.order_id })
    // Only accept the exact amount and currency we asked Razorpay to collect.
    const amountOk = order && payment.amount === Math.round(order.total * 100) && payment.currency === 'INR'
    if (order && amountOk) await recordOnlinePayment(order, payment.id, 'Payment confirmed by Razorpay')
  }
  if (eventId) await WebhookEvent.create({ _id: String(eventId), event: event.event }).catch(() => {})
  res.json({ ok: true })
})

// Coupons available to customers
router.get('/coupons/available', async (_req, res) => {
  const now = new Date()
  const coupons = await Coupon.find({
    isActive: true,
    $and: [
      { $or: [{ validFrom: null }, { validFrom: { $lte: now } }] },
      { $or: [{ validTo: null }, { validTo: { $gte: now } }] },
    ],
  }).select('code description type value maxDiscount minOrder')
  res.json(coupons)
})

router.use(['/orders', '/coupons'], protect, noStore)

// ───────────── Customer ─────────────

router.post('/orders/quote', async (req, res) => {
  const body = z
    .object({ items: itemsSchema, couponCode: z.string().max(30).optional(), pincode: z.string().regex(/^\d{6}$/).optional() })
    .parse(req.body)
  const q = await quote({ ...body, user: req.user })
  delete q.settings
  res.json(q)
})

router.post('/orders', limits.sensitive, async (req, res) => {
  const body = z
    .object({
      items: itemsSchema,
      addressId: z.string(),
      slot: z.object({ date: z.string().max(10), label: z.string().max(40) }),
      paymentMethod: z.enum(['cod', 'wallet', 'online']),
      couponCode: z.string().max(30).optional(),
    })
    .parse(req.body)
  const addr = req.user.addresses.id(body.addressId)
  if (!addr) throw httpError(400, 'Please choose a delivery address')
  // Without Razorpay keys online payments are simulated, which must never happen on a live store.
  if (body.paymentMethod === 'online' && !razorpayEnabled() && env.isProd) {
    throw httpError(400, 'Online payment is unavailable right now. Please choose another method.')
  }
  const order = await placeOrder({
    user: req.user,
    items: body.items,
    address: pick(addr.toObject(), ['name', 'phone', 'line1', 'line2', 'landmark', 'city', 'state', 'pincode', 'location']),
    slot: body.slot,
    paymentMethod: body.paymentMethod,
    couponCode: body.couponCode,
  })

  let razorpay = null
  if (body.paymentMethod === 'online') {
    if (razorpayEnabled()) {
      const rp = await createRazorpayOrder(order.total, order.orderNo)
      order.payment.razorpayOrderId = rp.id
      await order.save()
      razorpay = { keyId: env.razorpayKeyId, orderId: rp.id, amount: rp.amount, currency: rp.currency }
    } else {
      // No Razorpay keys configured: simulate a successful payment so the flow can be tested.
      order.payment.status = 'paid'
      order.timeline.push({ status: 'placed', note: 'Online payment simulated (add Razorpay keys for real payments)', by: 'system' })
      await order.save()
    }
  }
  res.status(201).json({ order, razorpay })
})

router.post('/orders/:id/verify-payment', limits.sensitive, async (req, res) => {
  const body = z
    .object({ razorpay_order_id: z.string().max(64), razorpay_payment_id: z.string().max(64), razorpay_signature: z.string().max(256) })
    .parse(req.body)
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id })
  if (!order || order.payment.razorpayOrderId !== body.razorpay_order_id) throw httpError(404, 'Order not found')
  if (['paid', 'refunded'].includes(order.payment.status)) return res.json({ order })
  if (!verifyPaymentSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) {
    await Order.updateOne({ _id: order._id, 'payment.status': 'pending' }, { 'payment.status': 'failed' })
    throw httpError(400, 'Payment verification failed')
  }
  res.json({ order: await recordOnlinePayment(order, body.razorpay_payment_id, 'Payment verified') })
})

router.get('/orders/mine', async (req, res) => {
  const filter = { user: req.user._id }
  if (ORDER_STATUSES.includes(req.query.status)) filter.status = req.query.status
  res.json(await Order.find(filter).sort('-createdAt').limit(100).select('-timeline'))
})

router.get('/orders/mine/:id', async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id }).populate(
    'deliveryPartner',
    'name phone delivery.vehicle delivery.rating',
  )
  if (!order) throw httpError(404, 'Order not found')
  res.json(order)
})

router.get('/orders/mine/:id/proof', async (req, res) => {
  if (!(await Order.exists({ _id: req.params.id, user: req.user._id }))) throw httpError(404, 'Order not found')
  await sendProof(res, req.params.id)
})

router.post('/orders/:id/cancel', async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().max(500).optional() }).parse(req.body)
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id })
  if (!order) throw httpError(404, 'Order not found')
  if (!['placed', 'confirmed'].includes(order.status)) {
    throw httpError(400, 'This order can no longer be cancelled. Please contact support.')
  }
  order.cancelReason = reason
  await changeStatus(order, 'cancelled', { by: 'customer', note: reason || 'Cancelled by customer' })
  res.json(order)
})

router.post('/orders/:id/return', async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(3, 'Tell us what went wrong').max(500) }).parse(req.body)
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id })
  if (!order) throw httpError(404, 'Order not found')
  if (order.status !== 'delivered') throw httpError(400, 'Only delivered orders can be returned')
  if (Date.now() - order.deliveredAt > 24 * 60 * 60 * 1000) {
    throw httpError(400, 'Returns are accepted within 24 hours of delivery for fresh dairy')
  }
  order.returnRequested = true
  order.returnReason = reason
  order.timeline.push({ status: 'delivered', note: `Return requested: ${reason}`, by: 'customer' })
  await order.save()
  res.json(order)
})

// ───────────── Admin ─────────────

router.get('/orders', allow('admin'), can('orders'), async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(100, Number(req.query.limit) || 20)
  const filter = {}
  if (ORDER_STATUSES.includes(req.query.status)) filter.status = req.query.status
  if (['store', 'subscription'].includes(req.query.source)) filter.source = req.query.source
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '')) filter['slot.date'] = req.query.date
  if (req.query.returns === '1') filter.returnRequested = true
  if (req.query.unassigned === '1') {
    filter.deliveryPartner = null
    filter.status = { $in: ['placed', 'confirmed', 'packed'] }
  }
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q.trim().slice(0, 100)), 'i')
    filter.$or = [{ orderNo: rx }, { 'address.name': rx }, { 'address.phone': rx }, { 'address.pincode': rx }]
  }
  const [items, total] = await Promise.all([
    Order.find(filter)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name phone email')
      .populate('deliveryPartner', 'name phone'),
    Order.countDocuments(filter),
  ])
  res.json({ items, total, page, pages: Math.ceil(total / limit) })
})

router.get('/orders/:id', allow('admin'), can('orders'), async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('user', 'name phone email')
    .populate('deliveryPartner', 'name phone delivery.vehicle')
  if (!order) throw httpError(404, 'Order not found')
  res.json(order)
})

router.get('/orders/:id/proof', allow('admin'), can('orders'), async (req, res) => {
  await sendProof(res, req.params.id)
})

router.patch('/orders/:id/status', allow('admin'), can('orders'), async (req, res) => {
  const { status, note } = z.object({ status: z.enum(ORDER_STATUSES), note: z.string().max(500).optional() }).parse(req.body)
  const order = await Order.findById(req.params.id)
  if (!order) throw httpError(404, 'Order not found')
  if (status === 'undelivered' && !note?.trim()) throw httpError(400, 'Say why the order could not be delivered')
  if (status === 'returned') order.returnRequested = false
  await changeStatus(order, status, { by: req.user.name, note })
  await audit(req, 'order.status', 'Order', order._id, `${order.orderNo} → ${status}`)
  res.json(order)
})

router.patch('/orders/:id/assign', allow('admin'), can('orders'), async (req, res) => {
  const { deliveryPartner } = z.object({ deliveryPartner: z.string().nullable() }).parse(req.body)
  const order = await Order.findById(req.params.id)
  if (!order) throw httpError(404, 'Order not found')
  if (['delivered', 'cancelled', 'returned'].includes(order.status)) throw httpError(400, 'Order is already closed')
  if (deliveryPartner) {
    const partner = await User.findOne({ _id: deliveryPartner, role: 'delivery', 'delivery.kycStatus': 'approved' })
    if (!partner) throw httpError(400, 'Choose an approved delivery partner')
    order.timeline.push({ status: order.status, note: `Assigned to ${partner.name}`, by: req.user.name })
  }
  order.deliveryPartner = deliveryPartner
  await order.save()
  await audit(req, 'order.assign', 'Order', order._id, order.orderNo)
  res.json(await order.populate('deliveryPartner', 'name phone'))
})

// ───────────── Admin: coupons ─────────────

const couponSchema = z.object({
  code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, - or _'),
  description: z.string().max(200).optional(),
  type: z.enum(['percent', 'flat']),
  value: z.number().min(0),
  maxDiscount: z.number().optional().nullable(),
  minOrder: z.number().optional(),
  usageLimit: z.number().optional().nullable(),
  validFrom: z.string().optional().nullable(),
  validTo: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
})

router.get('/coupons', allow('admin'), can('coupons'), async (_req, res) => {
  res.json(await Coupon.find().sort('-createdAt'))
})
const checkPercent = (c) => {
  if (c.type === 'percent' && c.value > 100) throw httpError(400, 'Percent discount cannot exceed 100')
}

router.post('/coupons', allow('admin'), can('coupons'), async (req, res) => {
  const body = couponSchema.parse(req.body)
  checkPercent(body)
  const coupon = await Coupon.create(body)
  await audit(req, 'coupon.create', 'Coupon', coupon._id, coupon.code)
  res.status(201).json(coupon)
})
router.put('/coupons/:id', allow('admin'), can('coupons'), async (req, res) => {
  const coupon = await Coupon.findById(req.params.id)
  if (!coupon) throw httpError(404, 'Coupon not found')
  coupon.set(couponSchema.partial().parse(req.body))
  checkPercent(coupon)
  await coupon.save()
  await audit(req, 'coupon.update', 'Coupon', coupon._id, coupon.code)
  res.json(coupon)
})
router.delete('/coupons/:id', allow('admin'), can('coupons'), async (req, res) => {
  await Coupon.findByIdAndDelete(req.params.id)
  await audit(req, 'coupon.delete', 'Coupon', req.params.id)
  res.json({ message: 'Deleted' })
})

export default router
