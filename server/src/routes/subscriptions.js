import { Router } from 'express'
import { z } from 'zod'
import { generateSubscriptionOrders } from '../jobs/subscriptions.js'
import { allow, can, protect } from '../middleware/auth.js'
import { limits } from '../middleware/rateLimit.js'
import { noStore } from '../middleware/security.js'
import { PaymentTransaction, Refund, SubscriptionEvent } from '../models/billing.js'
import { Setting, Zone } from '../models/misc.js'
import Subscription from '../models/Subscription.js'
import { httpError } from '../utils/http.js'
import { razorpayEnabled } from '../utils/razorpay.js'
import { audit } from '../utils/services.js'
import { addDaysKey, firstEditableDate, scopePincodes, todayKey } from '../services/common.js'
import { txView } from '../services/payments.js'
import {
  cancelSubscription,
  changeSubscription,
  overrideDay,
  pausePolicy,
  pauseRange,
  perDeliveryMinor,
  prepayQuote,
  setPaused,
  startTopup,
  upcoming,
} from '../services/productSubscriptions.js'

const router = Router()
router.use(protect, noStore)

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')
const tomorrow = () => addDaysKey(todayKey(), 1)

/** Customer-facing view: schedule, balance and what the customer may do right now. */
async function view(sub, days = 30) {
  const { billing } = await Setting.get()
  const holidays = billing?.holidays || []
  const each = perDeliveryMinor(sub)
  const o = sub.toObject()
  return {
    ...o,
    upcoming: upcoming(sub, days, holidays),
    perDeliveryMinor: each,
    deliveriesLeft: sub.billingMode === 'prepaid' && each ? Math.floor(sub.prepaidBalanceMinor / each) : null,
    editableFrom: firstEditableDate(billing),
    pausePolicy: pausePolicy(sub),
  }
}

// ───────────── Admin (declared first so /admin/* isn't captured by /:id) ─────────────

router.get('/admin/list', allow('admin'), can('subscriptions'), async (req, res) => {
  const filter = {}
  if (['pending_payment', 'active', 'paused', 'past_due', 'suspended', 'cancelled', 'failed'].includes(req.query.status)) filter.status = req.query.status
  const pins = await scopePincodes(req.user)
  if (pins) filter['address.pincode'] = { $in: pins }
  const subs = await Subscription.find(filter).sort('-createdAt').limit(500).populate('user', 'name phone')
  res.json(subs)
})

// "Tomorrow's milk sheet": total quantity per product, grouped by delivery zone.
router.get('/admin/sheet', allow('admin'), can('subscriptions'), async (req, res) => {
  const date = dateStr.safeParse(req.query.date).success ? req.query.date : tomorrow()
  const [subs, zones, settings] = await Promise.all([Subscription.find({ status: 'active' }).populate('user', 'name phone'), Zone.find({ isActive: true }), Setting.get()])
  const holidays = settings.billing?.holidays || []
  const pins = await scopePincodes(req.user)
  const zoneOf = (pin) => zones.find((z) => z.pincodes.includes(pin))?.name || 'Unzoned'
  const groups = {}
  const totals = {}
  const deliveries = []
  for (const s of subs) {
    if (pins && !pins.includes(s.address?.pincode)) continue
    const zone = zoneOf(s.address?.pincode)
    for (const it of s.itemsFor(date, { holidays })) {
      const key = `${it.productName} (${it.variantLabel})`
      groups[zone] ??= {}
      groups[zone][key] = (groups[zone][key] || 0) + it.qty
      totals[key] = (totals[key] || 0) + it.qty
      deliveries.push({ zone, customer: s.user?.name, phone: s.user?.phone, address: s.address, item: key, qty: it.qty, slot: s.slot, subscription: s.code })
    }
  }
  deliveries.sort((a, b) => a.zone.localeCompare(b.zone) || (a.address?.pincode || '').localeCompare(b.address?.pincode || ''))
  res.json({
    date,
    holiday: holidays.includes(date),
    zones: Object.entries(groups).map(([zone, items]) => ({ zone, items: Object.entries(items).map(([item, qty]) => ({ item, qty })) })),
    totals: Object.entries(totals).map(([item, qty]) => ({ item, qty })),
    deliveries,
  })
})

router.post('/admin/generate', allow('admin'), can('subscriptions'), async (req, res) => {
  const { date } = z.object({ date: dateStr.optional() }).parse(req.body)
  const result = await generateSubscriptionOrders(date || tomorrow())
  await audit(req, 'subscription.generate', 'Subscription', null, `${result.date}: ${result.created} orders`)
  res.json(result)
})

// ───────────── Customer ─────────────

async function mine(id, user) {
  const sub = await Subscription.findOne({ _id: id, user: user._id })
  if (!sub) throw httpError(404, 'Subscription not found')
  return sub
}

router.get('/', async (req, res) => {
  const subs = await Subscription.find({ user: req.user._id, status: { $nin: ['cancelled', 'failed'] } })
    .sort('-createdAt')
    .populate('items.product', 'name slug images category')
    .populate('plan', 'name slug')
  res.json(await Promise.all(subs.map((s) => view(s, 7))))
})

