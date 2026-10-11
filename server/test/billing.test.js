// Memberships, plan-based subscriptions, payments, refunds, renewals and delivery generation.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import http from 'node:http'
import { after, before, beforeEach, describe, it } from 'node:test'
import request from 'supertest'
import { client, login, ORIGIN, resetLimits, setup, teardown } from './helpers.js'

let app
let M // models and services, loaded after setup (env must be set first)
let orderSeq = 0

before(async () => {
  // One long-lived server for the whole file: supertest's per-request servers can be reused just after closing.
  app = http.createServer(await setup())
  await new Promise((r) => app.listen(0, '127.0.0.1', r))
  const billing = await import('../src/models/billing.js')
  M = {
    ...billing,
    User: (await import('../src/models/User.js')).default,
    Order: (await import('../src/models/Order.js')).default,
    Subscription: (await import('../src/models/Subscription.js')).default,
    Setting: (await import('../src/models/misc.js')).Setting,
    jobs: await import('../src/jobs/billing.js'),
    gen: await import('../src/jobs/subscriptions.js'),
    notify: await import('../src/services/notify.js'),
    gateway: (await import('../src/utils/razorpay.js')).gateway,
  }
  // No network in tests: the gateway returns a deterministic order for exactly the requested amount.
  M.gateway.createOrder = async (amount) => ({ id: `order_test_${++orderSeq}`, amount, currency: 'INR' })
  M.gateway.refund = async (paymentId, amount) => ({ id: `rfnd_test_${paymentId}`, amount, status: 'pending' })
})
after(async () => {
  await new Promise((r) => app.close(r))
  await teardown()
})
beforeEach(resetLimits)

const key = () => crypto.randomUUID()
const sign = (body) => crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex')
const checkoutSig = (orderId, paymentId) => crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex')
const setWallet = (email, wallet) => M.User.updateOne({ email }, { wallet })
const walletOf = async (email) => (await M.User.findOne({ email })).wallet
const webhook = (event, id = key()) =>
  request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', sign(JSON.stringify(event))).set('X-Razorpay-Event-Id', id).send(JSON.stringify(event))

describe('plan management', () => {
  const version = { name: 'Test Gold', priceMinor: 19900, interval: 'month', durationDays: 30, taxPercent: 18, benefits: { discountPercent: 10, freeDelivery: true } }

  it('only the super admin can create and publish plans; drafts are hidden from customers', async () => {
    const owner = await login(app, 'owner')
    const admin = await login(app, 'admin')
    const customer = await login(app, 'customer')
    assert.equal((await admin.post('/api/admin/billing/plans').send({ kind: 'membership', version })).status, 403)
    assert.equal((await customer.get('/api/admin/billing/plans')).status, 403)

    const created = await owner.post('/api/admin/billing/plans').send({ kind: 'membership', version })
    assert.equal(created.status, 201)
    const { plan } = created.body
    assert.equal((await request(app).get(`/api/plans/${plan.slug}`)).status, 404, 'draft plans are not on sale')

    assert.equal((await owner.post(`/api/admin/billing/plans/${plan._id}/publish`).send({})).status, 200)
    const pub = await request(app).get(`/api/plans/${plan.slug}`)
    assert.equal(pub.status, 200)
    assert.equal(pub.body.version.priceMinor, 19900)
  })

  it('editing a published plan creates a new draft version; the published terms do not change', async () => {
    const owner = await login(app, 'owner')
    const plan = await M.Plan.findOne({ slug: 'test-gold' })
    const edit = await owner.put(`/api/admin/billing/plans/${plan._id}`).send({ version: { priceMinor: 29900 } })
    assert.equal(edit.status, 200)
    assert.equal(edit.body.version.version, 2)
    assert.equal(edit.body.version.status, 'draft')
    assert.equal((await request(app).get('/api/plans/test-gold')).body.version.priceMinor, 19900, 'customers still see v1')
    await owner.post(`/api/admin/billing/plans/${plan._id}/publish`).send({})
    assert.equal((await request(app).get('/api/plans/test-gold')).body.version.priceMinor, 29900)
    const v1 = await M.PlanVersion.findOne({ plan: plan._id, version: 1 })
    assert.equal(v1.status, 'superseded')
    assert.equal(v1.priceMinor, 19900)
    await owner.post(`/api/admin/billing/plans/${plan._id}/status`).send({ status: 'archived' })
  })
})

