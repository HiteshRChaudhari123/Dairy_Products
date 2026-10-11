// Admin + super admin: dashboard stats, users, delivery partners, tickets, reports,
// and (super admin only) admins/permissions, zones, settings, payouts, audit logs, CMS.
import { Router } from 'express'
import { z } from 'zod'
import { allow, can, protect, revokeAllSessions } from '../middleware/auth.js'
import { limits } from '../middleware/rateLimit.js'
import { noStore } from '../middleware/security.js'
import { AuditLog, Campaign, CAMPAIGN_AUDIENCES, CAMPAIGN_CHANNELS, Page, Setting, Ticket, WalletTransaction, Zone } from '../models/misc.js'
import Order from '../models/Order.js'
import Product from '../models/Product.js'
import Subscription from '../models/Subscription.js'
import User, { PERMISSIONS } from '../models/User.js'
import { escapeRegex, httpError, pick, startOfDay } from '../utils/http.js'
import { audit, walletChange } from '../utils/services.js'
import { runJob } from '../jobs/runner.js'
import { audienceIds, MAX_RECIPIENTS, sendDueCampaigns } from '../services/campaigns.js'
import { senders } from '../services/notify.js'

const router = Router()
router.use(protect, allow('admin'), noStore)
const superOnly = allow('superadmin')

const REVENUE_MATCH = { status: { $nin: ['cancelled', 'returned'] } }

// ───────────── Dashboard ─────────────

router.get('/stats', limits.expensive, async (req, res) => {
  const days = Math.min(90, Number(req.query.days) || 14)
  const today = startOfDay()
  const since = new Date(today.getTime() - (days - 1) * 86400000)
  const [todayAgg, byDay, byStatus, topProducts, byCategory, counts, lowStock, expiring] = await Promise.all([
    Order.aggregate([
      { $match: { ...REVENUE_MATCH, createdAt: { $gte: today } } },
      { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { ...REVENUE_MATCH, createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Order.aggregate([
      { $match: { ...REVENUE_MATCH, createdAt: { $gte: since } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.name', qty: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } } } },
      { $sort: { revenue: -1 } },
      { $limit: 8 },
    ]),
    Order.aggregate([
      { $match: { ...REVENUE_MATCH, createdAt: { $gte: since } } },
      { $unwind: '$items' },
      { $group: { _id: { $ifNull: ['$items.category', 'Other'] }, revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } } } },
      { $sort: { revenue: -1 } },
    ]),
    Promise.all([
      User.countDocuments({ role: 'customer' }),
      Subscription.countDocuments({ status: 'active' }),
      User.countDocuments({ role: 'delivery', 'delivery.kycStatus': 'pending' }),
      Ticket.countDocuments({ status: 'open' }),
      Order.countDocuments({ status: { $in: ['placed', 'confirmed', 'packed'] }, deliveryPartner: null }),
    ]),
    Product.find({ $expr: { $lte: [{ $min: '$variants.stock' }, '$lowStockThreshold'] } })
      .select('name slug variants lowStockThreshold')
      .limit(20),
    Product.find({ 'batches.expiryDate': { $lte: new Date(Date.now() + 3 * 86400000) } })
      .select('name slug batches')
      .limit(20),
  ])

  // Fill missing days so charts have a continuous axis.
  const map = Object.fromEntries(byDay.map((d) => [d._id, d]))
  const series = []
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 86400000)
    const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    series.push({ date: key, revenue: map[key]?.revenue || 0, orders: map[key]?.orders || 0 })
  }
  const [customers, activeSubscriptions, pendingKyc, openTickets, unassigned] = counts
  res.json({
    today: { revenue: todayAgg[0]?.revenue || 0, orders: todayAgg[0]?.orders || 0 },
    periodRevenue: series.reduce((s, d) => s + d.revenue, 0),
    periodOrders: series.reduce((s, d) => s + d.orders, 0),
    customers,
    activeSubscriptions,
    pendingKyc,
    openTickets,
    unassigned,
    series,
    byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.n])),
    topProducts: topProducts.map((p) => ({ name: p._id, qty: p.qty, revenue: p.revenue })),
    byCategory: byCategory.map((c) => ({ name: c._id, revenue: c.revenue })),
    lowStock,
    expiring: expiring.map((p) => ({
      _id: p._id,
      name: p.name,
      batches: p.batches.filter((b) => b.expiryDate <= new Date(Date.now() + 3 * 86400000)),
    })),
  })
})

