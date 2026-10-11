import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { after, before, beforeEach, describe, it } from 'node:test'
import request from 'supertest'
import { client, EVIL, login, ORIGIN, resetLimits, setup, teardown } from './helpers.js'

let app
before(async () => {
  app = await setup()
})
after(teardown)
beforeEach(resetLimits)

describe('security headers', () => {
  it('sends helmet headers and hides the framework', async () => {
    const res = await request(app).get('/api/health')
    assert.equal(res.status, 200)
    assert.match(res.headers['content-security-policy'], /default-src 'none'/)
    assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/)
    assert.equal(res.headers['x-content-type-options'], 'nosniff')
    assert.ok(res.headers['x-frame-options'])
    assert.equal(res.headers['referrer-policy'], 'no-referrer')
    assert.equal(res.headers['x-powered-by'], undefined)
    assert.ok(res.headers['x-request-id'])
  })

  it('marks personal responses as not cacheable', async () => {
    const c = await login(app, 'customer')
    const res = await c.get('/api/auth/me')
    assert.equal(res.headers['cache-control'], 'no-store')
  })
})

describe('CORS', () => {
  it('does not allow unknown origins', async () => {
    const res = await request(app).options('/api/auth/login').set('Origin', EVIL).set('Access-Control-Request-Method', 'POST')
    assert.equal(res.headers['access-control-allow-origin'], undefined)
  })

  it('allows the configured origin with credentials', async () => {
    const res = await request(app).options('/api/auth/login').set('Origin', ORIGIN).set('Access-Control-Request-Method', 'POST')
    assert.equal(res.headers['access-control-allow-origin'], ORIGIN)
    assert.equal(res.headers['access-control-allow-credentials'], 'true')
  })
})

describe('CSRF origin check', () => {
  it('rejects cookie-authenticated writes from another site or without an origin', async () => {
    const c = await login(app, 'customer')
    const body = { label: 'Home', name: 'Priya', phone: '9876543210', line1: 'Flat 1', city: 'Pune', state: 'MH', pincode: '411001' }
    const evil = await c.agent.post('/api/account/addresses').set('Origin', EVIL).send(body)
    assert.equal(evil.status, 403)
    const none = await c.agent.post('/api/account/addresses').send(body)
    assert.equal(none.status, 403)
    const ours = await c.post('/api/account/addresses').send(body)
    assert.equal(ours.status, 201)
  })
})

describe('input handling', () => {
  it('rejects malformed JSON without leaking parser details', async () => {
    const res = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"identifier": ')
    assert.equal(res.status, 400)
    assert.equal(res.body.message, 'Malformed JSON in request body')
    assert.doesNotMatch(JSON.stringify(res.body), /Unexpected|SyntaxError|at /)
  })

  it('rejects Mongo operators and prototype-pollution keys in bodies', async () => {
    const op = await request(app).post('/api/auth/login').send({ identifier: { $gt: '' }, password: { $ne: null } })
    assert.equal(op.status, 400)
    const proto = await request(app).post('/api/auth/forgot-password').set('Content-Type', 'application/json').send('{"email":"a@b.co","__proto__":{"isAdmin":true}}')
    assert.equal(proto.status, 400)
    const dotted = await request(app).post('/api/auth/forgot-password').send({ email: 'a@b.co', 'profile.role': 'admin' })
    assert.equal(dotted.status, 400)
  })

  it('ignores operator syntax in query strings', async () => {
    const res = await request(app).get('/api/products?q[$regex]=.*&category[$ne]=x&limit=2')
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body.items))
  })

  it('validates request bodies with schemas', async () => {
    const res = await client(app).post('/api/auth/register').send({ name: 'X', email: 'not-an-email', password: 'Long-Enough-123' })
    assert.equal(res.status, 400)
    assert.match(res.body.message, /^(name|email)/)
  })

  it('rejects oversized bodies', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: 'x'.repeat(300_000), password: 'x' })
    assert.equal(res.status, 413)
  })

  it('rejects javascript: and data: URLs in admin-managed links', async () => {
    const a = await login(app, 'admin')
    for (const link of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', '//evil.example/x']) {
      const res = await a.post('/api/banners').send({ title: 'Bad banner', link })
      assert.equal(res.status, 400, link)
    }
    const ok = await a.post('/api/banners').send({ title: 'Good banner', link: '/c/ghee', image: 'https://images.pexels.com/photos/1/a.jpeg' })
    assert.equal(ok.status, 201)
  })
})