describe('membership checkout (wallet)', () => {
  it('prices on the server, requires accepted terms, activates once and issues an invoice', async () => {
    const c = await login(app, 'customer')
    await setWallet('customer@gavyora.com', 500)
    const quote = await c.post('/api/plans/gavyora-plus-monthly/quote').send({})
    assert.equal(quote.status, 200)
    assert.equal(quote.body.quote.totalMinor, 9900 + 1782) // fee + 18% GST

    const noTerms = await c.post('/api/plans/gavyora-plus-monthly/checkout').send({ idempotencyKey: key(), paymentMethod: 'wallet' })
    assert.equal(noTerms.status, 400)

    const idem = key()
    // A tampered amount in the request body is ignored: the server charges its own quote.
    const body = { idempotencyKey: idem, paymentMethod: 'wallet', acceptTerms: true, amountMinor: 1, priceMinor: 1 }
    const first = await c.post('/api/plans/gavyora-plus-monthly/checkout').send(body)
    assert.equal(first.status, 201, JSON.stringify(first.body))
    assert.equal(first.body.transaction.status, 'paid')
    assert.equal(first.body.transaction.amountMinor, 11682)
    assert.equal(await walletOf('customer@gavyora.com'), 500 - 116.82)

    const replay = await c.post('/api/plans/gavyora-plus-monthly/checkout').send(body)
    assert.equal(replay.body.transaction._id, first.body.transaction._id, 'same idempotency key → same payment')
    assert.equal(await walletOf('customer@gavyora.com'), 500 - 116.82, 'wallet charged only once')

    const mine = await c.get('/api/billing/membership')
    assert.equal(mine.body.current.status, 'active')
    assert.ok(new Date(mine.body.current.currentPeriodEnd) > new Date(Date.now() + 29 * 86400000))
    const invoices = await c.get('/api/billing/invoices')
    assert.equal(invoices.body.length, 1)
    assert.match(invoices.body[0].number, /^GV\/\d{2}-\d{2}\/\d{6}$/)

    const second = await c.post('/api/plans/gavyora-plus-yearly/checkout').send({ idempotencyKey: key(), paymentMethod: 'wallet', acceptTerms: true })
    assert.equal(second.status, 409, 'one membership at a time')
  })

  it('applies member discount and free delivery to store orders', async () => {
    const c = await login(app, 'customer')
    const paneer = await (await import('../src/models/Product.js')).default.findOne({ slug: 'paneer' })
    const q = await c.post('/api/orders/quote').send({ items: [{ product: String(paneer._id), variantId: String(paneer.variants[1]._id), qty: 2 }], pincode: '411001' })
    assert.equal(q.status, 200)
    assert.equal(q.body.subtotal, 160)
    assert.equal(q.body.memberDiscount, 8) // 5% of ₹160
    assert.equal(q.body.deliveryFee, 0)
    assert.equal(q.body.membership.plan, 'Gavyora Plus Monthly')
  })

  it('quotes the renewal on the server, including a scheduled plan change, and charges exactly that', async () => {
    const c = await login(app, 'customer')
    const { current } = (await c.get('/api/billing/membership')).body
    const same = await c.get(`/api/billing/membership/${current._id}/renewal-quote`)
    assert.equal(same.status, 200)
    assert.equal(same.body.quote.totalMinor, 11682)
    assert.equal(same.body.onlinePayments, true)

    assert.equal((await c.post(`/api/billing/membership/${current._id}/change-plan`).send({ slug: 'gavyora-plus-yearly' })).status, 200)
    const switched = (await c.get(`/api/billing/membership/${current._id}/renewal-quote`)).body.quote
    assert.equal(switched.planName, 'Gavyora Plus Yearly')
    assert.equal(switched.totalMinor, 99900 + 17982) // the new plan's fee + 18% GST, not the old price
    // Start (but don't pay) an online renewal: the pending charge is exactly the quoted amount.
    const renew = await c.post(`/api/billing/membership/${current._id}/renew`).send({ paymentMethod: 'razorpay', idempotencyKey: key() })
    assert.equal(renew.status, 201, JSON.stringify(renew.body))
    assert.equal(renew.body.transaction.amountMinor, switched.totalMinor)
    assert.equal(renew.body.razorpay.amount, switched.totalMinor)

    await c.post(`/api/billing/membership/${current._id}/change-plan`).send({ slug: 'gavyora-plus-monthly' }) // back to the agreed plan
    assert.equal((await c.get(`/api/billing/membership/${current._id}/renewal-quote`)).body.quote.totalMinor, 11682)
    const other = await login(app, 'neha@example.com')
    assert.equal((await other.get(`/api/billing/membership/${current._id}/renewal-quote`)).status, 404, "cannot read another customer's quote")
  })

  it('cancels at the end of the term by default, and can be undone', async () => {
    const c = await login(app, 'customer')
    const { current } = (await c.get('/api/billing/membership')).body
    const cancel = await c.post(`/api/billing/membership/${current._id}/cancel`).send({ reason: 'Trying it out' })
    assert.equal(cancel.status, 200)
    assert.equal(cancel.body.membership.status, 'cancellation_pending')
    const undo = await c.post(`/api/billing/membership/${current._id}/undo-cancel`).send({})
    assert.equal(undo.body.status, 'active')
  })

  it("customers cannot touch another customer's membership", async () => {
    const owner = (await M.Membership.findOne({ status: 'active' })).user
    const other = await login(app, 'other')
    assert.notEqual(String(owner), String(other.user._id))
    const m = await M.Membership.findOne({ user: owner })
    assert.equal((await other.post(`/api/billing/membership/${m._id}/cancel`).send({ reason: 'not mine' })).status, 404)
    assert.equal((await other.get(`/api/billing/membership/${m._id}/events`)).status, 404)
  })
})

