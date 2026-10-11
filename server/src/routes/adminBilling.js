// Admin + super admin: membership & subscription management, plans, payments, refunds, approvals, reports.
// Plans, billing settings and approvals are super admin only. Every privileged change is audit-logged.
import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { env } from '../config/env.js'
import { allow, can, protect } from '../middleware/auth.js'
import { limits } from '../middleware/rateLimit.js'
import { noStore } from '../middleware/security.js'
import {
  Invoice,
  JobRun,
  Membership,
  PaymentTransaction,
  Plan,
  PlanVersion,
  Refund,
  SubscriptionEvent,
  SubscriptionRequest,
} from '../models/billing.js'
import { Setting } from '../models/misc.js'
import Order from '../models/Order.js'
import Subscription from '../models/Subscription.js'
import User from '../models/User.js'
import { escapeRegex, httpError, pick, slugify } from '../utils/http.js'
import { razorpayEnabled } from '../utils/razorpay.js'
import { audit, walletChange } from '../utils/services.js'
import { changeStatus } from '../utils/orders.js'
import { addDaysKey, DAY_MS, formatMinor, recordEvent, scopePincodes, todayKey } from '../services/common.js'
import { applyMembershipOverride, cancelMembership, undoCancellation } from '../services/memberships.js'
import { TEMPLATES } from '../services/notify.js'
import { approveRefund, canApproveRefund, rejectRefund, requestRefund, txView } from '../services/payments.js'
import { cancelSubscription, creditBalance, setPaused, setSubscriptionStatus } from '../services/productSubscriptions.js'
import { JOBS } from '../jobs/billing.js'
import { runJob } from '../jobs/runner.js'

const router = Router()
router.use(protect, allow('admin'), noStore)
const superOnly = allow('superadmin')

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')
const reasonField = z.string().trim().min(3, 'Give a reason (at least 3 characters)').max(500)
const day = /^\d{4}-\d{2}-\d{2}$/
const pageOf = (req, size = 25) => {
  const page = Math.max(1, Number(req.query.page) || 1)
  return { page, size, skip: (page - 1) * size }
}
const range = (req, defDays = 30) => {
  const to = day.test(req.query.to || '') ? new Date(req.query.to + 'T23:59:59.999') : new Date()
  const from = day.test(req.query.from || '') ? new Date(req.query.from + 'T00:00:00') : new Date(to.getTime() - (defDays - 1) * DAY_MS)
  from.setHours(0, 0, 0, 0)
  return { from, to }
}

/** Users an admin may see (scoped admins: customers with an address in their zones). */
async function scopedUserIds(user) {
  const pins = await scopePincodes(user)
  if (!pins) return null
  return (await User.find({ 'addresses.pincode': { $in: pins } }).select('_id')).map((u) => u._id)
}

// ═════════════ Overview ═════════════

const REVENUE_PURPOSES = { membership: ['membership', 'membership_renewal'], recurring: ['subscription_prepay', 'subscription_topup'] }

async function revenueBetween(from, to) {
  const [paid, refunds] = await Promise.all([
    PaymentTransaction.aggregate([
      { $match: { paidAt: { $gte: from, $lte: to }, status: { $in: ['paid', 'refunded', 'partially_refunded'] } } },
      { $group: { _id: '$purpose', gross: { $sum: '$amountMinor' }, n: { $sum: 1 } } },
    ]),
    Refund.aggregate([
      { $match: { status: 'succeeded', updatedAt: { $gte: from, $lte: to } } },
      { $lookup: { from: 'paymenttransactions', localField: 'transaction', foreignField: '_id', as: 'tx' } },
      { $group: { _id: { $ifNull: [{ $first: '$tx.purpose' }, 'subscription_balance'] }, n: { $sum: '$amountMinor' } } },
    ]),
  ])
  const g = Object.fromEntries(paid.map((p) => [p._id, p]))
  const r = Object.fromEntries(refunds.map((p) => [p._id, p.n]))
  const sum = (keys, src, field) => keys.reduce((s, k) => s + (src[k]?.[field] ?? (typeof src[k] === 'number' ? src[k] : 0)), 0)
  const membershipGross = sum(REVENUE_PURPOSES.membership, g, 'gross')
  const recurringGross = sum(REVENUE_PURPOSES.recurring, g, 'gross')
  const membershipRefunds = REVENUE_PURPOSES.membership.reduce((s, k) => s + (r[k] || 0), 0)
  const recurringRefunds = REVENUE_PURPOSES.recurring.reduce((s, k) => s + (r[k] || 0), 0) + (r.subscription_balance || 0)
  return {
    membershipGrossMinor: membershipGross,
    membershipNetMinor: membershipGross - membershipRefunds,
    recurringGrossMinor: recurringGross,
    recurringNetMinor: recurringGross - recurringRefunds,
    refundsMinor: Object.values(r).reduce((s, n) => s + n, 0),
  }
}

/** Retention = terms that renewed ÷ terms that reached their end (renewed + expired + ended by cancellation). */
async function retentionBetween(from, to) {
  const agg = await SubscriptionEvent.aggregate([
    { $match: { entityType: 'membership', createdAt: { $gte: from, $lte: to }, type: { $in: ['renewed', 'expired', 'ended'] } } },
    { $group: { _id: '$type', n: { $sum: 1 } } },
  ])
  const c = Object.fromEntries(agg.map((a) => [a._id, a.n]))
  const reached = (c.renewed || 0) + (c.expired || 0) + (c.ended || 0)
  return { renewed: c.renewed || 0, expired: c.expired || 0, endedByCancellation: c.ended || 0, rate: reached ? Math.round(((c.renewed || 0) / reached) * 1000) / 10 : null }
}

