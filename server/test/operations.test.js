// Store operations: unpaid online orders, admin announcements and delivery photo proofs.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import http from 'node:http'
import { after, before, beforeEach, describe, it } from 'node:test'
import request from 'supertest'
import { login, resetLimits, setup, teardown } from './helpers.js'

let app
let M
let seq = 0

before(async () => {
  app = http.createServer(await setup())
  await new Promise((r) => app.listen(0, '127.0.0.1', r))
  const misc = await import('../src/models/misc.js')
  M = {
    ...misc,
    ...(await import('../src/models/billing.js')),
    User: (await import('../src/models/User.js')).default,
    Order: (await import('../src/models/Order.js')).default,
    Product: (await import('../src/models/Product.js')).default,
    orders: await import('../src/utils/orders.js'),
    campaigns: await import('../src/services/campaigns.js'),
    gateway: (await import('../src/utils/razorpay.js')).gateway,
  }
  M.gateway.createOrder = async (amount) => ({ id: `order_ops_${++seq}`, amount, currency: 'INR' })
})
after(async () => {
  await new Promise((r) => app.close(r))
  await teardown()
})
beforeEach(resetLimits)

const sign = (body) => crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex')
const webhook = (event) =>
  request(app)
    .post('/api/payments/webhook')
    .set('Content-Type', 'application/json')
    .set('X-Razorpay-Signature', sign(JSON.stringify(event)))
    .set('X-Razorpay-Event-Id', crypto.randomUUID())
    .send(JSON.stringify(event))
const binary = (req) =>
  req.buffer(true).parse((res, cb) => {
    const chunks = []
    res.on('data', (c) => chunks.push(c))
    res.on('end', () => cb(null, Buffer.concat(chunks)))
  })