describe('membership checkout (Razorpay)', () => {
  it('stays pending until the payment is verified; a bad signature never activates', async () => {
    const c = await login(app, 'other')
    const res = await c.post('/api/plans/gavyora-plus-monthly/checkout').send({ idempotencyKey: key(), paymentMethod: 'razorpay', acceptTerms: true })
    assert.equal(res.status, 201)
    assert.equal(res.body.transaction.status, 'created')
    assert.equal(res.body.razorpay.amount, 11682)
    assert.equal((await M.Membership.findById(res.body.membership)).status, 'pending_payment')

    const bad = await c.post(`/api/billing/transactions/${res.body.transaction._id}/verify`).send({ razorpay_order_id: res.body.razorpay.orderId, razorpay_payment_id: 'pay_x', razorpay_signature: 'forged' })
    assert.equal(bad.status, 400)
    assert.equal((await M.Membership.findById(res.body.membership)).status, 'pending_payment')

    // The real payment then arrives by signed webhook (also covers a delayed webhook after a failed browser check).
    const event = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_rzp_1', order_id: res.body.razorpay.orderId, amount: 11682, currency: 'INR' } } } }
    const eventId = key()
    assert.equal((await webhook(event, eventId)).status, 200)
    assert.equal((await M.Membership.findById(res.body.membership)).status, 'active')
    const dup = await webhook(event, eventId)
    assert.equal(dup.body.duplicate, true)
    assert.equal(await M.Invoice.countDocuments({ transaction: res.body.transaction._id }), 1, 'one invoice despite repeated webhooks')
  })

  it('verifies a correct checkout signature and ignores webhooks with the wrong amount', async () => {
    const c = await login(app, 'neha@example.com')
    const res = await c.post('/api/plans/gavyora-plus-yearly/checkout').send({ idempotencyKey: key(), paymentMethod: 'razorpay', acceptTerms: true })
    const orderId = res.body.razorpay.orderId
    const wrong = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_cheap', order_id: orderId, amount: 100, currency: 'INR' } } } }
    await webhook(wrong)
    assert.equal((await M.Membership.findById(res.body.membership)).status, 'pending_payment')
    const ok = await c.post(`/api/billing/transactions/${res.body.transaction._id}/verify`).send({ razorpay_order_id: orderId, razorpay_payment_id: 'pay_good', razorpay_signature: checkoutSig(orderId, 'pay_good') })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.status, 'paid')
    assert.equal(ok.body.fulfilment, 'done')
    assert.equal((await M.Membership.findById(res.body.membership)).status, 'active')
  })

  it('immediate cancellation on a pro-rata plan refunds unused days to the wallet', async () => {
    const c = await login(app, 'neha@example.com')
    const before = await walletOf('neha@example.com')
    const { current } = (await c.get('/api/billing/membership')).body
    const res = await c.post(`/api/billing/membership/${current._id}/cancel`).send({ reason: 'Moving out of the city' })
    assert.equal(res.status, 200)
    assert.equal(res.body.membership.status, 'cancelled')
    assert.equal(res.body.refund.status, 'succeeded')
    assert.ok(res.body.refund.amountMinor > 117000 && res.body.refund.amountMinor <= 117882)
    assert.equal(Math.round((await walletOf('neha@example.com')) * 100), Math.round(before * 100) + res.body.refund.amountMinor)
  })
})