router.get('/overview', can('memberships'), limits.expensive, async (req, res) => {
  const { from, to } = range(req, Number(req.query.days) > 0 ? Math.min(365, Number(req.query.days)) : 30)
  const users = await scopedUserIds(req.user)
  const scopeM = users ? { user: { $in: users } } : {}
  const pins = await scopePincodes(req.user)
  const scopeS = pins ? { 'address.pincode': { $in: pins } } : {}
  const soon = new Date(Date.now() + 7 * DAY_MS)
  const [mStatus, sStatus, pending, awaitingRenewal, payments, renewalFailures, series] = await Promise.all([
    Membership.aggregate([{ $match: scopeM }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Subscription.aggregate([{ $match: scopeS }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    PaymentTransaction.aggregate([{ $match: { status: 'created' } }, { $group: { _id: null, n: { $sum: 1 }, amount: { $sum: '$amountMinor' } } }]),
    Membership.countDocuments({ ...scopeM, status: 'active', autoRenew: false, currentPeriodEnd: { $lte: soon } }),
    PaymentTransaction.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $ne: 'created' } } },
      { $group: { _id: { $cond: [{ $in: ['$status', ['failed', 'expired']] }, 'failed', 'succeeded'] }, n: { $sum: 1 } } },
    ]),
    SubscriptionEvent.countDocuments({ type: 'renewal_failed', createdAt: { $gte: from, $lte: to } }),
    PaymentTransaction.aggregate([
      { $match: { paidAt: { $gte: from, $lte: to }, status: { $in: ['paid', 'refunded', 'partially_refunded'] } } },
      {
        $group: {
          _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$paidAt', timezone: 'Asia/Kolkata' } }, kind: { $cond: [{ $in: ['$purpose', REVENUE_PURPOSES.membership] }, 'membership', 'recurring'] } },
          amount: { $sum: '$amountMinor' },
        },
      },
    ]),
  ])
  const byDay = {}
  for (const s of series) (byDay[s._id.day] ??= { membership: 0, recurring: 0 })[s._id.kind] = s.amount
  const days = []
  for (let d = new Date(from); d <= to; d = new Date(d.getTime() + DAY_MS)) {
    const k = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    days.push({ date: k, membershipMinor: byDay[k]?.membership || 0, recurringMinor: byDay[k]?.recurring || 0 })
  }
  const counts = (agg) => Object.fromEntries(agg.map((a) => [a._id, a.n]))
  const showMoney = req.user.role === 'superadmin' || req.user.permissions.includes('reports')
  const [money, retention, pendingRefunds] = await Promise.all([showMoney ? revenueBetween(from, to) : null, retentionBetween(from, to), Refund.countDocuments({ status: 'requested' })])
  const p = counts(payments)
  res.json({
    from,
    to,
    memberships: counts(mStatus),
    subscriptions: counts(sStatus),
    pendingPayments: { count: pending[0]?.n || 0, amountMinor: pending[0]?.amount || 0 },
    awaitingRenewal,
    payments: { succeeded: p.succeeded || 0, failed: p.failed || 0 },
    renewalFailures,
    pendingRefunds,
    revenue: money,
    retention,
    series: showMoney ? days : [],
    definitions: {
      revenue: 'Verified payments received in the period (pending payments are never counted), minus refunds completed in the period. Membership = membership purchases and renewals; recurring = prepaid product subscription payments and top-ups.',
      retention: 'Membership terms that renewed in the period ÷ terms that ended in the period (renewed + expired + ended after a cancellation).',
    },
  })
})

// ═════════════ Plans (super admin manages; admins with the memberships permission can view) ═════════════

const versionSchema = z.object({
  name: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(140).optional(),
  description: z.string().max(3000).optional(),
  termsText: z.string().max(10000).optional(),
  priceMinor: z.number().int().min(0).max(100000000),
  interval: z.enum(['month', 'quarter', 'year', 'custom']),
  durationDays: z.number().int().min(1).max(730),
  taxPercent: z.number().min(0).max(28),
  benefits: z
    .object({
      discountPercent: z.number().min(0).max(90),
      maxDiscountPerOrderMinor: z.number().int().min(0),
      minOrderForDiscountMinor: z.number().int().min(0),
      freeDelivery: z.boolean(),
      freeDeliveryMinOrderMinor: z.number().int().min(0),
      prioritySupport: z.boolean(),
      ordersPerTermLimit: z.number().int().min(0).max(1000),
      exclusiveOffers: z.array(z.string().trim().min(1).max(140)).max(10),
      perks: z.array(z.string().trim().min(1).max(140)).max(10),
    })
    .partial()
    .optional(),
  product: z
    .object({
      billingMode: z.enum(['prepaid', 'per_delivery']),
      eligible: z.array(z.object({ product: objectId, variantId: objectId.optional().nullable() })).max(200),
      discountPercent: z.number().min(0).max(90),
      minQty: z.number().int().min(1).max(50),
      maxQty: z.number().int().min(1).max(50),
      maxItems: z.number().int().min(1).max(20),
      frequencies: z.array(z.enum(['daily', 'alternate', 'weekly', 'custom'])).min(1),
      deliveryFeeMinor: z.number().int().min(0).max(100000),
      prepayDays: z.number().int().min(1).max(180),
    })
    .partial()
    .optional(),
  policies: z
    .object({
      pause: z.object({ allowed: z.boolean(), minDays: z.number().int().min(1).max(365), maxDays: z.number().int().min(1).max(365), noticeDays: z.number().int().min(0).max(30) }).partial(),
      cancellation: z.object({ mode: z.enum(['end_of_term', 'immediate']), refund: z.enum(['none', 'prorata']), refundUnusedBalance: z.boolean() }).partial(),
      renewal: z.object({ autoRenewAllowed: z.boolean() }).partial(),
      gracePeriodDays: z.number().int().min(0).max(30),
      retry: z.object({ attempts: z.number().int().min(0).max(10), intervalHours: z.number().int().min(1).max(168) }).partial(),
    })
    .partial()
    .optional(),
  availability: z.object({ allZones: z.boolean(), zones: z.array(objectId).max(100) }).partial().optional(),
  validFrom: z.string().datetime({ offset: true }).or(z.string().regex(day)).nullable().optional(),
  validTo: z.string().datetime({ offset: true }).or(z.string().regex(day)).nullable().optional(),
})

