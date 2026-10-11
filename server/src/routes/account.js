// The logged-in user's own profile, addresses, wallet and support tickets.
import { Router } from 'express'
import { z } from 'zod'
import { env } from '../config/env.js'
import { issueTokens, protect, revokeAllSessions } from '../middleware/auth.js'
import { limits } from '../middleware/rateLimit.js'
import { noStore } from '../middleware/security.js'
import { Ticket, WalletTopup, WalletTransaction, Zone } from '../models/misc.js'
import Order from '../models/Order.js'
import User from '../models/User.js'
import { httpError, pick } from '../utils/http.js'
import { createRazorpayOrder, razorpayEnabled, verifyPaymentSignature } from '../utils/razorpay.js'
import { walletChange } from '../utils/services.js'
import { benefitMembership } from '../services/memberships.js'
import Subscription from '../models/Subscription.js'

const router = Router()

// Public: can we deliver to this pincode?
router.get('/serviceability/:pincode', async (req, res) => {
  if (!/^\d{6}$/.test(req.params.pincode)) throw httpError(400, 'Pincode must be 6 digits')
  const zone = await Zone.findOne({ isActive: true, pincodes: req.params.pincode })
  res.json({ serviceable: !!zone, zone: zone ? pick(zone, ['name', 'extraFee']) : null })
})

router.use(protect, noStore)

router.patch('/profile', async (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      email: z.email().max(254).optional(),
      phone: z.string().regex(/^[6-9]\d{9}$/).optional(),
      preferences: z.object({ language: z.enum(['en', 'hi']), notifications: z.boolean() }).partial().optional(),
    })
    .parse(req.body)
  Object.assign(req.user, pick(body, ['name', 'email', 'phone']))
  if (body.preferences) Object.assign(req.user.preferences, body.preferences)
  await req.user.save()
  res.json({ user: req.user })
})

router.patch('/password', limits.sensitive, async (req, res) => {
  const { currentPassword, newPassword } = z
    .object({ currentPassword: z.string().max(200).optional(), newPassword: z.string().min(8).max(72) })
    .parse(req.body)
  const user = await User.findById(req.user._id).select('+password')
  if (user.password && !(await user.comparePassword(currentPassword || ''))) {
    throw httpError(400, 'Current password is incorrect')
  }
  user.password = newPassword
  user.tokenVersion += 1 // sign out other devices
  await user.save()
  await revokeAllSessions(user._id)
  await issueTokens(req, res, user) // keep this device signed in
  res.json({ message: 'Password updated' })
})

const addressSchema = z.object({
  label: z.string().max(20).default('Home'),
  name: z.string().trim().min(2).max(80),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  line1: z.string().trim().min(3).max(120),
  line2: z.string().max(120).optional(),
  landmark: z.string().max(120).optional(),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits'),
  location: z.object({ lat: z.number(), lng: z.number() }).optional(),
  isDefault: z.boolean().optional(),
})

function setDefault(user, id) {
  user.addresses.forEach((a) => (a.isDefault = String(a._id) === String(id)))
}

router.post('/addresses', async (req, res) => {
  const data = addressSchema.parse(req.body)
  if (req.user.addresses.length >= 20) throw httpError(400, 'You can save up to 20 addresses')
  req.user.addresses.push(data)
  const added = req.user.addresses.at(-1)
  if (data.isDefault || req.user.addresses.length === 1) setDefault(req.user, added._id)
  await req.user.save()
  res.status(201).json({ user: req.user })
})

router.put('/addresses/:id', async (req, res) => {
  const addr = req.user.addresses.id(req.params.id)
  if (!addr) throw httpError(404, 'Address not found')
  const data = addressSchema.parse(req.body)
  addr.set(data)
  if (data.isDefault) setDefault(req.user, addr._id)
  await req.user.save()
  res.json({ user: req.user })
})

router.delete('/addresses/:id', async (req, res) => {
  req.user.addresses.pull(req.params.id)
  if (req.user.addresses.length && !req.user.addresses.some((a) => a.isDefault)) {
    req.user.addresses[0].isDefault = true
  }
  await req.user.save()
  res.json({ user: req.user })
})

router.get('/wallet', async (req, res) => {
  const transactions = await WalletTransaction.find({ user: req.user._id }).sort('-createdAt').limit(100)
  res.json({ balance: req.user.wallet, transactions })
})