describe('renewals and expiry', () => {
  it('auto-renews from the wallet, falls into a grace period when it cannot, then expires', async () => {
    const m = await M.Membership.findOne({ status: 'active', 'terms.name': 'Gavyora Plus Monthly' }).populate('user')
    const email = m.user.email
    const past = new Date(Date.now() - 60000)
    await M.Membership.updateOne({ _id: m._id }, { autoRenew: true, currentPeriodEnd: past, currentPeriodStart: new Date(Date.now() - 30 * 86400000) })
    await setWallet(email, 1000)
    const r1 = await M.jobs.runMembershipCycle()
    assert.equal(r1.renewed, 1)
    let fresh = await M.Membership.findById(m._id)
    assert.equal(fresh.status, 'active')
    assert.ok(fresh.currentPeriodEnd > new Date(Date.now() + 29 * 86400000))
    assert.equal(Math.round((await walletOf(email)) * 100), 100000 - 11682)
    assert.equal((await M.jobs.runMembershipCycle()).renewed, 0, 'rerunning the job does not renew twice')

    await M.Membership.updateOne({ _id: m._id }, { currentPeriodEnd: new Date(Date.now() - 60000) })
    await setWallet(email, 0)
    await M.jobs.runMembershipCycle()
    fresh = await M.Membership.findById(m._id)
    assert.equal(fresh.status, 'past_due')
    assert.ok(fresh.graceUntil > new Date())

    await M.Membership.updateOne({ _id: m._id }, { graceUntil: new Date(Date.now() - 1000) })
    await M.jobs.runMembershipCycle()
    assert.equal((await M.Membership.findById(m._id)).status, 'expired')
  })

  it('abandoned checkouts expire and free the customer to try again', async () => {
    const c = await login(app, 'rahul@example.com')
    const res = await c.post('/api/plans/gavyora-plus-monthly/checkout').send({ idempotencyKey: key(), paymentMethod: 'razorpay', acceptTerms: true })
    // createdAt is immutable through Mongoose, so age the checkout directly in the collection.
    await M.PaymentTransaction.collection.updateOne({ _id: new (await import('mongoose')).default.Types.ObjectId(res.body.transaction._id) }, { $set: { createdAt: new Date(Date.now() - 3 * 3600000) } })
    await M.jobs.expireAbandonedCheckouts()
    assert.equal((await M.PaymentTransaction.findById(res.body.transaction._id)).status, 'expired')
    assert.equal((await M.Membership.findById(res.body.membership)).status, 'failed')
  })
})