const checkVersion = (v) => {
  if (v.product?.minQty && v.product?.maxQty && v.product.minQty > v.product.maxQty) throw httpError(400, 'Minimum quantity cannot exceed maximum quantity')
  if (v.policies?.pause?.minDays && v.policies?.pause?.maxDays && v.policies.pause.minDays > v.policies.pause.maxDays) throw httpError(400, 'Minimum pause cannot exceed maximum pause')
  if (v.validFrom && v.validTo && new Date(v.validFrom) > new Date(v.validTo)) throw httpError(400, 'The end date must be after the start date')
}

router.get('/plans', can('memberships'), async (req, res) => {
  const filter = {}
  if (['membership', 'product'].includes(req.query.kind)) filter.kind = req.query.kind
  if (['draft', 'published', 'unpublished', 'archived'].includes(req.query.status)) filter.status = req.query.status
  const plans = await Plan.find(filter).sort('kind sortOrder name').populate('publishedVersion')
  const latest = await PlanVersion.find({ plan: { $in: plans.map((p) => p._id) } }).sort('-version')
  const [mCounts, sCounts] = await Promise.all([
    Membership.aggregate([{ $match: { status: { $in: ['active', 'cancellation_pending', 'past_due'] } } }, { $group: { _id: '$plan', n: { $sum: 1 } } }]),
    Subscription.aggregate([{ $match: { status: { $in: ['active', 'paused', 'past_due'] }, plan: { $ne: null } } }, { $group: { _id: '$plan', n: { $sum: 1 } } }]),
  ])
  const live = Object.fromEntries([...mCounts, ...sCounts].map((c) => [String(c._id), c.n]))
  res.json(
    plans.map((p) => ({
      ...p.toObject(),
      latest: latest.find((v) => String(v.plan) === String(p._id)),
      activeSubscribers: live[String(p._id)] || 0,
    })),
  )
})

router.get('/plans/:id', can('memberships'), async (req, res) => {
  const plan = await Plan.findById(req.params.id)
  if (!plan) throw httpError(404, 'Plan not found')
  const versions = await PlanVersion.find({ plan: plan._id }).sort('-version').populate('product.eligible.product', 'name variants')
  const Model = plan.kind === 'membership' ? Membership : Subscription
  const [usage, recent] = await Promise.all([
    Model.aggregate([{ $match: { plan: plan._id } }, { $group: { _id: { version: '$planVersion', status: '$status' }, n: { $sum: 1 } } }]),
    Model.find({ plan: plan._id }).sort('-createdAt').limit(10).populate('user', 'name phone').select('code status user createdAt planVersion'),
  ])
  res.json({ plan, versions, usage: usage.map((u) => ({ version: u._id.version, status: u._id.status, n: u.n })), recent })
})

router.post('/plans', superOnly, async (req, res) => {
  const body = z.object({ kind: z.enum(['membership', 'product']), sortOrder: z.number().int().optional(), version: versionSchema }).parse(req.body)
  checkVersion(body.version)
  let slug = slugify(body.version.name)
  if (await Plan.exists({ slug })) slug += '-' + Date.now().toString(36)
  const plan = await Plan.create({ kind: body.kind, name: body.version.name, slug, sortOrder: body.sortOrder || 0, status: 'draft', latestVersion: 1, createdBy: req.user._id })
  const version = await PlanVersion.create({ ...body.version, plan: plan._id, version: 1, status: 'draft', createdBy: req.user._id })
  await audit(req, 'plan.create', 'Plan', plan._id, `${plan.name} (${plan.kind})`)
  res.status(201).json({ plan, version })
})

/** Edit a plan. Draft versions change in place; once a version is published a new draft version is created. */
router.put('/plans/:id', superOnly, async (req, res) => {
  const body = z.object({ sortOrder: z.number().int().optional(), version: versionSchema.partial().optional() }).parse(req.body)
  const plan = await Plan.findById(req.params.id)
  if (!plan) throw httpError(404, 'Plan not found')
  if (plan.status === 'archived') throw httpError(400, 'Archived plans cannot be edited')
  if (body.sortOrder !== undefined) plan.sortOrder = body.sortOrder
  let version = await PlanVersion.findOne({ plan: plan._id, version: plan.latestVersion })
  if (body.version) {
    if (version.status !== 'draft') {
      const base = version.toObject()
      delete base._id
      delete base.createdAt
      delete base.updatedAt
      plan.latestVersion += 1
      version = new PlanVersion({ ...base, version: plan.latestVersion, status: 'draft', publishedAt: undefined, createdBy: req.user._id })
    }
    version.set(body.version)
    checkVersion(version.toObject())
    await version.save()
  }
  await plan.save()
  await audit(req, 'plan.update', 'Plan', plan._id, `${plan.name} v${version.version}`)
  res.json({ plan, version })
})

