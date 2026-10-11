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
app.use(requestId)
app.use(
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

app.use(notFound)
app.use(errorHandler)

export default app