describe('prepaid product subscriptions', () => {
  let subId
  let c

  it('charges for the prepay window, credits the balance and draws one delivery per day exactly once', async () => {
    c = await login(app, 'sneha@example.com')
    await setWallet('sneha@example.com', 5000)
    const plan = (await request(app).get('/api/plans/daily-milk-prepaid')).body
    assert.ok(plan.checkout?.earliestStart && plan.checkout.slots.length > 0, 'plan details carry the checkout calendar')
    assert.equal(plan.checkout.onlinePayments, true)
    const product = plan.catalog.find((p) => p.name === 'Fresh Milk')
    const variant = product.variants.find((v) => v.label === '500 ml')
    const user = await M.User.findOne({ email: 'sneha@example.com' })
    const input = { items: [{ product: product._id, variantId: variant._id, qty: 1 }], frequency: 'daily', addressId: String(user.addresses[0]._id) }
    const q = await c.post('/api/plans/daily-milk-prepaid/quote').send({ ...input, startDate: '2000-01-01' })
    assert.equal(q.status, 400, 'start dates before the cut-off are rejected')
    const quote = await c.post('/api/plans/daily-milk-prepaid/quote').send({ ...input, startDate: (await c.post('/api/plans/daily-milk-prepaid/quote').send({ ...input, startDate: '2099-01-01' })).body.earliestStart })
    assert.equal(quote.status, 200, JSON.stringify(quote.body))
    assert.equal(quote.body.quote.perDeliveryMinor, 3040) // ₹32 less 5% plan discount
    assert.equal(quote.body.quote.deliveries, 30)
    assert.equal(quote.body.quote.totalMinor, 3040 * 30)

    const res = await c.post('/api/plans/daily-milk-prepaid/checkout').send({ ...input, startDate: quote.body.earliestStart, idempotencyKey: key(), paymentMethod: 'wallet', acceptTerms: true })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    subId = res.body.subscription
    const sub = await M.Subscription.findById(subId)
    assert.equal(sub.status, 'active')
    assert.equal(sub.prepaidBalanceMinor, 91200)
    assert.equal(sub.items[0].price, 30.4)

    const date = sub.startDate
    // Other seeded subscriptions are due that day too, so count only this subscription's deliveries.
    await Promise.all([M.gen.generateSubscriptionOrders(date), M.gen.generateSubscriptionOrders(date)])
    assert.equal(await M.Order.countDocuments({ subscription: subId, 'slot.date': date }), 1, 'two overlapping runs create one delivery')
    await M.gen.generateSubscriptionOrders(date)
    const orders = await M.Order.find({ subscription: subId, 'slot.date': date })
    assert.equal(orders.length, 1)
    assert.equal(orders[0].payment.method, 'prepaid')
    const rider = await M.User.findOne({ email: 'rider@gavyora.com' })
    assert.equal(String(orders[0].deliveryPartner), String(rider._id), 'auto-assigned to the approved partner of the zone')
    assert.equal(orders[0].payment.status, 'paid')
    assert.equal(orders[0].total, 30.4)
    assert.equal((await M.Subscription.findById(subId)).prepaidBalanceMinor, 91200 - 3040)
  })

  it('enforces the plan pause policy', async () => {
    const sub = await M.Subscription.findById(subId)
    const view = (await c.get(`/api/subscriptions/${subId}`)).body
    const from = view.editableFrom
    const tooLong = await c.post(`/api/subscriptions/${subId}/vacation`).send({ from, to: addDays(from, 60) })
    assert.equal(tooLong.status, 400) // max 45 days on this plan
    const early = await c.post(`/api/subscriptions/${subId}/vacation`).send({ from: sub.startDate < from ? sub.startDate : addDays(from, -1), to: from })
    assert.equal(early.status, 400)
    const ok = await c.post(`/api/subscriptions/${subId}/vacation`).send({ from, to: addDays(from, 2) })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.pausedDates.length, 3)
  })

  it('a missed delivery refunded by an admin goes back to the subscription balance', async () => {
    const order = await M.Order.findOne({ subscription: subId })
    const rider = await M.User.findOne({ email: 'rider@gavyora.com' })
    await M.Order.updateOne({ _id: order._id }, { deliveryPartner: rider._id })
    const r = await login(app, 'rider')
    assert.equal((await r.patch(`/api/delivery/orders/${order._id}/status`).send({ status: 'out_for_delivery' })).status, 200)
    assert.equal((await r.patch(`/api/delivery/orders/${order._id}/status`).send({ status: 'undelivered' })).status, 400, 'needs a reason')
    assert.equal((await r.patch(`/api/delivery/orders/${order._id}/status`).send({ status: 'undelivered', note: 'Customer not home' })).status, 200)
    const before = (await M.Subscription.findById(subId)).prepaidBalanceMinor
    const a = await login(app, 'admin')
    const res = await a.post(`/api/admin/billing/missed-deliveries/${order._id}/resolve`).send({ action: 'refund', note: 'Missed by rider' })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal((await M.Subscription.findById(subId)).prepaidBalanceMinor, before + 3040)
  })

  it('cancelling refunds the unused balance to the wallet and cannot be resumed', async () => {
    const balance = (await M.Subscription.findById(subId)).prepaidBalanceMinor
    const before = await walletOf('sneha@example.com')
    const res = await c.post(`/api/subscriptions/${subId}/cancel`).send({ reason: 'Going on a long trip' })
    assert.equal(res.status, 200)
    assert.equal(res.body.refund.amountMinor, balance)
    assert.equal(Math.round((await walletOf('sneha@example.com')) * 100), Math.round(before * 100) + balance)
    const resume = await c.patch(`/api/subscriptions/${subId}`).send({ status: 'active' })
    assert.equal(resume.status, 400)
    assert.equal((await M.Subscription.findById(subId)).status, 'cancelled')
  })

  it('a prepaid subscription with no balance is marked past due instead of delivering', async () => {
    const sub = await M.Subscription.findOne({ billingMode: 'prepaid', status: 'cancelled' })
    const clone = await M.Subscription.create({ ...sub.toObject(), _id: undefined, code: undefined, status: 'active', prepaidBalanceMinor: 0, lastGeneratedFor: undefined, endDate: undefined, autoRenew: false, pausedDates: [], dayOverrides: [] })
    const r = await M.gen.generateSubscriptionOrders(clone.startDate)
    assert.ok(r.failed.some((f) => String(f.subscription) === String(clone._id)))
    assert.equal((await M.Subscription.findById(clone._id)).status, 'past_due')
    assert.equal(await M.Order.countDocuments({ subscription: clone._id }), 0)
  })
})

