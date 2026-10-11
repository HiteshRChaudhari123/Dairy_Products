import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import jwt from 'jsonwebtoken'
import request from 'supertest'
import { client, cookieValue, login, ORIGIN, resetLimits, setup, teardown, USERS } from './helpers.js'

let app
let User
let Session
let OtpCode
before(async () => {
  app = await setup()
  ;({ default: User } = await import('../src/models/User.js'))
  ;({ Session, OtpCode } = await import('../src/models/auth.js'))
})
after(teardown)
beforeEach(resetLimits)

const LOGIN_FAILED = 'Wrong email/phone or password'

describe('login', () => {
  it('succeeds with correct credentials and sets HttpOnly SameSite cookies', async () => {
    const c = await login(app, 'customer')
    const at = c.cookies.find((x) => x.startsWith('gv_at='))
    const rt = c.cookies.find((x) => x.startsWith('gv_rt='))
    assert.match(at, /HttpOnly/i)
    assert.match(at, /SameSite=Lax/i)
    assert.match(rt, /HttpOnly/i)
    assert.match(rt, /Path=\/api\/auth/)
    const me = await c.get('/api/auth/me')
    assert.equal(me.status, 200)
    assert.equal(me.body.user.email, 'customer@gavyora.com')
  })

  it('never returns tokens in the body to the website, only to the mobile app', async () => {
    const [identifier, password] = USERS.customer
    const web = await client(app).post('/api/auth/login').send({ identifier, password })
    assert.equal(web.status, 200)
    assert.equal(web.body.accessToken, undefined)
    assert.equal(web.body.refreshToken, undefined)
    const mobile = await request(app).post('/api/auth/login').set('X-Client-Type', 'mobile').send({ identifier, password })
    assert.equal(mobile.status, 200)
    assert.ok(mobile.body.accessToken)
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${mobile.body.accessToken}`)
    assert.equal(me.status, 200)
  })

  it('gives the same generic error for a wrong password and an unknown account', async () => {
    const wrong = await client(app).post('/api/auth/login').send({ identifier: 'customer@gavyora.com', password: 'nope-nope' })
    const unknown = await client(app).post('/api/auth/login').send({ identifier: 'ghost@example.com', password: 'nope-nope' })
    assert.equal(wrong.status, 401)
    assert.equal(unknown.status, 401)
    assert.equal(wrong.body.message, LOGIN_FAILED)
    assert.equal(unknown.body.message, LOGIN_FAILED)
  })

  it('rejects malformed login bodies', async () => {
    for (const body of [{}, { identifier: 'a' }, { identifier: ['customer@gavyora.com'], password: 'x' }, { identifier: 'customer@gavyora.com', password: 12345678 }]) {
      const res = await client(app).post('/api/auth/login').send(body)
      assert.equal(res.status, 400, JSON.stringify(body))
    }
  })

  it('locks the account after 10 failed attempts, even for the right password', async () => {
    const [identifier, password] = USERS.other
    for (let i = 0; i < 10; i++) {
      if (i === 9) await resetLimits() // isolate the per-account lock from the per-IP limiter
      const res = await client(app).post('/api/auth/login').send({ identifier, password: 'wrong-password' })
      assert.equal(res.status, 401)
    }
    await resetLimits()
    const locked = await client(app).post('/api/auth/login').send({ identifier, password })
    assert.equal(locked.status, 429)
    assert.match(locked.body.message, /failed login attempts/)
    await User.updateOne({ email: identifier }, { $unset: { lockUntil: 1 }, failedLogins: 0 })
  })
})

describe('tokens', () => {
  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/auth/me')
    assert.equal(res.status, 401)
  })

  it('rejects garbage, forged and expired tokens', async () => {
    const user = await User.findOne({ email: 'customer@gavyora.com' })
    const opts = { issuer: 'gavyora-api', audience: 'gavyora' }
    const forged = jwt.sign({ sub: user.id, role: 'superadmin', v: user.tokenVersion, sid: 'x' }, 'wrong-secret', opts)
    const expired = jwt.sign({ sub: user.id, role: user.role, v: user.tokenVersion, sid: 'x', exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_ACCESS_SECRET, opts)
    const noneAlg = jwt.sign({ sub: user.id, role: 'superadmin' }, '', { algorithm: 'none' })
    for (const token of ['garbage', forged, expired, noneAlg]) {
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`)
      assert.equal(res.status, 401, token.slice(0, 20))
    }
  })

  it('rotates refresh tokens and revokes the whole session when an old one is replayed', async () => {
    const c = await login(app, 'customer')
    const rt1 = cookieValue(c.cookies, 'gv_rt')
    const r1 = await c.post('/api/auth/refresh')
    assert.equal(r1.status, 200)
    const rt2 = cookieValue(r1.headers['set-cookie'], 'gv_rt')
    assert.notEqual(rt1, rt2)
    // Move the rotation outside the short grace window, then replay the stolen first token.
    const { jti } = jwt.decode(rt1)
    await Session.updateOne({ jti }, { revokedAt: new Date(Date.now() - 60_000) })
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', `gv_rt=${rt1}`).set('Origin', ORIGIN)
    assert.equal(replay.status, 401)
    // The legitimate newer token is now dead too, and so is the access token of that session.
    const after = await request(app).post('/api/auth/refresh').set('Cookie', `gv_rt=${rt2}`).set('Origin', ORIGIN)
    assert.equal(after.status, 401)
    const me = await c.get('/api/auth/me')
    assert.equal(me.status, 401)
  })

  it('session check answers 200 for guests and signed-in users, refreshing an expired access token', async () => {
    const guest = await client(app).post('/api/auth/session')
    assert.equal(guest.status, 200)
    assert.equal(guest.body.user, null)
    const c = await login(app, 'customer')
    const ok = await c.post('/api/auth/session')
    assert.equal(ok.status, 200)
    assert.equal(ok.body.user.email, 'customer@gavyora.com')
    // Only the refresh cookie left (access token expired): the session is renewed and rotated.
    const rt = cookieValue(c.cookies, 'gv_rt')
    const renewed = await request(app).post('/api/auth/session').set('Cookie', `gv_rt=${rt}`).set('Origin', ORIGIN)
    assert.equal(renewed.status, 200)
    assert.equal(renewed.body.user.email, 'customer@gavyora.com')
    assert.ok(cookieValue(renewed.headers['set-cookie'], 'gv_at'), 'issues a new access token')
    const garbage = await request(app).post('/api/auth/session').set('Cookie', 'gv_rt=garbage').set('Origin', ORIGIN)
    assert.equal(garbage.status, 200)
    assert.equal(garbage.body.user, null)
  })

  it('logout invalidates the session server-side', async () => {
    const c = await login(app, 'customer')
    const at = cookieValue(c.cookies, 'gv_at')
    const out = await c.post('/api/auth/logout')
    assert.equal(out.status, 200)
    const replay = await request(app).get('/api/auth/me').set('Cookie', `gv_at=${at}`)
    assert.equal(replay.status, 401)
  })

  it('logout-all ends every session of the user', async () => {
    const a = await login(app, 'customer')
    const b = await login(app, 'customer')
    assert.equal((await a.post('/api/auth/logout-all')).status, 200)
    assert.equal((await b.get('/api/auth/me')).status, 401)
  })
})