// Add money to the wallet. Same pattern as checkout's online payment: if Razorpay keys are
// configured we create a real order and only credit the wallet once the payment is verified
// (see /wallet/topup/verify); without keys, online payment must never be silently skipped in
// production, so it's simulated as instantly paid in development only.
router.post('/wallet/topup', limits.sensitive, async (req, res) => {
  const { amount } = z.object({ amount: z.number().int().min(10).max(10000) }).parse(req.body)
  if (!razorpayEnabled()) {
    if (env.isProd) throw httpError(400, 'Adding money online is unavailable right now. Please try again later.')
    const balance = await walletChange(req.user._id, amount, 'Wallet top-up (simulated — add Razorpay keys for real payments)')
    return res.json({ balance })
  }
  const topup = await WalletTopup.create({ user: req.user._id, amount })
  const rp = await createRazorpayOrder(amount, `topup-${topup._id}`)
  topup.razorpayOrderId = rp.id
  await topup.save()
  res.json({ razorpay: { keyId: env.razorpayKeyId, orderId: rp.id, amount: rp.amount, currency: rp.currency }, topupId: topup._id })
})

router.post('/wallet/topup/verify', limits.sensitive, async (req, res) => {
  const body = z
    .object({
      topupId: z.string(),
      razorpay_order_id: z.string(),
      razorpay_payment_id: z.string(),
      razorpay_signature: z.string(),
    })
    .parse(req.body)
  const topup = await WalletTopup.findOne({ _id: body.topupId, user: req.user._id })
  if (!topup || topup.razorpayOrderId !== body.razorpay_order_id) throw httpError(404, 'Top-up not found')
  if (topup.status === 'paid') return res.json({ balance: req.user.wallet }) // already credited; keep this idempotent
  if (!verifyPaymentSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature)) {
    topup.status = 'failed'
    await topup.save()
    throw httpError(400, 'Payment verification failed')
  }
  topup.status = 'paid'
  topup.razorpayPaymentId = body.razorpay_payment_id
  await topup.save()
  const balance = await walletChange(req.user._id, topup.amount, `Wallet top-up via Razorpay (${body.razorpay_payment_id})`)
  res.json({ balance })
})

// Support tickets (customer + delivery partner)
router.get('/tickets', async (req, res) => {
  res.json(await Ticket.find({ user: req.user._id }).sort('-updatedAt'))
})

router.post('/tickets', limits.sensitive, async (req, res) => {
  const { subject, message, order, category, subscription } = z
    .object({
      subject: z.string().trim().min(3).max(150),
      message: z.string().trim().min(3).max(4000),
      order: z.string().optional(),
      subscription: z.string().optional(),
      category: z.enum(['general', 'order', 'missed_delivery', 'subscription', 'membership', 'billing']).optional(),
    })
    .parse(req.body)
  if (subscription && !(await Subscription.exists({ _id: subscription, user: req.user._id }))) throw httpError(400, 'Subscription not found')
  if (category === 'missed_delivery' && !order) throw httpError(400, 'Choose the order that was missed')
  // Members whose plan includes priority support jump the queue.
  const member = await benefitMembership(req.user._id)
  // A ticket may only reference the customer's own order (or one they delivered, for partners).
  if (order && !(await Order.exists({ _id: order, $or: [{ user: req.user._id }, { deliveryPartner: req.user._id }] }))) {
    throw httpError(400, 'Order not found')
  }
  const ticket = await Ticket.create({
    user: req.user._id,
    subject,
    order: order || undefined,
    subscription: subscription || undefined,
    category: category || (order ? 'order' : 'general'),
    priority: member?.terms?.benefits?.prioritySupport ? 'high' : 'normal',
    messages: [{ from: req.user._id, name: req.user.name, role: req.user.role, text: message }],
  })
  res.status(201).json(ticket)
})

router.get('/tickets/:id', async (req, res) => {
  const ticket = await Ticket.findOne({ _id: req.params.id, user: req.user._id })
  if (!ticket) throw httpError(404, 'Ticket not found')
  res.json(ticket)
})

router.post('/tickets/:id/reply', async (req, res) => {
  const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).parse(req.body)
  const ticket = await Ticket.findOne({ _id: req.params.id, user: req.user._id })
  if (!ticket) throw httpError(404, 'Ticket not found')
  ticket.messages.push({ from: req.user._id, name: req.user.name, role: req.user.role, text })
  ticket.status = 'open'
  await ticket.save()
  res.json(ticket)
})

export default router