// ───────────── Customers ─────────────

router.get('/customers', can('customers'), async (req, res) => {
  const filter = { role: 'customer' }
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q.trim().slice(0, 100)), 'i')
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }]
  }
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = 25
  const [items, total] = await Promise.all([
    User.find(filter).sort('-createdAt').skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ])
  const stats = await Order.aggregate([
    { $match: { user: { $in: items.map((u) => u._id) }, ...REVENUE_MATCH } },
    { $group: { _id: '$user', orders: { $sum: 1 }, spent: { $sum: '$total' } } },
  ])
  const byId = Object.fromEntries(stats.map((s) => [String(s._id), s]))
  res.json({
    items: items.map((u) => ({ ...u.toJSON(), orders: byId[u.id]?.orders || 0, spent: byId[u.id]?.spent || 0 })),
    total,
    page,
    pages: Math.ceil(total / limit),
  })
})

router.get('/customers/:id', can('customers'), async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, role: 'customer' })
  if (!user) throw httpError(404, 'Customer not found')
  const [orders, subscriptions, wallet] = await Promise.all([
    Order.find({ user: user._id }).sort('-createdAt').limit(20).select('orderNo total status createdAt'),
    Subscription.find({ user: user._id }).select('items productName variantLabel qty frequency status'),
    WalletTransaction.find({ user: user._id }).sort('-createdAt').limit(20),
  ])
  res.json({ user, orders, subscriptions, wallet })
})

router.patch('/users/:id/block', async (req, res) => {
  const { isBlocked } = z.object({ isBlocked: z.boolean() }).parse(req.body)
  const target = await User.findById(req.params.id)
  if (!target) throw httpError(404, 'User not found')
  const needed = target.role === 'delivery' ? 'delivery' : 'customers'
  if (req.user.role !== 'superadmin' && (!req.user.permissions.includes(needed) || ['admin', 'superadmin'].includes(target.role))) {
    throw httpError(403, 'You cannot block this user')
  }
  if (target.role === 'superadmin') throw httpError(400, 'The super admin cannot be blocked')
  target.isBlocked = isBlocked
  if (isBlocked) target.tokenVersion += 1
  await target.save()
  if (isBlocked) await revokeAllSessions(target._id)
  await audit(req, isBlocked ? 'user.block' : 'user.unblock', 'User', target._id, target.name)
  res.json(target)
})

router.post('/customers/:id/wallet', can('customers'), async (req, res) => {
  const { amount, reason } = z
    .object({ amount: z.number().int().refine((n) => n !== 0).refine((n) => Math.abs(n) <= 100000, 'Amount is too large'), reason: z.string().trim().min(3).max(200) })
    .parse(req.body)
  if (!(await User.exists({ _id: req.params.id, role: 'customer' }))) throw httpError(404, 'Customer not found')
  const balance = await walletChange(req.params.id, amount, `Admin adjustment: ${reason}`)
  await audit(req, 'wallet.adjust', 'User', req.params.id, `${amount > 0 ? '+' : ''}${amount} (${reason})`)
  res.json({ balance })
})

// ───────────── Delivery partners ─────────────

router.get('/delivery-partners', can('delivery'), async (req, res) => {
  const filter = { role: 'delivery' }
  if (['none', 'pending', 'approved', 'rejected'].includes(req.query.kyc)) filter['delivery.kycStatus'] = req.query.kyc
  const partners = await User.find(filter).sort('-createdAt').populate('delivery.zone', 'name')
  const stats = await Order.aggregate([
    { $match: { deliveryPartner: { $in: partners.map((p) => p._id) } } },
    {
      $group: {
        _id: '$deliveryPartner',
        delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
        active: { $sum: { $cond: [{ $in: ['$status', ['placed', 'confirmed', 'packed', 'out_for_delivery']] }, 1, 0] } },
      },
    },
  ])
  const byId = Object.fromEntries(stats.map((s) => [String(s._id), s]))
  res.json(partners.map((p) => ({ ...p.toJSON(), delivered: byId[p.id]?.delivered || 0, active: byId[p.id]?.active || 0 })))
})