router.post('/plans/:id/publish', superOnly, async (req, res) => {
  const { note } = z.object({ note: z.string().max(300).optional() }).parse(req.body || {})
  const plan = await Plan.findById(req.params.id)
  if (!plan) throw httpError(404, 'Plan not found')
  const draft = await PlanVersion.findOne({ plan: plan._id, version: plan.latestVersion, status: 'draft' })
  if (!draft) throw httpError(400, 'There is no draft version to publish')
  if (plan.kind === 'product' && draft.product?.billingMode === 'prepaid' && !(draft.product?.prepayDays > 0)) throw httpError(400, 'Set the prepaid period')
  await PlanVersion.updateMany({ plan: plan._id, status: 'published' }, { status: 'superseded' })
  draft.status = 'published'
  draft.publishedAt = new Date()
  await draft.save()
  Object.assign(plan, { publishedVersion: draft._id, status: 'published', name: draft.name })
  await plan.save()
  await audit(req, 'plan.publish', 'Plan', plan._id, `${plan.name} v${draft.version}${note ? `: ${note}` : ''}`)
  res.json({ plan, version: draft })
})

router.post('/plans/:id/status', superOnly, async (req, res) => {
  const { status } = z.object({ status: z.enum(['published', 'unpublished', 'archived']) }).parse(req.body)
  const plan = await Plan.findById(req.params.id)
  if (!plan) throw httpError(404, 'Plan not found')
  if (status === 'published' && !plan.publishedVersion) throw httpError(400, 'Publish a version first')
  if (plan.status === 'archived' && status !== 'archived') throw httpError(400, 'Archived plans stay archived')
  plan.status = status
  await plan.save()
  await audit(req, `plan.${status}`, 'Plan', plan._id, plan.name)
  res.json(plan)
})

// ═════════════ Memberships ═════════════

router.get('/memberships', can('memberships'), async (req, res) => {
  const { page, size, skip } = pageOf(req)
  const filter = {}
  const users = await scopedUserIds(req.user)
  if (users) filter.user = { $in: users }
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',').slice(0, 8) }
  if (mongoose.isValidObjectId(req.query.plan)) filter.plan = req.query.plan
  if (day.test(req.query.renewsBefore || '')) filter.currentPeriodEnd = { $lte: new Date(req.query.renewsBefore + 'T23:59:59') }
  if (day.test(req.query.from || '')) filter.createdAt = { $gte: new Date(req.query.from + 'T00:00:00') }
  if (req.query.q) {
    const q = String(req.query.q).trim().slice(0, 80)
    const rx = new RegExp(escapeRegex(q), 'i')
    const matched = (await User.find({ $or: [{ name: rx }, { phone: rx }, { email: rx }] }).select('_id').limit(500)).map((u) => u._id)
    filter.$or = [{ code: rx }, { user: { $in: matched } }]
  }
  const [items, total] = await Promise.all([
    Membership.find(filter).sort('-createdAt').skip(skip).limit(size).populate('user', 'name phone email').populate('plan', 'name slug'),
    Membership.countDocuments(filter),
  ])
  res.json({ items, total, page, pages: Math.ceil(total / size) })
})

async function scopedMembership(req) {
  const m = await Membership.findById(req.params.id).populate('user', 'name phone email wallet addresses').populate('plan', 'name slug')
  if (!m) throw httpError(404, 'Membership not found')
  const users = await scopedUserIds(req.user)
  if (users && !users.some((u) => String(u) === String(m.user._id))) throw httpError(404, 'Membership not found')
  return m
}

router.get('/memberships/:id', can('memberships'), async (req, res) => {
  const m = await scopedMembership(req)
  const [events, transactions, refunds, requests] = await Promise.all([
    SubscriptionEvent.find({ entity: m._id }).sort('-createdAt').limit(200),
    PaymentTransaction.find({ membership: m._id }).sort('-createdAt'),
    Refund.find({ membership: m._id }).sort('-createdAt'),
    SubscriptionRequest.find({ entity: m._id }).sort('-createdAt'),
  ])
  const invoices = await Invoice.find({ transaction: { $in: transactions.map((t) => t._id) } }).select('number transaction totalMinor issuedAt')
  res.json({ membership: m, events, transactions: transactions.map(txView), refunds, requests, invoices })
})

const OVERRIDES = ['suspend', 'reinstate', 'extend', 'credit']

/** Overrides: super admins apply them; admins file a request that a super admin approves. */
async function overrideOrRequest(req, { entityType, entity, action, payload, reason, apply }) {
  if (req.user.role === 'superadmin') {
    const result = await apply()
    await audit(req, `${entityType}.override.${action}`, entityType, entity._id, reason)
    return { applied: true, result }
  }
  const request = await SubscriptionRequest.create({ type: 'override', entityType, entity: entity._id, action, payload, reason, requestedBy: { id: req.user._id, name: req.user.name } })
  await recordEvent({ entityType, entity: entity._id, user: entity.user?._id || entity.user, type: 'override_requested', req, note: reason, data: { action, payload } })
  await audit(req, `${entityType}.override.request`, entityType, entity._id, `${action}: ${reason}`)
  return { applied: false, request }
}

