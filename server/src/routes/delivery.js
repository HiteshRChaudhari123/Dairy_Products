// Delivery partner panel API.
import { Router } from 'express'
import { z } from 'zod'
import { allow, protect } from '../middleware/auth.js'
import { limits } from '../middleware/rateLimit.js'
import { noStore } from '../middleware/security.js'
import { Setting } from '../models/misc.js'
import Order from '../models/Order.js'
import { dateKey, httpError, pick, startOfDay } from '../utils/http.js'
import { changeStatus } from '../utils/orders.js'
import { saveProof, sendProof } from '../services/proofs.js'

const router = Router()
router.use(protect, allow('delivery'), noStore)

const approved = (req) => {
  if (req.user.delivery?.kycStatus !== 'approved') {
    throw httpError(403, 'Your KYC is not approved yet')
  }
}

// Customer-facing fields only. The delivery OTP is never sent to the partner.
const SAFE = '-deliveryOtp -payment.razorpayOrderId -payment.razorpayPaymentId'

router.get('/summary', async (req, res) => {
  const me = req.user._id
  const today = dateKey(new Date())
  const [active, deliveredToday, codToday] = await Promise.all([
    Order.countDocuments({ deliveryPartner: me, status: { $in: ['confirmed', 'packed', 'out_for_delivery', 'placed'] } }),
    Order.countDocuments({ deliveryPartner: me, status: 'delivered', deliveredAt: { $gte: startOfDay() } }),
    Order.aggregate([
      { $match: { deliveryPartner: me, status: 'delivered', 'payment.method': 'cod', deliveredAt: { $gte: startOfDay() } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
  ])
  res.json({
    today,
    active,
    deliveredToday,
    codToday: codToday[0]?.total || 0,
    isOnline: req.user.delivery.isOnline,
    kycStatus: req.user.delivery.kycStatus,
    earnings: req.user.delivery.earnings,
    rating: req.user.delivery.rating,
  })
})

router.patch('/online', async (req, res) => {
  approved(req)
  const { isOnline } = z.object({ isOnline: z.boolean() }).parse(req.body)
  req.user.delivery.isOnline = isOnline
  await req.user.save()
  res.json({ isOnline })
})

router.patch('/profile', async (req, res) => {
  const body = z
    .object({
      vehicle: z.string().trim().min(2).max(60),
      licenseNo: z.string().trim().min(4).max(30),
      aadhaarLast4: z.string().regex(/^\d{4}$/),
      bankAccountLast4: z.string().regex(/^\d{4}$/),
      ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/i),
    })
    .partial()
    .parse(req.body)
  Object.assign(req.user.delivery, body)
  // Changing KYC details sends the profile back for approval.
  if (Object.keys(body).length && req.user.delivery.kycStatus !== 'approved') req.user.delivery.kycStatus = 'pending'
  await req.user.save()
  res.json({ user: req.user })
})

router.get('/orders', async (req, res) => {
  approved(req)
  const scope = req.query.scope || 'active'
  const filter = { deliveryPartner: req.user._id }
  if (scope === 'active') filter.status = { $in: ['placed', 'confirmed', 'packed', 'out_for_delivery'] }
  else if (scope === 'today') filter['slot.date'] = dateKey(new Date())
  else filter.status = { $in: ['delivered', 'cancelled', 'returned'] }
  const orders = await Order.find(filter)
    .select(SAFE)
    .sort(scope === 'history' ? '-updatedAt' : 'slot.date address.pincode')
    .limit(200)
  res.json(orders)
})

router.get('/orders/:id', async (req, res) => {
  approved(req)
  const order = await Order.findOne({ _id: req.params.id, deliveryPartner: req.user._id }).select(SAFE)
  if (!order) throw httpError(404, 'Order not found')
  res.json(order)
})

router.patch('/orders/:id/status', limits.sensitive, async (req, res) => {
  approved(req)
  const { status, otp, note } = z
    .object({ status: z.enum(['out_for_delivery', 'delivered', 'undelivered']), otp: z.string().max(4).optional(), note: z.string().max(300).optional() })
    .parse(req.body)
  const order = await Order.findOne({ _id: req.params.id, deliveryPartner: req.user._id })
  if (!order) throw httpError(404, 'Order not found')

  if (status === 'out_for_delivery') {
    // Partner picks up: auto-advance through confirmed/packed if the store skipped them.
    if (['placed', 'confirmed'].includes(order.status)) {
      for (const s of order.status === 'placed' ? ['confirmed', 'packed'] : ['packed']) {
        await changeStatus(order, s, { by: 'system', note: 'Picked up by delivery partner' })
      }
    }
    await changeStatus(order, 'out_for_delivery', { by: req.user.name, note: note || 'Picked up' })
  } else if (status === 'undelivered') {
    if (!note?.trim()) throw httpError(400, 'Say why the order could not be delivered (e.g. customer not home)')
    await changeStatus(order, 'undelivered', { by: req.user.name, note: note.trim() })
  } else {
    if (order.deliveryOtp !== otp) throw httpError(400, 'Wrong delivery OTP. Ask the customer for the 4-digit code.')
    await changeStatus(order, 'delivered', { by: req.user.name, note: note || 'Delivered with OTP' })
  }
  res.json(pick(order.toObject(), ['_id', 'status', 'timeline', 'payment', 'codCollected', 'failureReason']))
})

// Photo proof for an assigned order (a doorstep photo for a missed delivery works too).
router.post('/orders/:id/proof', limits.sensitive, async (req, res) => {
  approved(req)
  const { image } = z.object({ image: z.string().max(600_000) }).parse(req.body)
  const order = await Order.findOne({ _id: req.params.id, deliveryPartner: req.user._id })
  if (!order) throw httpError(404, 'Order not found')
  if (!['out_for_delivery', 'delivered', 'undelivered'].includes(order.status)) throw httpError(400, 'Add a photo once the order is out for delivery')
  await saveProof(order, req.user, image)
  res.status(201).json({ ok: true })
})

router.get('/orders/:id/proof', async (req, res) => {
  approved(req)
  if (!(await Order.exists({ _id: req.params.id, deliveryPartner: req.user._id }))) throw httpError(404, 'Order not found')
  await sendProof(res, req.params.id)
})

router.get('/earnings', async (req, res) => {
  const { deliveryPayoutPerOrder } = await Setting.get()
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const daily = await Order.aggregate([
    { $match: { deliveryPartner: req.user._id, status: 'delivered', deliveredAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$deliveredAt', timezone: 'Asia/Kolkata' } },
        deliveries: { $sum: 1 },
        cod: { $sum: { $cond: [{ $eq: ['$payment.method', 'cod'] }, '$total', 0] } },
      },
    },
    { $sort: { _id: -1 } },
  ])
  res.json({
    perOrder: deliveryPayoutPerOrder,
    total: req.user.delivery.earnings,
    paidOut: req.user.delivery.paidOut,
    pending: req.user.delivery.earnings - req.user.delivery.paidOut,
    daily: daily.map((d) => ({ date: d._id, deliveries: d.deliveries, earned: d.deliveries * deliveryPayoutPerOrder, cod: d.cod })),
  })
})

export default router