router.patch('/delivery-partners/:id', can('delivery'), async (req, res) => {
  const body = z
    .object({ kycStatus: z.enum(['approved', 'rejected', 'pending']), kycNote: z.string().max(500), zone: z.string().max(24).nullable() })
    .partial()
    .parse(req.body)
  const partner = await User.findOne({ _id: req.params.id, role: 'delivery' })
  if (!partner) throw httpError(404, 'Delivery partner not found')
  Object.assign(partner.delivery, body)
  if (body.kycStatus && body.kycStatus !== 'approved') partner.delivery.isOnline = false
  await partner.save()
  await audit(req, 'delivery.update', 'User', partner._id, `${partner.name}: ${JSON.stringify(body)}`)
  res.json(partner)
})

// ───────────── Support tickets ─────────────

router.get('/tickets', can('tickets'), async (req, res) => {
  const filter = ['open', 'resolved'].includes(req.query.status) ? { status: req.query.status } : {}
  if (['general', 'order', 'missed_delivery', 'subscription', 'membership', 'billing'].includes(req.query.category)) filter.category = req.query.category
  // Priority-support members first ('high' sorts before 'normal'), then the most recently active.
  res.json(await Ticket.find(filter).sort('priority -updatedAt').limit(200).populate('user', 'name phone email role'))
})

router.get('/tickets/:id', can('tickets'), async (req, res) => {
  const t = await Ticket.findById(req.params.id).populate('user', 'name phone email role').populate('order', 'orderNo status total')
  if (!t) throw httpError(404, 'Ticket not found')
  res.json(t)
})

router.post('/tickets/:id/reply', can('tickets'), async (req, res) => {
  const { text, resolve } = z.object({ text: z.string().trim().min(1).max(4000), resolve: z.boolean().optional() }).parse(req.body)
  const t = await Ticket.findById(req.params.id)
  if (!t) throw httpError(404, 'Ticket not found')
  t.messages.push({ from: req.user._id, name: `${req.user.name} (Gavyora)`, role: req.user.role, text })
  if (resolve) t.status = 'resolved'
  await t.save()
  res.json(t)
})

router.patch('/tickets/:id', can('tickets'), async (req, res) => {
  const { status } = z.object({ status: z.enum(['open', 'resolved']) }).parse(req.body)
  res.json(await Ticket.findByIdAndUpdate(req.params.id, { status }, { returnDocument: 'after' }))
})

// ───────────── Reports ─────────────

router.get('/reports/sales', can('reports'), limits.expensive, async (req, res) => {
  const day = /^\d{4}-\d{2}-\d{2}$/
  const from = day.test(req.query.from || '') ? new Date(req.query.from + 'T00:00:00') : new Date(Date.now() - 30 * 86400000)
  const to = day.test(req.query.to || '') ? new Date(req.query.to + 'T23:59:59') : new Date()
  const match = { ...REVENUE_MATCH, createdAt: { $gte: from, $lte: to } }
  const [summary, byProduct, byArea, byPayment] = await Promise.all([
    Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          gross: { $sum: '$subtotal' },
          discount: { $sum: '$discount' },
          deliveryFees: { $sum: '$deliveryFee' },
          tax: { $sum: '$tax' },
          net: { $sum: '$total' },
        },
      },
    ]),
    Order.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id: { name: '$items.name', variant: '$items.variantLabel' },
          qty: { $sum: '$items.qty' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } },
        },
      },
      { $sort: { revenue: -1 } },
    ]),
    Order.aggregate([
      { $match: match },
      { $group: { _id: '$address.pincode', city: { $first: '$address.city' }, orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
      { $sort: { revenue: -1 } },
    ]),
    Order.aggregate([{ $match: match }, { $group: { _id: '$payment.method', orders: { $sum: 1 }, revenue: { $sum: '$total' } } }]),
  ])
  res.json({
    from,
    to,
    summary: summary[0] || { orders: 0, gross: 0, discount: 0, deliveryFees: 0, tax: 0, net: 0 },
    byProduct: byProduct.map((p) => ({ product: p._id.name, variant: p._id.variant, qty: p.qty, revenue: p.revenue })),
    byArea: byArea.map((a) => ({ pincode: a._id, city: a.city, orders: a.orders, revenue: a.revenue })),
    byPayment: byPayment.map((p) => ({ method: p._id, orders: p.orders, revenue: p.revenue })),
  })
})