router.post('/memberships/:id/action', can('memberships'), async (req, res) => {
  const { action, reason, days } = z
    .object({ action: z.enum(['cancel', 'cancel_now', 'undo_cancel', 'suspend', 'reinstate', 'extend']), reason: reasonField, days: z.number().int().min(1).max(365).optional() })
    .parse(req.body)
  const m = await scopedMembership(req)
  const doc = await Membership.findById(m._id)
  if (OVERRIDES.includes(action)) {
    const r = await overrideOrRequest(req, { entityType: 'membership', entity: doc, action, payload: { days }, reason, apply: () => applyMembershipOverride(doc, action, { days }, { req, reason }) })
    return res.json(r)
  }
  let result
  if (action === 'undo_cancel') result = await undoCancellation(doc, { req })
  else result = await cancelMembership(doc, { reason, req, immediate: action === 'cancel_now' })
  await audit(req, `membership.${action}`, 'Membership', doc._id, reason)
  res.json({ applied: true, result })
})

// ═════════════ Product subscriptions ═════════════

router.get('/subscriptions', can('subscriptions'), async (req, res) => {
  const { page, size, skip } = pageOf(req)
  const filter = {}
  const pins = await scopePincodes(req.user)
  if (pins) filter['address.pincode'] = { $in: pins }
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',').slice(0, 8) }
  if (mongoose.isValidObjectId(req.query.plan)) filter.plan = req.query.plan
  if (req.query.billing === 'prepaid' || req.query.billing === 'per_delivery') filter.billingMode = req.query.billing
  if (/^\d{6}$/.test(req.query.pincode || '')) filter['address.pincode'] = pins ? { $in: pins.filter((p) => p === req.query.pincode) } : req.query.pincode
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(String(req.query.q).trim().slice(0, 80)), 'i')
    const matched = (await User.find({ $or: [{ name: rx }, { phone: rx }, { email: rx }] }).select('_id').limit(500)).map((u) => u._id)
    filter.$or = [{ code: rx }, { user: { $in: matched } }, { 'address.phone': rx }]
  }
  const [items, total] = await Promise.all([
    Subscription.find(filter).sort('-createdAt').skip(skip).limit(size).populate('user', 'name phone').populate('plan', 'name slug'),
    Subscription.countDocuments(filter),
  ])
  res.json({ items, total, page, pages: Math.ceil(total / size) })
})

async function scopedSubscription(req) {
  const sub = await Subscription.findById(req.params.id).populate('user', 'name phone email wallet').populate('plan', 'name slug')
  if (!sub) throw httpError(404, 'Subscription not found')
  const pins = await scopePincodes(req.user)
  if (pins && !pins.includes(sub.address?.pincode)) throw httpError(404, 'Subscription not found')
  return sub
}

router.get('/subscriptions/:id', can('subscriptions'), async (req, res) => {
  const sub = await scopedSubscription(req)
  const [events, transactions, refunds, requests, orders] = await Promise.all([
    SubscriptionEvent.find({ entity: sub._id }).sort('-createdAt').limit(200),
    PaymentTransaction.find({ subscription: sub._id }).sort('-createdAt'),
    Refund.find({ subscription: sub._id }).sort('-createdAt'),
    SubscriptionRequest.find({ entity: sub._id }).sort('-createdAt'),
    Order.find({ subscription: sub._id }).sort('-slot.date').limit(30).select('orderNo slot status total payment.status payment.method deliveryPartner failureReason').populate('deliveryPartner', 'name'),
  ])
  res.json({ subscription: sub, events, transactions: transactions.map(txView), refunds, requests, orders })
})

router.post('/subscriptions/:id/action', can('subscriptions'), async (req, res) => {
  const { action, reason, amountMinor } = z
    .object({ action: z.enum(['pause', 'resume', 'cancel', 'suspend', 'reinstate', 'credit']), reason: reasonField, amountMinor: z.number().int().min(1).max(10000000).optional() })
    .parse(req.body)
  const populated = await scopedSubscription(req)
  const sub = await Subscription.findById(populated._id)
  if (OVERRIDES.includes(action)) {
    if (action === 'credit' && (!amountMinor || sub.billingMode !== 'prepaid')) throw httpError(400, 'Credits need an amount and a prepaid subscription')
    const apply = async () => {
      if (action === 'suspend') return setSubscriptionStatus(sub, 'suspended', { req, type: 'override', note: reason })
      if (action === 'reinstate') return setSubscriptionStatus(sub, 'active', { req, type: 'override', note: reason })
      await creditBalance(sub._id, amountMinor)
      await recordEvent({ entityType: 'subscription', entity: sub._id, user: sub.user, type: 'credited', req, note: reason, data: { amountMinor } })
      return Subscription.findById(sub._id)
    }
    return res.json(await overrideOrRequest(req, { entityType: 'subscription', entity: sub, action, payload: { amountMinor }, reason, apply }))
  }
  let result
  if (action === 'pause') result = await setPaused(sub, true, { req, reason })
  else if (action === 'resume') result = await setPaused(sub, false, { req, reason })
  else result = (await cancelSubscription(sub, { reason, req })).subscription
  await audit(req, `subscription.${action}`, 'Subscription', sub._id, reason)
  res.json({ applied: true, result })
})

// ═════════════ Override approvals (super admin) ═════════════

router.get('/requests', can('memberships'), async (req, res) => {
  const filter = ['pending', 'approved', 'rejected'].includes(req.query.status) ? { status: req.query.status } : {}
  if (req.user.role !== 'superadmin') filter['requestedBy.id'] = req.user._id
  res.json(await SubscriptionRequest.find(filter).sort('-createdAt').limit(200))
})

