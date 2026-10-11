// The logged-in customer's membership, payments, invoices and notifications.
import { Router } from 'express'
import { z } from 'zod'
import { protect } from '../middleware/auth.js'
import { limits } from '../middleware/rateLimit.js'
import { noStore } from '../middleware/security.js'
import { Invoice, Membership, Notification, PaymentTransaction, Plan, Refund, SubscriptionEvent } from '../models/billing.js'
import { httpError } from '../utils/http.js'
import { razorpayEnabled } from '../utils/razorpay.js'
import { benefitMembership, cancelMembership, memberPricing, renewalQuote, startRenewal, undoCancellation } from '../services/memberships.js'
import { fulfil, txView, verifyGatewayPayment } from '../services/payments.js'
import { publicVersion } from '../services/plans.js'
import { recordEvent } from '../services/common.js'

const router = Router()
router.use(protect, noStore)

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')
const idempotencyKey = z.string().trim().min(8).max(80)

async function myMembership(id, user) {
  const m = await Membership.findOne({ _id: id, user: user._id })
  if (!m) throw httpError(404, 'Membership not found')
  return m
}

// ───────────── Membership ─────────────

router.get('/membership', async (req, res) => {
  const all = await Membership.find({ user: req.user._id, status: { $ne: 'failed' } }).sort('-createdAt').limit(20).populate('plan', 'name slug kind status')
  const current = all.find((m) => ['pending_payment', 'active', 'cancellation_pending', 'past_due', 'suspended'].includes(m.status)) || null
  let usage = null
  if (current && (await benefitMembership(req.user._id))) {
    const p = await memberPricing(req.user._id, { afterCoupon: 0 })
    usage = { limitReached: !!p.limitReached }
  }
  let nextPlan = null
  if (current?.nextPlanVersion) {
    const plan = await Plan.findOne({ publishedVersion: current.nextPlanVersion }).populate('publishedVersion')
    if (plan) nextPlan = { name: plan.name, slug: plan.slug, version: publicVersion(plan.publishedVersion) }
  }
  res.json({ current, history: all.filter((m) => m !== current), usage, nextPlan })
})

router.get('/membership/:id/events', async (req, res) => {
  const m = await myMembership(req.params.id, req.user)
  res.json(await SubscriptionEvent.find({ entity: m._id, user: req.user._id }).sort('-createdAt').limit(100).select('-actor.id'))
})

router.post('/membership/:id/cancel', limits.sensitive, async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(3, 'Tell us why you are cancelling').max(500) }).parse(req.body)
  const m = await myMembership(req.params.id, req.user)
  const r = await cancelMembership(m, { reason, req })
  res.json({ membership: r.membership, effective: r.effective, refund: r.refund })
})

router.post('/membership/:id/undo-cancel', async (req, res) => {
  z.object({}).parse(req.body || {})
  res.json(await undoCancellation(await myMembership(req.params.id, req.user), { req }))
})

router.patch('/membership/:id/auto-renew', async (req, res) => {
  const { autoRenew } = z.object({ autoRenew: z.boolean() }).parse(req.body)
  const m = await myMembership(req.params.id, req.user)
  if (autoRenew && m.terms.policies?.renewal?.autoRenewAllowed === false) throw httpError(400, 'This plan cannot renew automatically')
  if (!['active', 'past_due'].includes(m.status)) throw httpError(400, 'Auto-renew can only be changed on an active membership')
  m.autoRenew = autoRenew
  await m.save()
  await recordEvent({ entityType: 'membership', entity: m._id, user: m.user, type: autoRenew ? 'auto_renew_on' : 'auto_renew_off', req })
  res.json(m)
})

/** Switch to another membership plan from the next renewal. */
router.post('/membership/:id/change-plan', async (req, res) => {
  const { slug } = z.object({ slug: z.string().max(80) }).parse(req.body)
  const m = await myMembership(req.params.id, req.user)
  if (!['active', 'cancellation_pending', 'past_due'].includes(m.status)) throw httpError(400, 'Only an active membership can change plan')
  const plan = await Plan.findOne({ slug, kind: 'membership', status: 'published' })
  if (!plan?.publishedVersion) throw httpError(404, 'Plan not available')
  m.nextPlanVersion = String(plan.publishedVersion) === String(m.planVersion) ? undefined : plan.publishedVersion
  await m.save()
  await recordEvent({ entityType: 'membership', entity: m._id, user: m.user, type: 'plan_change_scheduled', req, data: { plan: plan.slug } })
  res.json({ membership: m, effective: m.currentPeriodEnd })
})