const tomorrow = () => {
  const d = new Date(Date.now() + 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('unpaid online orders', () => {
  it('are cancelled after the checkout window, return their stock, and a late payment is refunded to the wallet', async () => {
    const c = await login(app, 'customer')
    const me = await M.User.findOne({ email: 'customer@gavyora.com' })
    const product = await M.Product.findOne({ slug: 'paneer' })
    const variant = product.variants[1]
    const stockBefore = variant.stock
    const { slots } = (await c.get('/api/settings')).body
    const res = await c.post('/api/orders').send({
      items: [{ product: String(product._id), variantId: String(variant._id), qty: 2 }],
      addressId: String(me.addresses[0]._id),
      slot: { date: tomorrow(), label: slots[0] },
      paymentMethod: 'online',
    })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    const id = res.body.order._id
    const stockOf = async () => (await M.Product.findById(product._id)).variants.id(variant._id).stock
    assert.equal(await stockOf(), stockBefore - 2, 'stock is reserved while the customer pays')

    // Still inside the window: nothing happens.
    assert.equal((await M.orders.expireUnpaidOnlineOrders()).cancelled, 0)
    // Two hours later the customer still has not paid.
    await M.Order.collection.updateOne({ _id: new (await import('mongoose')).default.Types.ObjectId(id) }, { $set: { createdAt: new Date(Date.now() - 2 * 3600000) } })
    const [a, b] = await Promise.all([M.orders.expireUnpaidOnlineOrders(), M.orders.expireUnpaidOnlineOrders()])
    assert.equal(a.cancelled + b.cancelled, 1, 'two overlapping runs cancel it once')
    assert.equal(await stockOf(), stockBefore, 'stock returned exactly once')
    const cancelled = await M.Order.findById(id)
    assert.equal(cancelled.status, 'cancelled')

    // The payment arrives anyway (signed webhook): the money goes back to the wallet, once.
    const walletBefore = (await M.User.findById(me._id)).wallet
    const event = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_late_1', order_id: cancelled.payment.razorpayOrderId, amount: Math.round(cancelled.total * 100), currency: 'INR' } } } }
    assert.equal((await webhook(event)).status, 200)
    assert.equal((await webhook(event)).status, 200)
    const after = await M.Order.findById(id)
    assert.equal(after.payment.status, 'refunded')
    assert.equal(after.status, 'cancelled', 'a late payment does not revive the order')
    assert.equal(Math.round((await M.User.findById(me._id)).wallet * 100), Math.round((walletBefore + cancelled.total) * 100))
  })
})

describe('announcements', () => {
  it('reach the chosen audience in-app, once, and record skipped channels honestly', async () => {
    const owner = await login(app, 'owner')
    const central = await M.Zone.findOne({ name: /central/i })
    const count = await owner.get(`/api/admin/campaigns/audience?audience=zone&zone=${central._id}`)
    assert.equal(count.status, 200)
    assert.ok(count.body.count >= 1)

    const bad = await owner.post('/api/admin/campaigns').send({ audience: 'zone', zone: String(central._id), title: 'Hello', body: 'Fresh paneer today', link: 'javascript:alert(1)' })
    assert.equal(bad.status, 400, 'unsafe links are rejected')

    const at = new Date(Date.now() + 60000).toISOString()
    const res = await owner.post('/api/admin/campaigns').send({ audience: 'zone', zone: String(central._id), title: 'Paneer is back', body: 'Fresh paneer today', link: '/c/paneer-tofu', channels: ['sms'], scheduleAt: at })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    assert.equal(res.body.status, 'scheduled')
    assert.equal((await M.campaigns.sendDueCampaigns()).campaigns, 0, 'not before its time')

    const later = new Date(Date.now() + 120000)
    await Promise.all([M.campaigns.sendDueCampaigns(later), M.campaigns.sendDueCampaigns(later)])
    const sent = await M.Campaign.findById(res.body._id)
    assert.equal(sent.status, 'sent')
    const priya = await M.User.findOne({ email: 'customer@gavyora.com' })
    const mine = await M.Notification.find({ user: priya._id, key: `campaign:${sent._id}:${priya._id}` })
    assert.equal(mine.length, 1, 'each person gets it once even when runs overlap')
    assert.equal(mine[0].title, 'Paneer is back')
    assert.equal(mine[0].link, '/c/paneer-tofu')
    assert.equal(mine[0].channels.find((c) => c.channel === 'sms').status, 'skipped', 'no SMS provider: recorded as skipped, not sent')
    assert.ok(!mine[0].channels.some((c) => c.channel === 'email'), 'only the chosen channels are attempted')
    assert.equal(sent.results.in_app.delivered, sent.recipients)

    const c = await login(app, 'customer')
    assert.ok((await c.get('/api/billing/notifications')).body.items.some((n) => n.title === 'Paneer is back'))
  })

  it('can be cancelled before sending; admins need the notifications permission', async () => {
    const owner = await login(app, 'owner')
    const res = await owner.post('/api/admin/campaigns').send({ audience: 'all', title: 'Weekend offer', body: 'Ten percent off ghee', scheduleAt: new Date(Date.now() + 3600000).toISOString() })
    assert.equal(res.status, 201)
    assert.equal((await owner.post(`/api/admin/campaigns/${res.body._id}/cancel`).send({})).status, 200)
    assert.equal((await owner.post(`/api/admin/campaigns/${res.body._id}/cancel`).send({})).status, 409)
    await M.campaigns.sendDueCampaigns(new Date(Date.now() + 7200000))
    assert.equal(await M.Notification.countDocuments({ key: { $regex: `^campaign:${res.body._id}:` } }), 0, 'a cancelled campaign never sends')

    await M.User.create({ name: 'Orders Only', email: 'ordersonly@example.com', password: 'Customer@123', role: 'admin', permissions: ['orders'] })
    const limited = await login(app, 'ordersonly@example.com')
    assert.equal((await limited.get('/api/admin/campaigns')).status, 403)
    assert.equal((await limited.post('/api/admin/campaigns').send({ audience: 'all', title: 'Hi there', body: 'Hello all' })).status, 403)
    const customer = await login(app, 'customer')
    assert.equal((await customer.get('/api/admin/campaigns')).status, 403)
  })
})

describe('delivery photo proof', () => {
  it('the assigned rider uploads a real photo; only the customer, the rider and admins can see it', async () => {
    const rider = await M.User.findOne({ email: 'rider@gavyora.com' })
    // The seed's order states vary by day, so put one of the rider's orders on the road.
    const order = await M.Order.findOne({ deliveryPartner: rider._id, status: { $nin: ['cancelled', 'returned'] } })
    await M.Order.updateOne({ _id: order._id }, { status: 'out_for_delivery' })
    const owner = await M.User.findById(order.user)
    // A ~250 kB JPEG: bigger than the normal 200 kB body limit, so this also checks the proof route's own limit.
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(250 * 1024), Buffer.from([0xff, 0xd9])])
    const r = await login(app, 'rider')

    const svg = `data:image/jpeg;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')}`
    assert.equal((await r.post(`/api/delivery/orders/${order._id}/proof`).send({ image: svg })).status, 400, 'content is checked, not the claimed type')
    const tooBig = `data:image/jpeg;base64,${Buffer.concat([jpeg, crypto.randomBytes(200 * 1024)]).toString('base64')}`
    assert.ok([400, 413].includes((await r.post(`/api/delivery/orders/${order._id}/proof`).send({ image: tooBig })).status))

    const up = await r.post(`/api/delivery/orders/${order._id}/proof`).send({ image: `data:image/jpeg;base64,${jpeg.toString('base64')}` })
    assert.equal(up.status, 201, JSON.stringify(up.body))
    assert.ok((await M.Order.findById(order._id)).proofAt)

    const customer = await login(app, owner.email)
    const mine = await binary(customer.get(`/api/orders/mine/${order._id}/proof`))
    assert.equal(mine.status, 200)
    assert.equal(mine.headers['content-type'], 'image/jpeg')
    assert.equal(mine.headers['x-content-type-options'], 'nosniff')
    assert.ok(Buffer.compare(mine.body, jpeg) === 0, 'the same bytes come back')

    const stranger = await login(app, owner.email === 'amit@example.com' ? 'neha@example.com' : 'amit@example.com')
    assert.equal((await stranger.get(`/api/orders/mine/${order._id}/proof`)).status, 404)
    assert.equal((await stranger.get(`/api/orders/${order._id}/proof`)).status, 403)
    const admin = await login(app, 'admin')
    assert.equal((await binary(admin.get(`/api/orders/${order._id}/proof`))).status, 200)

    // Another rider's order is off limits.
    const elsewhere = await M.Order.findOne({ deliveryPartner: { $ne: rider._id }, status: { $ne: 'cancelled' } })
    if (elsewhere) assert.equal((await r.post(`/api/delivery/orders/${elsewhere._id}/proof`).send({ image: `data:image/jpeg;base64,${jpeg.toString('base64')}` })).status, 404)
  })

  it('other routes keep the small body limit', async () => {
    const c = await login(app, 'customer')
    const res = await c.patch('/api/account/profile').send({ name: 'x'.repeat(300 * 1024) })
    assert.equal(res.status, 413)
  })
})
