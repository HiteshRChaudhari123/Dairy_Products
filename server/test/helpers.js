// Shared test setup: an in-memory MongoDB with the demo data, and helpers to act as each role.
// Environment variables are set before any app module is imported (env.js reads them once at import).
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import request from 'supertest'

export const ORIGIN = 'http://localhost:5173'
export const EVIL = 'https://evil.example'

Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGO_URI: '',
  CLIENT_URL: ORIGIN,
  // Random per run: no fixed secrets in the repository, not even for tests.
  JWT_ACCESS_SECRET: crypto.randomBytes(32).toString('hex'),
  JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'),
  SUPERADMIN_EMAIL: 'owner@gavyora.com',
  SUPERADMIN_PASSWORD: 'Owner-Test-Password-123',
  RAZORPAY_WEBHOOK_SECRET: crypto.randomBytes(16).toString('hex'),
  // Sandbox-style gateway credentials; tests replace the gateway calls, so nothing is sent over the network.
  RAZORPAY_KEY_ID: 'test-key-id',
  RAZORPAY_KEY_SECRET: crypto.randomBytes(16).toString('hex'),
  COOKIE_SAMESITE: 'lax',
})

export const USERS = {
  customer: ['customer@gavyora.com', 'Customer@123'],
  other: ['amit@example.com', 'Customer@123'],
  rider: ['rider@gavyora.com', 'Delivery@123'],
  admin: ['admin@gavyora.com', 'Admin@123'],
  owner: ['owner@gavyora.com', 'Owner-Test-Password-123'],
}

let started
/** Start the in-memory database (once per test file), load demo data and return the Express app. */
export async function setup() {
  if (!started) {
    started = (async () => {
      const { connectDB } = await import('../src/config/db.js')
      await connectDB()
      const { seed } = await import('../src/seed.js')
      const log = console.log
      console.log = () => {}
      try {
        await seed({ reset: true })
      } finally {
        console.log = log
      }
      const { default: app } = await import('../src/app.js')
      return app
    })()
  }
  return started
}

export async function teardown() {
  const { disconnectDB } = await import('../src/config/db.js')
  await disconnectDB()
}

export async function resetLimits() {
  const { resetRateLimits } = await import('../src/middleware/rateLimit.js')
  await resetRateLimits()
}

/** A cookie-keeping browser-like client that sends our Origin on every request. */
export function client(app, origin = ORIGIN) {
  const agent = request.agent(app)
  const wrap = (method) => (url) => agent[method](url).set('Origin', origin)
  return { agent, get: wrap('get'), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete') }
}

export async function login(app, who) {
  const [identifier, password] = USERS[who] || [who, 'Customer@123']
  const c = client(app)
  const res = await c.post('/api/auth/login').send({ identifier, password })
  assert.equal(res.status, 200, `login as ${who} failed: ${JSON.stringify(res.body)}`)
  c.user = res.body.user
  c.cookies = res.headers['set-cookie']
  return c
}

/** Value of a cookie from a Set-Cookie header list. */
export const cookieValue = (setCookie, name) => {
  const line = (setCookie || []).find((c) => c.startsWith(`${name}=`))
  return line ? decodeURIComponent(line.split(';')[0].slice(name.length + 1)) : undefined
}