/** What renewing now would cost (server-priced, including a scheduled plan change) and how it can be paid. */
router.get('/membership/:id/renewal-quote', async (req, res) => {
  const m = await myMembership(req.params.id, req.user)
  const { quote } = await renewalQuote(m)
  res.json({ quote, onlinePayments: razorpayEnabled(), walletBalance: req.user.wallet })
})

router.post('/membership/:id/renew', limits.sensitive, async (req, res) => {
  const body = z.object({ paymentMethod: z.enum(['razorpay', 'wallet']), idempotencyKey }).parse(req.body)
  const m = await myMembership(req.params.id, req.user)
  const r = await startRenewal({ membership: m, user: req.user, paymentMethod: body.paymentMethod, idempotencyKey: body.idempotencyKey })
  res.status(201).json({ transaction: txView(r.tx), ...r.payment })
})

// ───────────── Payments ─────────────

router.get('/transactions', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  const filter = { user: req.user._id, status: { $ne: 'created' } }
  const [items, total] = await Promise.all([
    PaymentTransaction.find(filter).sort('-createdAt').skip((page - 1) * 20).limit(20),
    PaymentTransaction.countDocuments(filter),
  ])
  const invoices = await Invoice.find({ transaction: { $in: items.map((t) => t._id) } }).select('number transaction')
  const byTx = Object.fromEntries(invoices.map((i) => [String(i.transaction), { _id: i._id, number: i.number }]))
  res.json({ items: items.map((t) => ({ ...txView(t), invoice: byTx[String(t._id)] || null })), total, page, pages: Math.ceil(total / 20) })
})

router.get('/transactions/:id', async (req, res) => {
  const tx = await PaymentTransaction.findOne({ _id: req.params.id, user: req.user._id })
  if (!tx) throw httpError(404, 'Payment not found')
  const invoice = await Invoice.findOne({ transaction: tx._id }).select('number')
  res.json({ ...txView(tx), invoice })
})

router.post('/transactions/:id/verify', limits.sensitive, async (req, res) => {
  const body = z.object({ razorpay_order_id: z.string().max(64), razorpay_payment_id: z.string().max(64), razorpay_signature: z.string().max(256) }).parse(req.body)
  const tx = await PaymentTransaction.findOne({ _id: req.params.id, user: req.user._id })
  if (!tx) throw httpError(404, 'Payment not found')
  const done = await verifyGatewayPayment(tx, body)
  res.json(txView(done))
})

/** Retry fulfilment of a payment that was verified but whose activation hit an error. */
router.post('/transactions/:id/retry', async (req, res) => {
  z.object({}).parse(req.body || {})
  const tx = await PaymentTransaction.findOne({ _id: req.params.id, user: req.user._id, status: 'paid' })
  if (!tx) throw httpError(404, 'Payment not found')
  res.json(txView(await fulfil(tx._id)))
})

router.get('/refunds', async (req, res) => {
  res.json(await Refund.find({ user: req.user._id }).sort('-createdAt').limit(50).select('-requestedBy -decidedBy'))
})

router.get('/invoices', async (req, res) => {
  res.json(await Invoice.find({ user: req.user._id }).sort('-issuedAt').limit(100).select('number totalMinor currency issuedAt lines'))
})

router.get('/invoices/:id', async (req, res) => {
  const inv = await Invoice.findOne({ _id: req.params.id, user: req.user._id })
  if (!inv) throw httpError(404, 'Invoice not found')
  res.json(inv)
})

// ───────────── Notifications ─────────────

router.get('/notifications', async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find({ user: req.user._id }).sort('-createdAt').limit(50).select('type title body link readAt createdAt'),
    Notification.countDocuments({ user: req.user._id, readAt: null }),
  ])
  res.json({ items, unread })
})

router.post('/notifications/read', async (req, res) => {
  const { ids } = z.object({ ids: z.array(objectId).max(100).optional() }).parse(req.body || {})
  const filter = { user: req.user._id, readAt: null, ...(ids ? { _id: { $in: ids } } : {}) }
  const r = await Notification.updateMany(filter, { readAt: new Date() })
  res.json({ updated: r.modifiedCount })
})

export default router