// ───────────── Announcements (Notifications page) ─────────────

// Links open inside the app or on an https site (never javascript: or data:).
const SAFE_LINK = /^(\/(?!\/)[^\s]*|https:\/\/[^\s]+)$/
const audienceSchema = z.object({ audience: z.enum(CAMPAIGN_AUDIENCES), zone: z.string().regex(/^[a-f\d]{24}$/i).optional() })

router.get('/campaigns', can('notifications'), async (_req, res) => {
  const items = await Campaign.find().sort('-createdAt').limit(50).populate('zone', 'name')
  // Which external channels can really deliver; the rest are recorded as skipped.
  const providers = Object.fromEntries(CAMPAIGN_CHANNELS.map((c) => [c, !!senders[c]]))
  res.json({ items, providers, maxRecipients: MAX_RECIPIENTS })
})

router.get('/campaigns/audience', can('notifications'), limits.expensive, async (req, res) => {
  const q = audienceSchema.parse(req.query)
  res.json({ count: (await audienceIds(q)).length })
})

router.post('/campaigns', can('notifications'), limits.expensive, async (req, res) => {
  const body = audienceSchema
    .extend({
      title: z.string().trim().min(3).max(65),
      body: z.string().trim().min(3).max(500),
      link: z.string().trim().max(300).refine((v) => v === '' || SAFE_LINK.test(v), 'Use a site path like /deals or an https:// link').optional(),
      channels: z.array(z.enum(CAMPAIGN_CHANNELS)).max(3).default([]),
      scheduleAt: z.iso.datetime({ offset: true }).optional(),
    })
    .parse(req.body)
  const when = body.scheduleAt ? new Date(body.scheduleAt) : new Date()
  if (when < new Date(Date.now() - 60000)) throw httpError(400, 'Choose a time in the future')
  if (when > new Date(Date.now() + 90 * 86400000)) throw httpError(400, 'Schedule at most 90 days ahead')
  const count = (await audienceIds(body)).length
  if (!count) throw httpError(400, 'Nobody is in this audience yet')
  if (count > MAX_RECIPIENTS) throw httpError(400, `This audience has more than ${MAX_RECIPIENTS} people`)
  const campaign = await Campaign.create({
    ...body,
    link: body.link || undefined,
    zone: body.audience === 'zone' ? body.zone : undefined,
    scheduleAt: when,
    recipients: count,
    createdBy: { id: req.user._id, name: req.user.name },
  })
  await audit(req, 'campaign.create', 'Campaign', campaign._id, `${campaign.title} → ${campaign.audience} (${count})${body.scheduleAt ? ` at ${when.toISOString()}` : ''}`)
  // "Send now" starts in the background; the response does not wait for every message.
  if (!body.scheduleAt) runJob('campaigns.send', sendDueCampaigns).catch(() => {})
  res.status(201).json(campaign)
})

router.post('/campaigns/:id/cancel', can('notifications'), async (req, res) => {
  z.object({}).parse(req.body || {})
  const c = await Campaign.findOneAndUpdate({ _id: req.params.id, status: 'scheduled' }, { $set: { status: 'cancelled' } }, { returnDocument: 'after' })
  if (!c) throw httpError(409, 'Only campaigns that have not started can be cancelled')
  await audit(req, 'campaign.cancel', 'Campaign', c._id, c.title)
  res.json(c)
})

// ═════════════ Super admin only ═════════════

router.get('/permissions', superOnly, (_req, res) => res.json(PERMISSIONS))

router.get('/admins', superOnly, async (_req, res) => {
  res.json(await User.find({ role: { $in: ['admin', 'superadmin'] } }).sort('role name'))
})

const adminSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().max(254),
  phone: z.string().regex(/^[6-9]\d{9}$/).optional().or(z.literal('')),
  password: z.string().min(12, 'Admin passwords need at least 12 characters').max(72).optional(),
  permissions: z.array(z.enum(PERMISSIONS)),
  scopeZones: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(50).optional(),
})