describe('safe errors', () => {
  it('unknown routes return a generic 404', async () => {
    const res = await request(app).get('/api/does-not-exist')
    assert.equal(res.status, 404)
    assert.deepEqual(res.body, { message: 'Not found' })
  })

  it('unexpected errors are masked and logged with a request id', async () => {
    const { errorHandler } = await import('../src/middleware/error.js')
    const out = {}
    const res = { status(c) { out.code = c; return this }, json(b) { out.body = b } }
    const prev = console.error
    let logged = ''
    console.error = (line) => (logged += line)
    try {
      errorHandler(Object.assign(new Error('E11000 users.password_hash secret=abc123'), { stack: 'Error\n at db.js:1' }), { id: 'req-1', method: 'GET', path: '/x' }, res, () => {})
    } finally {
      console.error = prev
    }
    assert.equal(out.code, 500)
    assert.deepEqual(out.body, { message: 'Something went wrong', requestId: 'req-1' })
    assert.match(logged, /req-1/)
    assert.doesNotMatch(logged, /abc123/, 'secrets are redacted from logs')
  })
})

describe('sensitive data in responses', () => {
  it('never returns password hashes, token versions or reset tokens', async () => {
    const c = await login(app, 'customer')
    const me = await c.get('/api/auth/me')
    for (const k of ['password', 'tokenVersion', 'resetToken', 'otp', 'failedLogins', 'lockUntil']) assert.equal(k in me.body.user, false, k)
    const a = await login(app, 'admin')
    const list = await a.get('/api/admin/customers')
    for (const u of list.body.items) assert.equal('password' in u, false)
  })

  it('public settings expose only store information', async () => {
    const res = await request(app).get('/api/settings')
    assert.equal(res.status, 200)
    for (const k of ['deliveryPayoutPerOrder', 'referralBonus', '_id', 'key']) assert.equal(k in res.body, false, k)
  })
})

describe('payments webhook', () => {
  const sign = (body) => crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex')

  it('rejects unsigned or badly signed webhooks', async () => {
    const body = JSON.stringify({ event: 'payment.captured' })
    const res = await request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', 'bad').send(body)
    assert.equal(res.status, 400)
  })

  it('ignores a validly signed webhook whose amount does not match the order', async () => {
    const { default: Order } = await import('../src/models/Order.js')
    const order = await Order.findOne({ 'payment.status': 'pending' })
    order.payment.method = 'online'
    order.payment.razorpayOrderId = 'order_test_1'
    await order.save()
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_1', order_id: 'order_test_1', amount: 100, currency: 'INR' } } },
    })
    const res = await request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').set('X-Razorpay-Signature', sign(body)).send(body)
    assert.equal(res.status, 200)
    const fresh = await Order.findById(order._id)
    assert.equal(fresh.payment.status, 'pending')
  })
})

describe('security audit', () => {
  it('runs end to end and reports no failed checks for this configuration', async () => {
    const { runAudit } = await import('../src/security/audit.js')
    const { MOUNTS } = await import('../src/app.js')
    const report = await runAudit({ app, mounts: MOUNTS, db: true })
    const statuses = new Set(['PASS', 'WARNING', 'FAIL', 'NOT CHECKED'])
    for (const c of report.checks) {
      assert.ok(statuses.has(c.status), c.id)
      assert.ok(c.evidence.length > 0, `${c.id} has evidence`)
    }
    const failed = report.checks.filter((c) => c.status === 'FAIL')
    assert.deepEqual(failed.map((c) => `${c.id}: ${c.evidence.join(' | ')}`), [])
  })

  it('is only available to the super admin', async () => {
    const a = await login(app, 'admin')
    assert.equal((await a.post('/api/security/audit')).status, 403)
    const o = await login(app, 'owner')
    const res = await o.post('/api/security/audit')
    assert.equal(res.status, 200)
    assert.ok(res.body.report.summary.total > 10)
  })
})