describe('passwords', () => {
  it('stores bcrypt hashes, never the password', async () => {
    const u = await User.findOne({ email: 'customer@gavyora.com' }).select('+password')
    assert.match(u.password, /^\$2[aby]\$\d{2}\$/)
    assert.notEqual(u.password, 'Customer@123')
    assert.equal(await u.comparePassword('Customer@123'), true)
    assert.equal(await u.comparePassword('Customer@124'), false)
  })

  it('reset tokens are hashed, single-use and expire', async () => {
    const email = 'neha@example.com'
    const res = await client(app).post('/api/auth/forgot-password').send({ email })
    assert.equal(res.status, 200)
    const token = new URL(res.body.devResetLink).searchParams.get('token')
    const stored = await User.findOne({ email }).select('+resetToken')
    assert.notEqual(stored.resetToken.hash, token, 'raw token must not be stored')

    const ok = await client(app).post('/api/auth/reset-password').send({ token, password: 'New-Password-123' })
    assert.equal(ok.status, 200)
    const again = await client(app).post('/api/auth/reset-password').send({ token, password: 'Another-Pass-123' })
    assert.equal(again.status, 400, 'token must be single-use')
    const login1 = await client(app).post('/api/auth/login').send({ identifier: email, password: 'New-Password-123' })
    assert.equal(login1.status, 200)

    await resetLimits()
    const res2 = await client(app).post('/api/auth/forgot-password').send({ email })
    const token2 = new URL(res2.body.devResetLink).searchParams.get('token')
    await User.updateOne({ email }, { 'resetToken.expiresAt': new Date(Date.now() - 1000) })
    const expired = await client(app).post('/api/auth/reset-password').send({ token: token2, password: 'Expired-Pass-123' })
    assert.equal(expired.status, 400)
  })

  it('forgot-password does not reveal whether an email is registered', async () => {
    const known = await client(app).post('/api/auth/forgot-password').send({ email: 'rahul@example.com' })
    const unknown = await client(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' })
    assert.equal(known.status, 200)
    assert.equal(unknown.status, 200)
    assert.equal(known.body.message, unknown.body.message)
  })

  it('rejects weak passwords at registration', async () => {
    const res = await client(app).post('/api/auth/register').send({ name: 'Weak', email: 'weak@example.com', password: 'short' })
    assert.equal(res.status, 400)
  })
})

describe('phone OTP', () => {
  it('creates no account until the code is verified, and burns the code after 5 wrong guesses', async () => {
    const phone = '9000012345'
    const sent = await client(app).post('/api/auth/otp/send').send({ phone })
    assert.equal(sent.status, 200)
    assert.equal(await User.exists({ phone }), null)
    const stored = await OtpCode.findOne({ phone })
    assert.notEqual(stored.hash, sent.body.devOtp, 'OTP must be stored hashed')
    const wrong = sent.body.devOtp === '111111' ? '222222' : '111111'
    for (let i = 0; i < 5; i++) {
      const r = await client(app).post('/api/auth/otp/verify').send({ phone, otp: wrong })
      assert.equal(r.status, 400)
    }
    const late = await client(app).post('/api/auth/otp/verify').send({ phone, otp: sent.body.devOtp })
    assert.equal(late.status, 400, 'code must be burned after too many attempts')
    assert.equal(await User.exists({ phone }), null)
  })
})

describe('rate limiting', () => {
  it('limits password-reset requests and answers with a consistent 429', async () => {
    let last
    for (let i = 0; i < 6; i++) last = await client(app).post('/api/auth/forgot-password').send({ email: 'x@example.com' })
    assert.equal(last.status, 429)
    assert.equal(last.body.code, 'RATE_LIMITED')
    assert.ok(last.headers['ratelimit-policy'] || last.headers.ratelimit, 'standard RateLimit headers')
  })

  it('limits failed logins per IP', async () => {
    let last
    for (let i = 0; i < 11; i++) last = await client(app).post('/api/auth/login').send({ identifier: `nobody${i}@example.com`, password: 'wrong-pass' })
    assert.equal(last.status, 429)
  })
})
