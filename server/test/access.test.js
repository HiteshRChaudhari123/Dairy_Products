import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import request from 'supertest'
import { client, login, resetLimits, setup, teardown } from './helpers.js'

let app
let Order
let Subscription
let User
before(async () => {
  app = await setup()
  ;({ default: Order } = await import('../src/models/Order.js'))
  ;({ default: Subscription } = await import('../src/models/Subscription.js'))
  ;({ default: User } = await import('../src/models/User.js'))
})
after(teardown)
beforeEach(resetLimits)

describe('role enforcement', () => {
  const adminRoutes = ['/api/admin/stats', '/api/admin/customers', '/api/orders', '/api/subscriptions/admin/sheet', '/api/products/admin/list', '/api/reviews']
  const ownerRoutes = ['/api/admin/settings', '/api/admin/admins', '/api/admin/financials', '/api/admin/audit-logs', '/api/security/audit']

  it('anonymous users get 401 on every protected route', async () => {
    for (const url of [...adminRoutes, ...ownerRoutes, '/api/account/wallet', '/api/orders/mine', '/api/delivery/summary']) {
      const res = await request(app).get(url)
      assert.equal(res.status, 401, url)
    }
  })

  it('customers get 403 on admin, owner and delivery routes', async () => {
    const c = await login(app, 'customer')
    for (const url of [...adminRoutes, ...ownerRoutes, '/api/delivery/summary']) {
      assert.equal((await c.get(url)).status, 403, url)
    }
    const write = await c.post('/api/products').send({ name: 'Hack', category: 'x', variants: [{ label: '1', price: 1, mrp: 1, stock: 1 }] })
    assert.equal(write.status, 403)
    const role = await c.patch('/api/account/profile').send({ role: 'superadmin', name: 'Priya Sharma' })
    assert.equal(role.status, 200)
    assert.equal(role.body.user.role, 'customer', 'role must not be settable through the profile')
  })

  it('delivery partners cannot reach admin routes', async () => {
    const r = await login(app, 'rider')
    for (const url of adminRoutes) assert.equal((await r.get(url)).status, 403, url)
  })

  it('admins cannot reach owner-only routes', async () => {
    const a = await login(app, 'admin')
    assert.equal((await a.get('/api/admin/stats')).status, 200)
    for (const url of ownerRoutes) assert.equal((await a.get(url)).status, 403, url)
  })

  it('admins only get the permissions granted to them', async () => {
    const owner = await login(app, 'owner')
    const created = await owner.post('/api/admin/admins').send({ name: 'Order Desk', email: 'desk@example.com', password: 'Order-Desk-Pass-1', permissions: ['orders'] })
    assert.equal(created.status, 201)
    const d = client(app)
    assert.equal((await d.post('/api/auth/login').send({ identifier: 'desk@example.com', password: 'Order-Desk-Pass-1' })).status, 200)
    assert.equal((await d.get('/api/orders')).status, 200)
    assert.equal((await d.get('/api/admin/reports/sales')).status, 403)
    assert.equal((await d.get('/api/admin/customers')).status, 403)
    assert.equal((await d.post('/api/coupons').send({ code: 'FREE100', type: 'percent', value: 100 })).status, 403)
  })

  it('super admin passwords for new admins must be strong', async () => {
    const owner = await login(app, 'owner')
    const weak = await owner.post('/api/admin/admins').send({ name: 'Weak', email: 'weak-admin@example.com', password: 'short123', permissions: [] })
    assert.equal(weak.status, 400)
  })
})