router.get('/history', async (req, res) => {
  res.json(await Subscription.find({ user: req.user._id, status: 'cancelled' }).sort('-updatedAt').limit(50).populate('plan', 'name slug'))
})

router.get('/:id', async (req, res) => {
  const sub = await mine(req.params.id, req.user)
  await sub.populate([{ path: 'items.product', select: 'name slug images category variants' }, { path: 'plan', select: 'name slug kind' }])
  res.json(await view(sub, 30))
})

router.get('/:id/billing', async (req, res) => {
  const sub = await mine(req.params.id, req.user)
  const [transactions, events, refunds] = await Promise.all([
    PaymentTransaction.find({ subscription: sub._id, user: req.user._id }).sort('-createdAt').limit(50),
    SubscriptionEvent.find({ entity: sub._id, user: req.user._id }).sort('-createdAt').limit(100).select('-actor.id'),
    Refund.find({ subscription: sub._id, user: req.user._id }).sort('-createdAt').select('-requestedBy -decidedBy'),
  ])
  res.json({
    transactions: transactions.map(txView),
    events,
    refunds,
    topup: sub.billingMode === 'prepaid' ? await prepayQuote(sub, firstEditableDate((await Setting.get()).billing)) : null,
    onlinePayments: razorpayEnabled(),
  })
})

const changeSchema = z
  .object({
    items: z.array(z.object({ product: objectId, variantId: objectId, qty: z.number().int().min(1).max(50) })).min(1).max(20),
    frequency: z.enum(['daily', 'alternate', 'weekly', 'custom']),
    days: z.array(z.number().int().min(0).max(6)).max(7),
    slot: z.string().max(40),
    addressId: objectId,
  })
  .partial()

// Preview a change: effective date and the price difference per delivery.
router.post('/:id/change-quote', async (req, res) => {
  const body = changeSchema.parse(req.body)
  const sub = await mine(req.params.id, req.user)
  res.json((await changeSubscription(sub, body, { user: req.user, req, dryRun: true })).summary)
})

router.patch('/:id', async (req, res) => {
  const body = changeSchema.extend({ status: z.enum(['active', 'paused']).optional(), autoRenew: z.boolean().optional() }).parse(req.body)
  const sub = await mine(req.params.id, req.user)
  if (['cancelled', 'failed', 'suspended', 'pending_payment'].includes(sub.status)) throw httpError(400, `A ${sub.status.replaceAll('_', ' ')} subscription can't be changed`)
  const { status, autoRenew, ...changes } = body
  if (Object.keys(changes).length) await changeSubscription(sub, changes, { user: req.user, req })
  if (autoRenew !== undefined) {
    if (sub.billingMode !== 'prepaid') throw httpError(400, 'Auto top-up only applies to prepaid subscriptions')
    sub.autoRenew = autoRenew && sub.terms?.policies?.renewal?.autoRenewAllowed !== false
    await sub.save()
  }
  if (status === 'paused' && sub.status !== 'paused') await setPaused(sub, true, { req })
  if (status === 'active' && sub.status === 'paused') await setPaused(sub, false, { req })
  res.json(await view(sub))
})

// Vacation mode / skip days: pause a date range (inclusive). `resume: true` un-pauses it.
router.post('/:id/vacation', async (req, res) => {
  const { from, to, resume } = z.object({ from: dateStr, to: dateStr, resume: z.boolean().optional() }).parse(req.body)
  const sub = await mine(req.params.id, req.user)
  if (['cancelled', 'failed'].includes(sub.status)) throw httpError(400, 'This subscription has ended')
  await pauseRange(sub, { from, to, resume, req })
  res.json(await view(sub))
})

// Change quantities for one specific day (e.g. "2 packets tomorrow"); qty 0 skips an item that day.
router.post('/:id/override', async (req, res) => {
  const body = z
    .object({
      date: dateStr,
      qty: z.number().int().min(0).max(50).optional(),
      items: z.array(z.object({ variantId: objectId, qty: z.number().int().min(0).max(50) })).max(20).optional(),
    })
    .parse(req.body)
  const sub = await mine(req.params.id, req.user)
  if (sub.status !== 'active') throw httpError(400, 'Only active subscriptions can change a day')
  const items = body.items || (body.qty !== undefined && sub.items.length === 1 ? [{ variantId: String(sub.items[0].variantId), qty: body.qty }] : null)
  if (!items) throw httpError(400, 'Choose the quantities for that day')
  await overrideDay(sub, { date: body.date, items })
  res.json(await view(sub))
})

router.post('/:id/topup', limits.sensitive, async (req, res) => {
  const body = z.object({ paymentMethod: z.enum(['razorpay', 'wallet']), idempotencyKey: z.string().trim().min(8).max(80) }).parse(req.body)
  const sub = await mine(req.params.id, req.user)
  const r = await startTopup({ sub, user: req.user, paymentMethod: body.paymentMethod, idempotencyKey: body.idempotencyKey })
  res.status(201).json({ transaction: txView(r.tx), ...r.payment })
})

router.post('/:id/cancel', limits.sensitive, async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(3, 'Tell us why you are cancelling').max(500) }).parse(req.body)
  const sub = await mine(req.params.id, req.user)
  const r = await cancelSubscription(sub, { reason, req })
  res.json({ subscription: await view(r.subscription), refund: r.refund })
})

export default router