router.post('/requests/:id/decide', superOnly, async (req, res) => {
  const { approve, note } = z.object({ approve: z.boolean(), note: z.string().trim().max(500).optional() }).parse(req.body)
  const pending = await SubscriptionRequest.findOne({ _id: req.params.id, status: 'pending' })
  if (!pending) throw httpError(409, 'This request has already been decided')
  if (approve && String(pending.requestedBy?.id) === String(req.user._id)) throw httpError(400, 'You cannot approve your own request')
  const request = await SubscriptionRequest.findOneAndUpdate(
    { _id: req.params.id, status: 'pending' },
    { status: approve ? 'approved' : 'rejected', decidedBy: { id: req.user._id, name: req.user.name }, decisionNote: note, decidedAt: new Date() },
    { returnDocument: 'after' },
  )
  if (!request) throw httpError(409, 'This request has already been decided')
  if (approve) {
    const reason = `${request.reason} (approved by ${req.user.name})`
    if (request.entityType === 'membership') {
      await applyMembershipOverride(await Membership.findById(request.entity), request.action, request.payload, { req, reason })
    } else {
      const sub = await Subscription.findById(request.entity)
      if (request.action === 'suspend') await setSubscriptionStatus(sub, 'suspended', { req, type: 'override', note: reason })
      else if (request.action === 'reinstate') await setSubscriptionStatus(sub, 'active', { req, type: 'override', note: reason })
      else if (request.action === 'credit') {
        await creditBalance(sub._id, request.payload.amountMinor)
        await recordEvent({ entityType: 'subscription', entity: sub._id, user: sub.user, type: 'credited', req, note: reason, data: request.payload })
      }
    }
  }
  await audit(req, approve ? 'override.approve' : 'override.reject', request.entityType, request.entity, `${request.action}: ${note || ''}`)
  res.json(request)
})

// ═════════════ Payments & refunds ═════════════

router.get('/transactions', can('memberships'), async (req, res) => {
  const { page, size, skip } = pageOf(req)
  const filter = {}
  const users = await scopedUserIds(req.user)
  if (users) filter.user = { $in: users }
  if (req.query.status) filter.status = { $in: String(req.query.status).split(',').slice(0, 6) }
  if (req.query.purpose) filter.purpose = { $in: String(req.query.purpose).split(',').slice(0, 4) }
  if (req.query.provider) filter.provider = req.query.provider
  const { from, to } = range(req, 365)
  filter.createdAt = { $gte: from, $lte: to }
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(String(req.query.q).trim().slice(0, 80)), 'i')
    const matched = (await User.find({ $or: [{ name: rx }, { phone: rx }, { email: rx }] }).select('_id').limit(500)).map((u) => u._id)
    filter.$or = [{ user: { $in: matched } }, { providerPaymentId: rx }, { providerOrderId: rx }]
  }
  const [items, total] = await Promise.all([
    PaymentTransaction.find(filter).sort('-createdAt').skip(skip).limit(size).populate('user', 'name phone'),
    PaymentTransaction.countDocuments(filter),
  ])
  const invoices = await Invoice.find({ transaction: { $in: items.map((t) => t._id) } }).select('number transaction')
  const inv = Object.fromEntries(invoices.map((i) => [String(i.transaction), i]))
  res.json({
    items: items.map((t) => ({ ...txView(t), user: t.user, providerPaymentId: t.providerPaymentId, invoice: inv[String(t._id)] || null, history: t.history })),
    total,
    page,
    pages: Math.ceil(total / size),
  })
})

router.get('/invoices/:id', can('memberships'), async (req, res) => {
  const inv = await Invoice.findById(req.params.id)
  if (!inv) throw httpError(404, 'Invoice not found')
  res.json(inv)
})

router.get('/refunds', can('memberships'), async (req, res) => {
  const filter = req.query.status ? { status: { $in: String(req.query.status).split(',').slice(0, 6) } } : {}
  const users = await scopedUserIds(req.user)
  if (users) filter.user = { $in: users }
  const { billing } = await Setting.get()
  const items = await Refund.find(filter).sort('-createdAt').limit(200).populate('user', 'name phone').populate('requestedBy', 'name').populate('decidedBy', 'name')
  res.json({ items, approvalLimitMinor: billing?.refundApprovalLimitMinor ?? 0 })
})

router.post('/refunds', can('refunds'), limits.sensitive, async (req, res) => {
  const body = z.object({ transaction: objectId, amountMinor: z.number().int().min(1), reason: reasonField, destination: z.enum(['wallet', 'source']).default('wallet') }).parse(req.body)
  const tx = await PaymentTransaction.findById(body.transaction)
  if (!tx) throw httpError(404, 'Payment not found')
  const users = await scopedUserIds(req.user)
  if (users && !users.some((u) => String(u) === String(tx.user))) throw httpError(404, 'Payment not found')
  const refund = await requestRefund({ tx, amountMinor: body.amountMinor, reason: body.reason, destination: body.destination, req })
  await audit(req, 'refund.request', 'Refund', refund._id, `${formatMinor(body.amountMinor)} on ${tx._id}: ${body.reason}`)
  res.status(201).json(refund)
})