describe('delivery engine', () => {
  it('skips a delivery when a product is out of stock, warns the customer once, charges nothing and recovers on restock', async () => {
    const Product = (await import('../src/models/Product.js')).default
    const user = await M.User.findOne({ email: 'customer@gavyora.com' })
    const sub = await M.Subscription.findOne({ user: user._id, status: 'active', productName: 'Fresh Milk' })
    const date = '2099-06-01'
    const product = await Product.findById(sub.items[0].product)
    const variant = product.variants.id(sub.items[0].variantId)
    const stock = variant.stock
    const wallet = await walletOf('customer@gavyora.com')
    await Product.updateOne({ _id: product._id, 'variants._id': variant._id }, { 'variants.$.stock': 0 })
    try {
      for (let i = 0; i < 2; i++) {
        const r = await M.gen.generateSubscriptionOrders(date) // the job retries every run until midnight
        assert.ok(r.failed.some((f) => String(f.subscription) === String(sub._id)))
      }
      assert.equal(await M.Order.countDocuments({ subscription: sub._id, 'slot.date': date }), 0)
      assert.equal(await M.Notification.countDocuments({ user: user._id, key: `at-risk:${sub._id}:${date}` }), 1, 'one warning, not one per run')
      assert.equal(await M.SubscriptionEvent.countDocuments({ entity: sub._id, type: 'delivery_failed', 'data.date': date }), 1)
      assert.equal(await walletOf('customer@gavyora.com'), wallet, 'nothing charged for a skipped day')
    } finally {
      await Product.updateOne({ _id: product._id, 'variants._id': variant._id }, { 'variants.$.stock': stock })
    }
    await M.gen.generateSubscriptionOrders(date)
    assert.equal(await M.Order.countDocuments({ subscription: sub._id, 'slot.date': date }), 1, 'delivered once stock is back')
  })

  it('a missing-order credit is applied once even if the admin clicks twice', async () => {
    const order = await M.Order.findOne({ status: 'delivered', source: 'store', 'payment.method': { $ne: 'prepaid' }, 'missedResolution.action': { $exists: false } })
    const email = (await M.User.findById(order.user)).email
    const before = await walletOf(email)
    const a = await login(app, 'admin')
    const send = () => a.post(`/api/admin/billing/missed-deliveries/${order._id}/resolve`).send({ action: 'credit', amount: 10, note: 'Customer reports bag missing' })
    const results = (await Promise.all([send(), send()])).map((r) => r.status).sort()
    assert.deepEqual(results, [200, 409])
    assert.equal(Math.round((await walletOf(email)) * 100), Math.round((before + 10) * 100))
    assert.equal((await M.Order.findById(order._id)).missedResolution.amount, 10, 'records the amount actually credited')
  })
})