router.post('/admins', superOnly, async (req, res) => {
  const body = adminSchema.required({ password: true }).parse(req.body)
  const user = await User.create({ ...body, phone: body.phone || undefined, role: 'admin' })
  await audit(req, 'admin.create', 'User', user._id, `${user.name} [${body.permissions.join(', ')}]`)
  res.status(201).json(user)
})

router.put('/admins/:id', superOnly, async (req, res) => {
  const body = adminSchema.partial().parse(req.body)
  const user = await User.findOne({ _id: req.params.id, role: 'admin' }).select('+password')
  if (!user) throw httpError(404, 'Admin not found')
  Object.assign(user, pick(body, ['name', 'email', 'permissions', 'scopeZones']))
  if (body.phone !== undefined) user.phone = body.phone || undefined
  if (body.password) {
    user.password = body.password
    user.tokenVersion += 1
  }
  await user.save()
  if (body.password) await revokeAllSessions(user._id)
  await audit(req, 'admin.update', 'User', user._id, `${user.name} [${user.permissions.join(', ')}]`)
  res.json(user)
})

router.delete('/admins/:id', superOnly, async (req, res) => {
  const user = await User.findOneAndDelete({ _id: req.params.id, role: 'admin' })
  if (!user) throw httpError(404, 'Admin not found')
  await revokeAllSessions(user._id)
  await audit(req, 'admin.delete', 'User', req.params.id, user.name)
  res.json({ message: 'Deleted' })
})

router.get('/settings', superOnly, async (_req, res) => res.json(await Setting.get()))

router.put('/settings', superOnly, async (req, res) => {
  const body = z
    .object({
      storeName: z.string().trim().min(1).max(80),
      supportPhone: z.string().max(30),
      supportEmail: z.email().max(254).or(z.literal('')),
      address: z.string().max(300),
      fssaiNo: z.string().max(30),
      gstNo: z.string().max(20),
      deliveryFee: z.number().min(0),
      freeDeliveryAbove: z.number().min(0),
      minOrderValue: z.number().min(0),
      taxPercent: z.number().min(0).max(28),
      codEnabled: z.boolean(),
      slots: z.array(z.string().trim().min(3).max(40)).min(1).max(12),
      deliveryPayoutPerOrder: z.number().min(0),
      referralBonus: z.number().min(0),
    })
    .partial()
    .parse(req.body)
  const settings = await Setting.get()
  settings.set(body)
  await settings.save()
  await audit(req, 'settings.update', 'Setting', settings._id, Object.keys(body).join(', '))
  res.json(settings)
})

const zoneSchema = z.object({
  name: z.string().trim().min(2).max(60),
  branch: z.string().trim().max(60).optional(),
  pincodes: z.array(z.string().regex(/^\d{6}$/, 'Pincodes must be 6 digits')).max(500),
  extraFee: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
})

router.get('/zones', async (_req, res) => {
  const zones = await Zone.find().sort('branch name').lean()
  const partners = await User.aggregate([
    { $match: { role: 'delivery', 'delivery.zone': { $ne: null } } },
    { $group: { _id: '$delivery.zone', n: { $sum: 1 } } },
  ])
  const byId = Object.fromEntries(partners.map((p) => [String(p._id), p.n]))
  res.json(zones.map((z) => ({ ...z, partners: byId[String(z._id)] || 0 })))
})
router.post('/zones', superOnly, async (req, res) => {
  const zone = await Zone.create(zoneSchema.parse(req.body))
  await audit(req, 'zone.create', 'Zone', zone._id, zone.name)
  res.status(201).json(zone)
})
router.put('/zones/:id', superOnly, async (req, res) => {
  const zone = await Zone.findByIdAndUpdate(req.params.id, zoneSchema.partial().parse(req.body), { returnDocument: 'after', runValidators: true })
  if (!zone) throw httpError(404, 'Zone not found')
  await audit(req, 'zone.update', 'Zone', zone._id, zone.name)
  res.json(zone)
})
router.delete('/zones/:id', superOnly, async (req, res) => {
  await Zone.findByIdAndDelete(req.params.id)
  await User.updateMany({ 'delivery.zone': req.params.id }, { $unset: { 'delivery.zone': 1 } })
  await audit(req, 'zone.delete', 'Zone', req.params.id)
  res.json({ message: 'Deleted' })
})