router.post('/refunds/:id/decide', can('refunds'), async (req, res) => {
  const { approve, note } = z.object({ approve: z.boolean(), note: reasonField }).parse(req.body)
  const refund = await Refund.findById(req.params.id)
  if (!refund) throw httpError(404, 'Refund not found')
  if (approve && !(await canApproveRefund(req.user, refund.amountMinor))) throw httpError(403, 'This refund is above your approval limit. A super admin must approve it.')
  if (approve && String(refund.requestedBy) === String(req.user._id) && req.user.role !== 'superadmin') throw httpError(400, 'You cannot approve your own refund request')
  res.json(approve ? await approveRefund(refund, { req, note }) : await rejectRefund(refund, { req, note }))
})

// ═════════════ Missed deliveries ═════════════

router.get('/missed-deliveries', can('orders'), async (req, res) => {
  const pins = await scopePincodes(req.user)
  const filter = { status: 'undelivered', ...(pins ? { 'address.pincode': { $in: pins } } : {}) }
  res.json(await Order.find(filter).sort('-updatedAt').limit(200).populate('user', 'name phone').populate('deliveryPartner', 'name phone'))
})

/** Resolve a missed delivery: redeliver on a new date, cancel with a refund, or credit a delivered-but-missing order. */
router.post('/missed-deliveries/:orderId/resolve', can('orders'), async (req, res) => {
  const body = z
    .object({ action: z.enum(['redeliver', 'refund', 'credit']), date: z.string().regex(day).optional(), amount: z.number().positive().max(100000).optional(), note: reasonField })
    .parse(req.body)
  const order = await Order.findById(req.params.orderId)
  if (!order) throw httpError(404, 'Order not found')
  const pins = await scopePincodes(req.user)
  if (pins && !pins.includes(order.address?.pincode)) throw httpError(404, 'Order not found')
  const resolution = { action: body.action, by: req.user.name, at: new Date(), note: body.note }
  if (body.action === 'redeliver') {
    if (order.status !== 'undelivered') throw httpError(400, 'Only undelivered orders can be redelivered')
    const date = body.date || addDaysKey(todayKey(), 1)
    if (date < todayKey()) throw httpError(400, 'Choose today or a later date')
    order.slot.date = date
    await changeStatus(order, 'confirmed', { by: req.user.name, note: `Redelivery on ${date}: ${body.note}` })
  } else if (body.action === 'refund') {
    if (order.status !== 'undelivered') throw httpError(400, 'Only undelivered orders can be refunded here')
    if (order.payment.status === 'paid') resolution.amount = order.total
    await changeStatus(order, 'cancelled', { by: req.user.name, note: `Missed delivery refunded: ${body.note}` })
  } else {
    // Delivered but the customer reports it missing: credit (to the subscription balance for prepaid deliveries).
    if (order.status !== 'delivered') throw httpError(400, 'Credits are for delivered orders reported missing')
    const amount = Math.min(body.amount || order.total, order.total)
    resolution.amount = amount
    // Claim the order before any money moves, so two clicks (or two admins) can never credit it twice.
    const claimed = await Order.updateOne(
      { _id: order._id, status: 'delivered', 'missedResolution.action': { $exists: false } },
      { $set: { missedResolution: resolution } },
    )
    if (!claimed.modifiedCount) throw httpError(409, 'This order was already resolved')
    if (order.payment.method === 'prepaid' && order.subscription) await creditBalance(order.subscription, Math.round(amount * 100))
    else await walletChange(order.user, amount, `Credit for missing order ${order.orderNo}`, order._id)
    order.timeline.push({ status: order.status, note: `₹${amount} credited: ${body.note}`, by: req.user.name })
  }
  order.missedResolution = resolution
  await order.save()
  await audit(req, `order.missed.${body.action}`, 'Order', order._id, `${order.orderNo}: ${body.note}`)
  res.json(order)
})

// ═════════════ Reports ═════════════

