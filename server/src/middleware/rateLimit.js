// Rate limiters. Each one is tagged (fn.security) so the security audit can verify which routes are limited.
// The default in-memory store works for a single server. With several instances behind a load balancer, pass a
// shared store (e.g. rate-limit-redis) so the limits apply across all of them.
import crypto from 'node:crypto'
import { MemoryStore, rateLimit } from 'express-rate-limit'

const stores = []

// The built-in security audit sends a few probe requests to this same server; they carry this per-process nonce
// so they never use up a real visitor's quota. It is random on every start and never leaves the process.
export const AUDIT_NONCE = crypto.randomBytes(24).toString('hex')

function limiter(name, { windowMs, limit, message, skipSuccessfulRequests = false }) {
  const store = new MemoryStore()
  stores.push(store)
  const fn = rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    store,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req) => req.headers['x-security-audit'] === AUDIT_NONCE,
    handler: (_req, res, _next, options) =>
      res.status(options.statusCode).json({ message, code: 'RATE_LIMITED' }),
  })
  fn.security = { type: 'rateLimit', name, windowMs, limit }
  return fn
}

const MIN = 60 * 1000

export const limits = {
  global: limiter('global', { windowMs: MIN, limit: 300, message: 'Too many requests. Please slow down and try again.' }),
  // Failed logins only, so many people behind one IP (home, office) can still sign in.
  login: limiter('login', {
    windowMs: 15 * MIN,
    limit: 10,
    skipSuccessfulRequests: true,
    message: 'Too many failed logins. Please wait a few minutes and try again.',
  }),
  register: limiter('register', { windowMs: 60 * MIN, limit: 10, message: 'Too many sign-ups from this network. Please try again later.' }),
  otp: limiter('otp', { windowMs: 15 * MIN, limit: 10, message: 'Too many OTP requests. Please wait a few minutes and try again.' }),
  passwordReset: limiter('passwordReset', { windowMs: 15 * MIN, limit: 5, message: 'Too many password reset attempts. Please try again later.' }),
  refresh: limiter('refresh', { windowMs: MIN, limit: 60, message: 'Too many requests. Please slow down and try again.' }),
  // Runs on every full page load, so it must allow many visitors behind one shared IP (office, mobile carrier).
  session: limiter('session', { windowMs: MIN, limit: 200, message: 'Too many requests. Please slow down and try again.' }),
  sensitive: limiter('sensitive', { windowMs: MIN, limit: 20, message: 'Too many requests. Please slow down and try again.' }),
  expensive: limiter('expensive', { windowMs: MIN, limit: 30, message: 'Too many report requests. Please wait a moment.' }),
  audit: limiter('audit', { windowMs: MIN, limit: 5, message: 'The security audit was run recently. Please wait a minute.' }),
}

/** Tests only: forget every counter. */
export async function resetRateLimits() {
  await Promise.all(stores.map((s) => s.resetAll()))
}