router.get('/financials', superOnly, limits.expensive, async (req, res) => {
  const months = Math.min(24, Number(req.query.months) || 6)
  const since = new Date()
  since.setMonth(since.getMonth() - (months - 1), 1)
  since.setHours(0, 0, 0, 0)
  const { deliveryPayoutPerOrder } = await Setting.get()
  const [monthly, wallet, partners] = await Promise.all([
    Order.aggregate([
      { $match: { status: 'delivered', deliveredAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$deliveredAt', timezone: 'Asia/Kolkata' } },
          orders: { $sum: 1 },
          revenue: { $sum: '$total' },
          discounts: { $sum: '$discount' },
          tax: { $sum: '$tax' },
          deliveryFees: { $sum: '$deliveryFee' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    User.aggregate([{ $match: { role: 'customer' } }, { $group: { _id: null, total: { $sum: '$wallet' } } }]),
    User.find({ role: 'delivery' }).select('name phone delivery.earnings delivery.paidOut delivery.bankAccountLast4 delivery.ifsc'),
  ])
  res.json({
    monthly: monthly.map((m) => ({
      month: m._id,
      orders: m.orders,
      revenue: m.revenue,
      discounts: m.discounts,
      tax: m.tax,
      deliveryFees: m.deliveryFees,
      deliveryCost: m.orders * deliveryPayoutPerOrder,
    })),
    walletLiability: wallet[0]?.total || 0,
    payouts: partners.map((p) => ({
      _id: p._id,
      name: p.name,
      phone: p.phone,
      bank: p.delivery.bankAccountLast4 ? `••${p.delivery.bankAccountLast4} / ${p.delivery.ifsc}` : '—',
      earned: p.delivery.earnings,
      paidOut: p.delivery.paidOut,
      pending: p.delivery.earnings - p.delivery.paidOut,
    })),
  })
})

router.post('/payouts/:id', superOnly, async (req, res) => {
  const { amount } = z.object({ amount: z.number().positive().max(1000000) }).parse(req.body)
  const partner = await User.findOne({ _id: req.params.id, role: 'delivery' })
  if (!partner) throw httpError(404, 'Delivery partner not found')
  const pending = partner.delivery.earnings - partner.delivery.paidOut
  if (amount > pending) throw httpError(400, `Only ₹${pending} is pending`)
  partner.delivery.paidOut += amount
  await partner.save()
  await audit(req, 'payout.record', 'User', partner._id, `₹${amount} to ${partner.name}`)
  res.json({ paidOut: partner.delivery.paidOut, pending: pending - amount })
})

router.get('/audit-logs', superOnly, async (req, res) => {
  const filter = {}
  if (req.query.q) {
    const rx = new RegExp(escapeRegex(req.query.q.trim().slice(0, 100)), 'i')
    filter.$or = [{ action: rx }, { actorName: rx }, { details: rx }]
  }
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = 50
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort('-createdAt').skip((page - 1) * limit).limit(limit),
    AuditLog.countDocuments(filter),
  ])
  res.json({ items, total, page, pages: Math.ceil(total / limit) })
})

router.get('/pages', superOnly, async (_req, res) => res.json(await Page.find().sort('title')))

router.put('/pages/:slug', superOnly, async (req, res) => {
  if (!/^[a-z0-9-]{2,40}$/.test(req.params.slug)) throw httpError(400, 'Invalid page')
  const body = z.object({ title: z.string().trim().min(2).max(120), content: z.string().max(50000) }).parse(req.body)
  const page = await Page.findOneAndUpdate({ slug: req.params.slug }, body, { returnDocument: 'after', upsert: true })
  await audit(req, 'cms.update', 'Page', page._id, page.slug)
  res.json(page)
})

router.get('/system', superOnly, async (_req, res) => {
  const mem = process.memoryUsage()
  res.json({
    uptimeSeconds: Math.round(process.uptime()),
    node: process.version,
    memoryMB: Math.round(mem.rss / 1024 / 1024),
    counts: {
      users: await User.estimatedDocumentCount(),
      products: await Product.estimatedDocumentCount(),
      orders: await Order.estimatedDocumentCount(),
      subscriptions: await Subscription.estimatedDocumentCount(),
    },
  })
})

export default router