router.get('/reports', can('reports'), limits.expensive, async (req, res) => {
  const { from, to } = range(req, 30)
  const fromKey = from.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const toKey = to.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const subOrderMatch = { source: 'subscription', 'slot.date': { $gte: fromKey, $lte: toKey } }
  const [revenue, retention, mStatus, sStatus, newMemberships, newSubs, renewals, renewalFailures, cancellations, paused, delivery, quantities, refunds, payments] = await Promise.all([
    revenueBetween(from, to),
    retentionBetween(from, to),
    Membership.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Subscription.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Membership.aggregate([
      { $match: { startedAt: { $gte: from, $lte: to } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$startedAt', timezone: 'Asia/Kolkata' } }, n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Subscription.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $nin: ['pending_payment', 'failed'] } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } }, n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    PaymentTransaction.countDocuments({ purpose: 'membership_renewal', paidAt: { $gte: from, $lte: to } }),
    SubscriptionEvent.countDocuments({ type: 'renewal_failed', createdAt: { $gte: from, $lte: to } }),
    SubscriptionEvent.aggregate([
      { $match: { type: { $in: ['cancelled', 'cancel_requested'] }, createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: { kind: '$entityType', reason: { $ifNull: ['$note', 'No reason given'] } }, n: { $sum: 1 } } },
      { $sort: { n: -1 } },
      { $limit: 50 },
    ]),
    Subscription.countDocuments({ status: 'paused' }),
    Order.aggregate([{ $match: subOrderMatch }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: { ...subOrderMatch, status: { $nin: ['cancelled'] } } },
      { $unwind: '$items' },
      { $group: { _id: { name: '$items.name', variant: '$items.variantLabel' }, qty: { $sum: '$items.qty' } } },
      { $sort: { qty: -1 } },
      { $limit: 50 },
    ]),
    Refund.aggregate([{ $match: { updatedAt: { $gte: from, $lte: to } } }, { $group: { _id: '$status', n: { $sum: 1 }, amount: { $sum: '$amountMinor' } } }]),
    PaymentTransaction.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, status: { $ne: 'created' } } },
      { $group: { _id: { purpose: '$purpose', status: '$status' }, n: { $sum: 1 }, amount: { $sum: '$amountMinor' } } },
    ]),
  ])
  const counts = (agg) => Object.fromEntries(agg.map((a) => [a._id, a.n]))
  const d = counts(delivery)
  const attempted = (d.delivered || 0) + (d.undelivered || 0)
  res.json({
    from,
    to,
    revenue,
    retention,
    memberships: counts(mStatus),
    subscriptions: counts(sStatus),
    newMemberships: newMemberships.map((x) => ({ date: x._id, n: x.n })),
    newSubscriptions: newSubs.map((x) => ({ date: x._id, n: x.n })),
    renewals: { succeeded: renewals, failed: renewalFailures },
    cancellations: cancellations.map((c) => ({ kind: c._id.kind, reason: c._id.reason, n: c.n })),
    pausedSubscriptions: paused,
    delivery: { byStatus: d, missed: d.undelivered || 0, onTimeRate: attempted ? Math.round(((d.delivered || 0) / attempted) * 1000) / 10 : null },
    quantities: quantities.map((q) => ({ product: q._id.name, variant: q._id.variant, qty: q.qty })),
    refunds: refunds.map((r) => ({ status: r._id, n: r.n, amountMinor: r.amount })),
    payments: payments.map((p) => ({ purpose: p._id.purpose, status: p._id.status, n: p.n, amountMinor: p.amount })),
    definitions: {
      revenue: 'Verified payments in the period minus refunds completed in the period. Pending payments are not revenue.',
      retention: 'Membership terms renewed ÷ terms that ended (renewed + expired + ended after cancellation) in the period.',
      onTimeRate: 'Subscription deliveries scheduled in the period that were delivered ÷ those delivered or marked undelivered.',
    },
  })
})

// ═════════════ Billing settings & jobs (super admin) ═════════════

const BILLING_FIELDS = ['currency', 'invoicePrefix', 'deliveryCutoff', 'holidays', 'refundApprovalLimitMinor', 'reminderDays', 'checkoutExpiryMinutes', 'auditRetentionDays']

router.get('/settings', superOnly, async (_req, res) => {
  const s = await Setting.get()
  const billing = s.billing?.toObject ? s.billing.toObject() : s.billing || {}
  res.json({
    billing: { ...pick(billing, BILLING_FIELDS), notificationTemplates: Object.fromEntries(s.billing?.notificationTemplates || []) },
    defaults: { notificationTemplates: TEMPLATES },
    taxPercent: s.taxPercent,
    gateway: {
      provider: 'razorpay',
      configured: razorpayEnabled(),
      webhookConfigured: !!env.razorpayWebhookSecret,
      keyMode: env.razorpayKeyId ? (env.razorpayKeyId.startsWith('rzp_live') ? 'live' : 'test') : null,
      webhookUrl: '/api/payments/webhook',
    },
  })
})

router.put('/settings', superOnly, async (req, res) => {
  const body = z
    .object({
      currency: z.enum(['INR']),
      invoicePrefix: z.string().trim().regex(/^[A-Z0-9-]{1,10}$/, 'Use 1-10 capital letters, digits or -'),
      deliveryCutoff: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)'),
      holidays: z.array(z.string().regex(day)).max(366),
      refundApprovalLimitMinor: z.number().int().min(0).max(100000000),
      reminderDays: z.array(z.number().int().min(1).max(60)).max(5),
      checkoutExpiryMinutes: z.number().int().min(10).max(1440),
      auditRetentionDays: z.number().int().min(0).max(3650),
      notificationTemplates: z.record(z.string(), z.object({ title: z.string().trim().max(120), body: z.string().trim().max(500) })),
    })
    .partial()
    .parse(req.body)
  if (body.auditRetentionDays && body.auditRetentionDays < 90) throw httpError(400, 'Keep audit logs for at least 90 days (or 0 to keep them forever)')
  if (body.notificationTemplates) for (const k of Object.keys(body.notificationTemplates)) if (!TEMPLATES[k]) throw httpError(400, `Unknown notification template: ${k}`)
  const s = await Setting.get()
  for (const [k, v] of Object.entries(body)) {
    if (k === 'notificationTemplates') s.billing.notificationTemplates = new Map(Object.entries(v).filter(([, t]) => t.title || t.body))
    else if (k === 'holidays') s.billing.holidays = [...new Set(v)].sort()
    else s.billing[k] = v
  }
  await s.save()
  await audit(req, 'billing.settings', 'Setting', s._id, Object.keys(body).join(', '))
  res.json({ ok: true })
})

router.get('/jobs', superOnly, async (_req, res) => {
  const names = Object.keys(JOBS)
  const latest = await Promise.all(names.map((name) => JobRun.find({ name }).sort('-startedAt').limit(5)))
  res.json(names.map((name, i) => ({ name, runs: latest[i] })))
})

router.post('/jobs/:name/run', superOnly, limits.expensive, async (req, res) => {
  z.object({}).parse(req.body || {})
  const fn = JOBS[req.params.name]
  if (!fn) throw httpError(404, 'Unknown job')
  const result = await runJob(req.params.name, fn)
  await audit(req, 'job.run', 'Job', null, req.params.name)
  res.json({ result })
})

export default router
