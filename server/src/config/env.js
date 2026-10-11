import 'dotenv/config'

// Delivery dates ("tomorrow", slots, the milk sheet) are Indian dates, so the server must use IST
// even when the host runs in UTC (Render, Railway, AWS).
process.env.TZ ||= 'Asia/Kolkata'

const nodeEnv = process.env.NODE_ENV || 'development'
const isProd = nodeEnv === 'production'
const isTest = nodeEnv === 'test'

const list = (v) =>
  (v || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)

const clientUrls = list(process.env.CLIENT_URL || 'http://localhost:5173')

export const env = {
  nodeEnv,
  isProd,
  isTest,
  port: Number(process.env.PORT) || 5000,
  clientUrls,
  clientUrl: clientUrls[0] || 'http://localhost:5173',
  mongoUri: process.env.MONGO_URI || '',
  accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
  // 'lax' when the website and API share a site (gavyora.com + api.gavyora.com); 'none' only when they are on
  // unrelated domains (needs HTTPS, and the CSRF origin check in middleware/security.js stays on either way).
  cookieSameSite: (process.env.COOKIE_SAMESITE || 'lax').toLowerCase(),
  trustProxy: Number(process.env.TRUST_PROXY ?? 1),
  bodyLimit: process.env.BODY_LIMIT || '200kb',
  bcryptRounds: isTest ? 4 : Number(process.env.BCRYPT_ROUNDS) || 12,
  superadminEmail: process.env.SUPERADMIN_EMAIL || 'owner@gavyora.com',
  superadminPassword: process.env.SUPERADMIN_PASSWORD || 'Gavyora@123',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
}

/**
 * Development-only conveniences (OTP and password-reset links echoed in API responses and logs).
 * Always off in production, whatever the environment says.
 */
export const devFeaturesEnabled = (cfg = env) => !cfg.isProd && process.env.DEV_ECHO_SECRETS !== 'false'

const PLACEHOLDERS = /^(change-me|dev-|changeme|secret|password|test)/i
const DEMO_PASSWORDS = ['Gavyora@123', 'Admin@123', 'Customer@123', 'Delivery@123']

/**
 * Checks the configuration. Returns { errors, warnings } as messages that name settings but never print values.
 * In production any error stops the server from starting.
 */
export function validateEnv(cfg = env, raw = process.env) {
  const errors = []
  const warnings = []
  const prodOrWarn = (msg) => (cfg.isProd ? errors : warnings).push(msg)

  for (const [name, value] of [
    ['JWT_ACCESS_SECRET', raw.JWT_ACCESS_SECRET],
    ['JWT_REFRESH_SECRET', raw.JWT_REFRESH_SECRET],
  ]) {
    if (!value) prodOrWarn(`${name} is not set (a development fallback is used)`)
    else if (value.length < 32) prodOrWarn(`${name} is shorter than 32 characters`)
    else if (PLACEHOLDERS.test(value)) prodOrWarn(`${name} looks like a placeholder value`)
  }
  if (raw.JWT_ACCESS_SECRET && raw.JWT_ACCESS_SECRET === raw.JWT_REFRESH_SECRET) {
    prodOrWarn('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different')
  }
  if (!cfg.mongoUri) prodOrWarn('MONGO_URI is not set (the in-memory development database is used)')
  if (!raw.CLIENT_URL) prodOrWarn('CLIENT_URL is not set (defaults to http://localhost:5173)')
  for (const url of cfg.clientUrls) {
    if (url.includes('*')) errors.push('CLIENT_URL must list exact origins, not wildcards')
    else if (cfg.isProd && !url.startsWith('https://')) errors.push(`CLIENT_URL origin ${url} must use https in production`)
  }
  if (!['lax', 'strict', 'none'].includes(cfg.cookieSameSite)) errors.push('COOKIE_SAMESITE must be lax, strict or none')
  if (DEMO_PASSWORDS.includes(cfg.superadminPassword) || cfg.superadminPassword.length < 12) {
    prodOrWarn('SUPERADMIN_PASSWORD is a demo value or shorter than 12 characters')
  }
  const rp = [raw.RAZORPAY_KEY_ID, raw.RAZORPAY_KEY_SECRET].filter(Boolean).length
  if (rp === 1) errors.push('Set both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET, or neither')
  if (rp === 2 && !raw.RAZORPAY_WEBHOOK_SECRET) warnings.push('RAZORPAY_WEBHOOK_SECRET is not set, so payment webhooks are rejected')
  if (cfg.isProd && rp === 0) warnings.push('Razorpay keys are not set, so online payments are unavailable')
  if (cfg.isProd && raw.DEV_ECHO_SECRETS === 'true') warnings.push('DEV_ECHO_SECRETS is ignored in production')
  return { errors, warnings }
}

const { errors } = validateEnv()
if (env.isProd && errors.length) {
  throw new Error(`Invalid production configuration:\n - ${errors.join('\n - ')}`)
}