describe('refund approvals and overrides', () => {
  it('admins refund within their limit; larger refunds wait for the super admin', async () => {
    const owner = await login(app, 'owner')
    await owner.put('/api/admin/billing/settings').send({ refundApprovalLimitMinor: 1000 })
    await M.User.updateOne({ email: 'admin@gavyora.com' }, { $addToSet: { permissions: 'refunds' } })
    const admin = await login(app, 'admin')
    const tx = await M.PaymentTransaction.findOne({ purpose: 'membership', status: 'paid', provider: 'razorpay' })
    const small = await admin.post('/api/admin/billing/refunds').send({ transaction: String(tx._id), amountMinor: 500, reason: 'Goodwill credit' })
    assert.equal(small.status, 201)
    assert.equal(small.body.status, 'succeeded')

    const big = await admin.post('/api/admin/billing/refunds').send({ transaction: String(tx._id), amountMinor: 5000, reason: 'Service issue' })
    assert.equal(big.body.status, 'requested')
    assert.equal((await admin.post(`/api/admin/billing/refunds/${big.body._id}/decide`).send({ approve: true, note: 'approving myself' })).status, 403)
    const approved = await owner.post(`/api/admin/billing/refunds/${big.body._id}/decide`).send({ approve: true, note: 'Checked the complaint' })
    assert.equal(approved.status, 200)
    assert.equal(approved.body.status, 'succeeded')

    const tooMuch = await owner.post('/api/admin/billing/refunds').send({ transaction: String(tx._id), amountMinor: tx.amountMinor, reason: 'Everything' })
    assert.equal(tooMuch.status, 400, 'cannot refund more than was paid')
  })

  it('gateway refunds stay processing until the gateway confirms', async () => {
    const owner = await login(app, 'owner')
    const tx = await M.PaymentTransaction.findOne({ purpose: 'membership', provider: 'razorpay', providerPaymentId: 'pay_rzp_1' })
    const r = await owner.post('/api/admin/billing/refunds').send({ transaction: String(tx._id), amountMinor: 1000, reason: 'Duplicate charge', destination: 'source' })
    assert.equal(r.body.status, 'processing')
    await webhook({ event: 'refund.processed', payload: { refund: { entity: { id: r.body.providerRefundId, amount: 1000 } } } })
    assert.equal((await M.Refund.findById(r.body._id)).status, 'succeeded')
  })

  it('manual overrides by an admin need super admin approval', async () => {
    const admin = await login(app, 'admin')
    const owner = await login(app, 'owner')
    const m = await M.Membership.findOne({ status: 'active' })
    const req1 = await admin.post(`/api/admin/billing/memberships/${m._id}/action`).send({ action: 'extend', days: 5, reason: 'Delivery outage compensation' })
    assert.equal(req1.status, 200)
    assert.equal(req1.body.applied, false)
    assert.equal(String((await M.Membership.findById(m._id)).currentPeriodEnd), String(m.currentPeriodEnd), 'not applied yet')
    const decided = await owner.post(`/api/admin/billing/requests/${req1.body.request._id}/decide`).send({ approve: true, note: 'OK' })
    assert.equal(decided.status, 200)
    const after = await M.Membership.findById(m._id)
    assert.equal(Math.round((after.currentPeriodEnd - m.currentPeriodEnd) / 86400000), 5)
    assert.equal((await admin.post(`/api/admin/billing/memberships/${m._id}/action`).send({ action: 'suspend' })).status, 400, 'a reason is required')
  })

  it('admins without the memberships permission are refused', async () => {
    const owner = await login(app, 'owner')
    await owner.post('/api/admin/admins').send({ name: 'Orders Only', email: 'ordersonly@example.com', password: 'Orders-Only-Pass-1', permissions: ['orders'] })
    const d = client(app)
    await d.post('/api/auth/login').send({ identifier: 'ordersonly@example.com', password: 'Orders-Only-Pass-1' })
    for (const url of ['/api/admin/billing/overview', '/api/admin/billing/memberships', '/api/admin/billing/plans', '/api/admin/billing/reports', '/api/admin/billing/settings']) {
      assert.equal((await d.get(url)).status, 403, url)
    }
    assert.equal((await request(app).get('/api/admin/billing/overview').set('Origin', ORIGIN)).status, 401)
  })
})