describe('cross-user access', () => {
  let priya
  let amit
  let amitOrder
  let amitSub
  before(async () => {
    const amitUser = await User.findOne({ email: 'amit@example.com' })
    amitOrder = await Order.findOne({ user: amitUser._id })
    amitSub = await Subscription.findOne({ user: amitUser._id })
    assert.ok(amitOrder && amitSub, 'seed data has an order and subscription for Amit')
  })
  beforeEach(async () => {
    priya = await login(app, 'customer')
    amit = await login(app, 'other')
  })

  it("a customer cannot read, cancel or return another customer's order", async () => {
    assert.equal((await priya.get(`/api/orders/mine/${amitOrder._id}`)).status, 404)
    assert.equal((await priya.post(`/api/orders/${amitOrder._id}/cancel`).send({})).status, 404)
    assert.equal((await priya.post(`/api/orders/${amitOrder._id}/return`).send({ reason: 'not mine' })).status, 404)
    assert.equal((await amit.get(`/api/orders/mine/${amitOrder._id}`)).status, 200)
  })

  it("a customer cannot read or change another customer's subscription", async () => {
    assert.equal((await priya.get(`/api/subscriptions/${amitSub._id}`)).status, 404)
    assert.equal((await priya.patch(`/api/subscriptions/${amitSub._id}`).send({ status: 'paused' })).status, 404)
    assert.equal((await priya.post(`/api/subscriptions/${amitSub._id}/cancel`).send({ reason: 'not mine' })).status, 404)
    assert.equal((await priya.get(`/api/subscriptions/${amitSub._id}/billing`)).status, 404)
    const still = await Subscription.findById(amitSub._id)
    assert.equal(still.status, 'active')
  })

  it("a customer cannot delete another customer's address or link their order to a ticket", async () => {
    const before = await User.findOne({ email: 'amit@example.com' })
    const addrId = before.addresses[0]._id
    await priya.delete(`/api/account/addresses/${addrId}`)
    const afterUser = await User.findOne({ email: 'amit@example.com' })
    assert.ok(afterUser.addresses.id(addrId), 'address must survive')
    const ticket = await priya.post('/api/account/tickets').send({ subject: 'Help', message: 'About this order', order: String(amitOrder._id) })
    assert.equal(ticket.status, 400)
  })

  it("a customer cannot read another customer's ticket", async () => {
    const t = await amit.post('/api/account/tickets').send({ subject: 'Private issue', message: 'Only for me' })
    assert.equal(t.status, 201)
    assert.equal((await priya.get(`/api/account/tickets/${t.body._id}`)).status, 404)
    assert.equal((await priya.post(`/api/account/tickets/${t.body._id}/reply`).send({ text: 'hi' })).status, 404)
  })

  it('a delivery partner only sees orders assigned to them, without the delivery OTP', async () => {
    const r = await login(app, 'rider')
    const mine = await r.get('/api/delivery/orders?scope=active')
    assert.equal(mine.status, 200)
    for (const o of mine.body) assert.equal(o.deliveryOtp, undefined)
    const notMine = await Order.findOne({ deliveryPartner: null })
    if (notMine) assert.equal((await r.get(`/api/delivery/orders/${notMine._id}`)).status, 404)
  })
})

describe('account state', () => {
  it('blocking a user ends their sessions immediately', async () => {
    const victim = await login(app, 'other')
    const a = await login(app, 'admin')
    const blocked = await a.patch(`/api/admin/users/${victim.user._id}/block`).send({ isBlocked: true })
    assert.equal(blocked.status, 200)
    assert.equal((await victim.get('/api/auth/me')).status, 401)
    await a.patch(`/api/admin/users/${victim.user._id}/block`).send({ isBlocked: false })
  })

  it('admins cannot block the super admin', async () => {
    const owner = await User.findOne({ role: 'superadmin' })
    const a = await login(app, 'admin')
    const res = await a.patch(`/api/admin/users/${owner._id}/block`).send({ isBlocked: true })
    assert.equal(res.status, 403)
  })

  it('wallet adjustments only apply to customer accounts', async () => {
    const rider = await User.findOne({ email: 'rider@gavyora.com' })
    const a = await login(app, 'admin')
    const res = await a.post(`/api/admin/customers/${rider._id}/wallet`).send({ amount: 1000, reason: 'test credit' })
    assert.equal(res.status, 404)
  })
})
