import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import morgan from 'morgan'
import { env } from './config/env.js'
import { errorHandler, notFound } from './middleware/error.js'
import { limits } from './middleware/rateLimit.js'
import { isAllowedOrigin, originCheck, parseQuery, rejectUnsafeKeys, requestId } from './middleware/security.js'
import account from './routes/account.js'
import admin from './routes/admin.js'
import adminBilling from './routes/adminBilling.js'
import auth from './routes/auth.js'
import billing from './routes/billing.js'
import catalog from './routes/catalog.js'
import delivery from './routes/delivery.js'
import orders from './routes/orders.js'
import plans from './routes/plans.js'
import security from './routes/security.js'
import subscriptions from './routes/subscriptions.js'

const app = express()

/** Every API router and where it is mounted. The security audit walks these to check each route's protection. */
export const MOUNTS = [
  ['/api/auth', auth],
  ['/api/account', account],
  ['/api/subscriptions', subscriptions],
  ['/api/delivery', delivery],
  ['/api/security', security],
  ['/api/plans', plans],
  ['/api/billing', billing],
  ['/api/admin/billing', adminBilling],
  ['/api/admin', admin],
  ['/api', catalog],
  ['/api', orders],
]

app.set('trust proxy', env.trustProxy) // number of proxies in front of the API (Render/Railway: 1)
app.set('query parser', parseQuery)
app.disable('x-powered-by')
app.use(requestId)
app.use(
  '/api',
  helmet({
    // The API only returns JSON, so nothing may load, frame or run from its responses.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"] },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    strictTransportSecurity: env.isProd ? { maxAge: 63072000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'no-referrer' },
  }),
)
app.use(
  '/api',
  cors({
    // Exact origins from CLIENT_URL only; never a wildcard, because cookies are sent.
    origin: (origin, cb) => cb(null, !origin || isAllowedOrigin(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Type'],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  }),
)
// Delivery photo proofs are the only larger bodies (a compressed photo as base64); everything else keeps the small limit.
app.use(/^\/api\/delivery\/orders\/[^/]+\/proof$/, express.json({ limit: '600kb' }))
app.use(
  express.json({
    limit: env.bodyLimit,
    // keep the raw body for Razorpay webhook signature checks
    verify: (req, _res, buf) => {
      if (req.originalUrl.startsWith('/api/payments/webhook')) req.rawBody = buf.toString()
    },
  }),
)
app.use(cookieParser())
if (!env.isProd && !env.isTest) app.use(morgan('dev', { skip: (req) => !!req.headers['x-security-audit'] }))
app.use('/api', limits.global, rejectUnsafeKeys, originCheck)

app.get('/api/health', (_req, res) => res.json({ ok: true }))
for (const [path, router] of MOUNTS) app.use(path, router)

app.use('/api', notFound)

/**
 * One-service hosting: in production the API also serves the built website (client/dist) from the same address,
 * so login cookies are first-party and no CORS is involved. Set SERVE_CLIENT=false when the website is hosted
 * elsewhere (e.g. Vercel). Pages get the website's security headers; /api keeps its stricter JSON-only ones.
 */
export const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist')
const serveClient = process.env.SERVE_CLIENT === 'true' || (env.isProd && process.env.SERVE_CLIENT !== 'false')
if (serveClient && fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) {
  app.use(
    helmet({
      // The full policy (default-src, script hashes, Razorpay, fonts) is the <meta> tag the build adds to index.html.
      // Browsers enforce both policies, so this header only adds what a <meta> tag cannot (frame-ancestors) and
      // must not repeat default-src, or it would block what the page policy allows.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: { defaultSrc: helmet.contentSecurityPolicy.dangerouslyDisableDefaultSrc, frameAncestors: ["'none'"], objectSrc: ["'none'"], baseUri: ["'self'"] },
      },
      strictTransportSecurity: env.isProd ? { maxAge: 63072000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      xFrameOptions: { action: 'deny' },
    }),
    (_req, res, next) => {
      res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=(), payment=(self "https://api.razorpay.com")')
      next()
    },
  )
  // Hashed build files never change; everything else is revalidated.
  app.use('/assets', express.static(path.join(CLIENT_DIST, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }))
  app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }))
  // Every other page is handled by the React router.
  app.get(/.*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(path.join(CLIENT_DIST, 'index.html'))
  })
}

app.use(notFound)
app.use(errorHandler)

export default app