describe('notifications and reports', () => {
  it('a failing SMS provider is recorded as failed and never breaks the flow', async () => {
    M.notify.senders.sms = async () => {
      throw new Error('SMS gateway down')
    }
    const user = await M.User.findOne({ email: 'customer@gavyora.com' })
    const n = await M.notify.notify(user._id, 'delivery_completed', { orderNo: 'TEST1' }, { key: key() })
    M.notify.senders.sms = null
    assert.ok(n)
    assert.equal(n.channels.find((c) => c.channel === 'in_app').status, 'delivered')
    assert.equal(n.channels.find((c) => c.channel === 'sms').status, 'failed')
    assert.equal(n.channels.find((c) => c.channel === 'email').status, 'skipped')
  })

  it('retries failed sends up to 3 attempts and stops once delivered', async () => {
    const user = await M.User.findOne({ email: 'customer@gavyora.com' })
    const sms = () => M.Notification.findById(n._id).then((x) => x.channels.find((c) => c.channel === 'sms'))
    M.notify.senders.sms = async () => ({ ok: false, detail: 'Provider timeout' })
    const n = await M.notify.notify(user._id, 'delivery_completed', { orderNo: 'TEST2' }, { key: key() })
    try {
      assert.equal((await sms()).attempts, 1)
      await M.notify.retryFailedNotifications()
      assert.deepEqual([(await sms()).status, (await sms()).attempts], ['failed', 2])
      M.notify.senders.sms = async () => ({ ok: true })
      await M.notify.retryFailedNotifications()
      assert.deepEqual([(await sms()).status, (await sms()).attempts], ['delivered', 3])
      await M.notify.retryFailedNotifications()
      assert.equal((await sms()).attempts, 3, 'delivered channels are not sent again')
    } finally {
      M.notify.senders.sms = null
    }
  })

  it('gives up after the third failed attempt', async () => {
    const user = await M.User.findOne({ email: 'customer@gavyora.com' })
    M.notify.senders.sms = async () => ({ ok: false })
    try {
      const n = await M.notify.notify(user._id, 'delivery_completed', { orderNo: 'TEST3' }, { key: key() })
      for (let i = 0; i < 4; i++) await M.notify.retryFailedNotifications()
      const sms = (await M.Notification.findById(n._id)).channels.find((c) => c.channel === 'sms')
      assert.deepEqual([sms.status, sms.attempts], ['failed', M.notify.MAX_SEND_ATTEMPTS])
    } finally {
      M.notify.senders.sms = null
    }
  })

  it('reports count only verified payments, minus completed refunds', async () => {
    const owner = await login(app, 'owner')
    const res = await owner.get('/api/admin/billing/reports')
    assert.equal(res.status, 200)
    const paid = await M.PaymentTransaction.aggregate([
      { $match: { purpose: { $in: ['membership', 'membership_renewal'] }, status: { $in: ['paid', 'refunded', 'partially_refunded'] } } },
      { $group: { _id: null, n: { $sum: '$amountMinor' } } },
    ])
    assert.equal(res.body.revenue.membershipGrossMinor, paid[0].n)
    const pending = await M.PaymentTransaction.find({ status: 'created' })
    for (const p of pending) assert.ok(p.amountMinor >= 0) // pending payments exist but are excluded above
    const refunded = await M.Refund.aggregate([
      { $match: { status: 'succeeded', transaction: { $ne: null } } },
      { $lookup: { from: 'paymenttransactions', localField: 'transaction', foreignField: '_id', as: 'tx' } },
      { $match: { 'tx.purpose': { $in: ['membership', 'membership_renewal'] } } },
      { $group: { _id: null, n: { $sum: '$amountMinor' } } },
    ])
    assert.equal(res.body.revenue.membershipNetMinor, paid[0].n - (refunded[0]?.n || 0))
    assert.ok(res.body.definitions.revenue)
  })
})

function addDays(key, n) {
  const d = new Date(key + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
