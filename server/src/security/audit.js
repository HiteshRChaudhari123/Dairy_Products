// Security audit: configuration inspection, static analysis of the route table and source, and a few harmless probe
// requests sent to a private copy of this API on 127.0.0.1. It never contacts the live site, never logs in as anyone
// and never prints secret values. A check only PASSes when the evidence supports it; anything it cannot verify is
// reported as NOT CHECKED.
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import jwt from 'jsonwebtoken'
import { devFeaturesEnabled, env, validateEnv } from '../config/env.js'
import { ACCESS_TTL, cookieOptions, protect, REFRESH_TTL } from '../middleware/auth.js'
import { errorHandler } from '../middleware/error.js'
import { AUDIT_NONCE, limits } from '../middleware/rateLimit.js'
import { originCheck, rejectUnsafeKeys } from '../middleware/security.js'
import User from '../models/User.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
export const DEPENDENCY_REPORT = path.join(ROOT, 'server', 'security-reports', 'dependency-audit.json')

export const STATUS = { PASS: 'PASS', WARNING: 'WARNING', FAIL: 'FAIL', NOT_CHECKED: 'NOT CHECKED' }

// Routes that are meant to work without logging in.
const PUBLIC = new Set([
  'POST /api/auth/register',
  'POST /api/auth/login',
  'POST /api/auth/otp/send',
  'POST /api/auth/otp/verify',
  'POST /api/auth/refresh',
  'POST /api/auth/logout',
  'POST /api/auth/session', // returns { user: null } without a valid session
  'POST /api/auth/forgot-password',
  'POST /api/auth/reset-password',
  'POST /api/auth/delivery/register',
  'GET /api/account/serviceability/:pincode',
  'GET /api/home',
  'GET /api/settings',
  'GET /api/pages/:slug',
  'GET /api/categories',
  'GET /api/products',
  'GET /api/products/suggest',
  'GET /api/products/:slug',
  'GET /api/coupons/available',
  'GET /api/plans',
  'GET /api/plans/:slug',
  'POST /api/payments/webhook', // authenticated by its HMAC signature instead
])

// Logged-in routes any role may call; each must scope its queries to req.user (checked below).
const SELF_SERVICE = [/^\/api\/account\//, /^\/api\/subscriptions\/(?!admin\/)/, /^\/api\/subscriptions$/, /^\/api\/orders\/mine/, /^\/api\/billing\//, /^\/api\/plans\/:slug\/(quote|checkout)$/]
const SELF_SERVICE_EXACT = new Set([
  'GET /api/auth/me',
  'POST /api/auth/logout-all',
  'POST /api/orders/quote',
  'POST /api/orders',
  'POST /api/orders/:id/verify-payment',
  'POST /api/orders/:id/cancel',
  'POST /api/orders/:id/return',
  'POST /api/products/:id/reviews',
])

// Mutations without a body schema, and why.
const NO_BODY = new Set([
  'POST /api/auth/logout', // no body
  'POST /api/auth/logout-all', // no body
  'POST /api/auth/refresh', // reads the cookie
  'POST /api/auth/session', // reads the cookies
  'POST /api/security/audit', // no body
  'POST /api/payments/webhook', // authenticated by HMAC signature over the raw body; only known fields are read
])

// Logged-in routes that read no per-user records, so they need no ownership filter.
const NO_USER_DATA = new Set(['POST /api/orders/quote'])

// Endpoints that must carry a specific (or any) rate limiter.
const RATE_LIMITED = {
  'POST /api/auth/login': 'login',
  'POST /api/auth/register': 'register',
  'POST /api/auth/delivery/register': 'register',
  'POST /api/auth/otp/send': 'otp',
  'POST /api/auth/otp/verify': 'otp',
  'POST /api/auth/forgot-password': 'passwordReset',
  'POST /api/auth/reset-password': 'passwordReset',
  'POST /api/auth/refresh': 'refresh',
  'POST /api/auth/session': 'session',
  'POST /api/orders': '*',
  'POST /api/account/wallet/topup': '*',
  'PATCH /api/account/password': '*',
  'PATCH /api/delivery/orders/:id/status': '*',
  'GET /api/admin/stats': '*',
  'GET /api/admin/reports/sales': '*',
  'POST /api/security/audit': 'audit',
  'POST /api/plans/:slug/checkout': '*',
  'POST /api/billing/membership/:id/renew': '*',
  'POST /api/billing/transactions/:id/verify': '*',
  'POST /api/subscriptions/:id/topup': '*',
  'POST /api/admin/billing/refunds': '*',
  'GET /api/admin/billing/reports': '*',
}

const PUBLIC_SETTINGS = new Set(['storeName', 'supportPhone', 'supportEmail', 'address', 'fssaiNo', 'gstNo', 'deliveryFee', 'freeDeliveryAbove', 'minOrderValue', 'taxPercent', 'codEnabled', 'slots'])

const rel = (p) => path.relative(ROOT, p).replaceAll('\\', '/')

/** Every API route with the middleware that runs before its handler, in order. */
export function collectRoutes(mounts) {
  const routes = []
  for (const [base, router] of mounts) {
    const uses = []
    for (const layer of router.stack) {
      if (!layer.route) {
        uses.push(layer)
        continue
      }
      const routePath = layer.route.path
      const own = layer.route.stack.map((l) => l.handle)
      const inherited = uses.filter((u) => u.match(routePath)).map((u) => u.handle)
      for (const method of Object.keys(layer.route.methods)) {
        if (method === '_all') continue
        const full = (base + (routePath === '/' ? '' : routePath)).replace(/\/+$/, '') || '/'
        routes.push({ key: `${method.toUpperCase()} ${full}`, method: method.toUpperCase(), path: full, chain: [...inherited, ...own], handler: own.at(-1) })
      }
    }
  }
  return routes
}

function walk(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'security-reports'].includes(entry.name)) continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(p, exts, out)
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(p)
  }
  return out
}

const SECRET_PATTERNS = [
  ['Razorpay key', /rzp_(live|test)_[A-Za-z0-9]{8,}/],
  ['MongoDB URI with password', /mongodb(\+srv)?:\/\/[^:\s'"`<>]+:[^@\s'"`<>]{3,}@/],
  ['Private key', /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['Stripe-style live key', /\b(sk|rk)_live_[0-9a-zA-Z]{10,}/],
  ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['Long literal assigned to a secret-like name', /(secret|api[_-]?key|access[_-]?token|private[_-]?key)\s*[:=]\s*['"`][A-Za-z0-9+/_=-]{24,}['"`]/i],
]

const runFile = (cmd, args, opts) =>
  new Promise((resolve) => execFile(cmd, args, { timeout: 15000, maxBuffer: 8 * 1024 * 1024, ...opts }, (error, stdout) => resolve({ error, stdout })))

async function probe(app) {
  const server = http.createServer(app)
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  const send = async (p, init = {}) => {
    const res = await fetch(base + p, { ...init, headers: { 'x-security-audit': AUDIT_NONCE, ...(init.headers || {}) } })
    const text = await res.text()
    let body
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
    return { status: res.status, headers: res.headers, body, text }
  }
  return { send, close: () => new Promise((r) => server.close(r)) }
}

export async function runAudit({ app, mounts, db = true } = {}) {
  const started = Date.now()
  const checks = []
  const add = (c) => checks.push({ evidence: [], ...c })
  const routes = mounts ? collectRoutes(mounts) : []
  const P = app ? await probe(app).catch(() => null) : null

  try {
    // ── Configuration ──
    {
      const { errors, warnings } = validateEnv()
      add({
        id: 'env.required',
        category: 'Configuration',
        title: 'Required environment variables',
        severity: 'high',
        component: 'server/src/config/env.js',
        status: errors.length ? STATUS.FAIL : warnings.length ? STATUS.WARNING : STATUS.PASS,
        evidence: [...errors.map((e) => `Error: ${e}`), ...warnings.map((w) => `Warning: ${w}`), `NODE_ENV=${env.nodeEnv}`].concat(
          errors.length || warnings.length ? [] : ['All required settings are present and pass the strength checks'],
        ),
        remediation: 'Set the listed variables in server/.env (see server/.env.example). In production the server refuses to start while any error remains.',
      })
    }
    {
      const ok = !devFeaturesEnabled({ isProd: true })
      const now = devFeaturesEnabled()
      add({
        id: 'debug.production',
        category: 'Configuration',
        title: 'Debug features disabled in production',
        severity: 'high',
        component: 'server/src/config/env.js, server/src/app.js',
        status: !ok ? STATUS.FAIL : env.isProd && now ? STATUS.FAIL : STATUS.PASS,
        evidence: [
          `devFeaturesEnabled(production) = ${!ok} (dev OTP and reset-link echo are forced off in production)`,
          `This process: NODE_ENV=${env.nodeEnv}, dev echo ${now ? 'on' : 'off'}, request logging ${!env.isProd && !env.isTest ? 'on (morgan dev)' : 'off'}`,
        ],
        remediation: 'Run the API with NODE_ENV=production on every deployed server.',
      })
    }

    // ── Secrets ──
    {
      const files = [
        ...walk(path.join(ROOT, 'server', 'src'), ['.js']),
        ...walk(path.join(ROOT, 'server', 'test'), ['.js']),
        ...walk(path.join(ROOT, 'client', 'src'), ['.js', '.jsx']),
        ...['client/index.html', 'client/vite.config.js', 'client/vercel.json', 'server/.env.example', 'client/.env.example', 'README.md'].map((f) => path.join(ROOT, f)),
      ].filter((f) => fs.existsSync(f))
      const hits = []
      for (const f of files) {
        fs.readFileSync(f, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            for (const [name, rx] of SECRET_PATTERNS) if (rx.test(line)) hits.push(`${rel(f)}:${i + 1} looks like a ${name}`)
          })
      }
      add({
        id: 'secrets.hardcoded',
        category: 'Secrets',
        title: 'No hardcoded secrets in source',
        severity: 'critical',
        component: 'server/src, client/src, config files',
        status: hits.length ? STATUS.FAIL : STATUS.PASS,
        evidence: hits.length ? hits.slice(0, 20) : [`Scanned ${files.length} files for ${SECRET_PATTERNS.length} secret patterns: no matches`],
        remediation: 'Move the value to an environment variable, then revoke and rotate it at the provider: anything that was committed must be treated as leaked.',
      })
    }
    {
      const git = await runFile('git', ['ls-files', '-z'], { cwd: ROOT })
      if (git.error) {
        add({ id: 'secrets.gitignore', category: 'Secrets', title: '.env files are not committed', severity: 'critical', component: '.gitignore', status: STATUS.NOT_CHECKED, evidence: ['git is not available, so tracked files could not be listed'], remediation: 'Run the audit where git is installed.' })
      } else {
        const tracked = git.stdout.split('\0').filter((f) => /(^|\/)\.env(\.[^/]*)?$/.test(f) && !f.endsWith('.env.example') || /\.(pem|key|p12)$/.test(f))
        const ignore = ['.gitignore', 'server/.gitignore'].map((f) => path.join(ROOT, f)).filter(fs.existsSync).map((f) => fs.readFileSync(f, 'utf8'))
        const ignored = ignore.some((t) => /^\.env$/m.test(t))
        add({
          id: 'secrets.gitignore',
          category: 'Secrets',
          title: '.env files are not committed',
          severity: 'critical',
          component: '.gitignore',
          status: tracked.length ? STATUS.FAIL : ignored ? STATUS.PASS : STATUS.WARNING,
          evidence: tracked.length ? tracked.map((f) => `Tracked by git: ${f}`) : [`No .env or key files tracked by git`, ignored ? '.env is listed in .gitignore' : '.env is not listed in .gitignore'],
          remediation: 'git rm --cached the file, add it to .gitignore, and rotate every secret it contained.',
        })
      }
    }
    {
      const dist = path.join(ROOT, 'client', 'dist', 'assets')
      if (!fs.existsSync(dist)) {
        add({ id: 'secrets.bundle', category: 'Secrets', title: 'Website bundle contains no secrets or demo passwords', severity: 'high', component: 'client/dist', status: STATUS.NOT_CHECKED, evidence: ['No production build found (run npm run build in client/)'], remediation: 'Build the client, then re-run the audit.' })
      } else {
        const hits = []
        for (const f of walk(dist, ['.js'])) {
          const t = fs.readFileSync(f, 'utf8')
          for (const [name, rx] of SECRET_PATTERNS) if (rx.test(t)) hits.push(`${rel(f)} contains a ${name}`)
          if (/Customer@123|Admin@123|Gavyora@123|Delivery@123/.test(t)) hits.push(`${rel(f)} contains demo passwords`)
        }
        add({
          id: 'secrets.bundle',
          category: 'Secrets',
          title: 'Website bundle contains no secrets or demo passwords',
          severity: 'high',
          component: 'client/dist',
          status: hits.length ? STATUS.FAIL : STATUS.PASS,
          evidence: hits.length ? hits : ['Scanned the built JavaScript: no secret values or demo passwords'],
          remediation: 'Only VITE_-prefixed public values may reach the client. Remove the value and rebuild.',
        })
      }
    }

    // ── Authorization ──
    if (!routes.length) {
      add({ id: 'authz.routes', category: 'Authentication & authorization', title: 'Every non-public route requires login', severity: 'critical', component: 'server/src/routes', status: STATUS.NOT_CHECKED, evidence: ['Route table not available'], remediation: 'Run the audit from the API process.' })
    } else {
      const unprotected = []
      const missingRole = []
      const unscoped = []
      const unknownPublic = []
      for (const r of routes) {
        const hasAuth = r.chain.includes(protect)
        const roleTag = r.chain.find((f) => f.security?.type === 'role' || f.security?.type === 'permission')
        const selfService = SELF_SERVICE_EXACT.has(r.key) || SELF_SERVICE.some((rx) => rx.test(r.path))
        if (PUBLIC.has(r.key)) continue
        if (!hasAuth) {
          unprotected.push(r.key)
          continue
        }
        const deliveryOnly = r.chain.some((f) => f.security?.type === 'role' && f.security.roles.includes('delivery'))
        if (!selfService && !roleTag) missingRole.push(r.key)
        if ((selfService || deliveryOnly) && !NO_USER_DATA.has(r.key) && !/req\.user/.test(r.handler.toString())) unscoped.push(r.key)
      }
      for (const key of PUBLIC) if (!routes.some((r) => r.key === key)) unknownPublic.push(`${key} (listed as public but not found)`)
      add({
        id: 'authz.login',
        category: 'Authentication & authorization',
        title: 'Every non-public route requires login',
        severity: 'critical',
        component: 'server/src/routes',
        status: unprotected.length ? STATUS.FAIL : STATUS.PASS,
        evidence: unprotected.length
          ? unprotected.map((k) => `No auth middleware: ${k}`)
          : [`${routes.length} routes inspected; ${PUBLIC.size} are intentionally public; every other route runs protect()`],
        remediation: 'Add protect (and allow/can) to the route, or add it to the public list in security/audit.js if it really is public.',
      })
      add({
        id: 'authz.roles',
        category: 'Authentication & authorization',
        title: 'Admin and staff routes check role and permission on the server',
        severity: 'critical',
        component: 'server/src/routes',
        status: missingRole.length ? STATUS.FAIL : STATUS.PASS,
        evidence: missingRole.length
          ? missingRole.map((k) => `Logged-in route without a role check: ${k}`)
          : [`All ${routes.filter((r) => r.chain.some((f) => f.security?.type === 'role' || f.security?.type === 'permission')).length} admin/staff routes run allow() or can() before the handler`],
        remediation: 'Add allow(...) / can(...) to the route.',
      })
      add({
        id: 'authz.ownership',
        category: 'Authentication & authorization',
        title: 'Customer routes are scoped to the logged-in user',
        severity: 'high',
        component: 'server/src/routes',
        status: unscoped.length ? STATUS.WARNING : STATUS.PASS,
        evidence: unscoped.length
          ? unscoped.map((k) => `Handler never references req.user: ${k}`)
          : ['Every self-service handler references req.user (static check; cross-user access is also covered by the automated tests)'],
        remediation: 'Filter queries by req.user._id so one customer can never read or change another customer\'s records.',
      })
      if (unknownPublic.length) {
        add({ id: 'authz.public-list', category: 'Authentication & authorization', title: 'Public route list is up to date', severity: 'low', component: 'server/src/security/audit.js', status: STATUS.WARNING, evidence: unknownPublic, remediation: 'Remove stale entries from the public list.' })
      }

      const unvalidated = routes.filter((r) => ['POST', 'PUT', 'PATCH'].includes(r.method) && !NO_BODY.has(r.key) && !/\.(safe)?[pP]arse\(/.test(r.handler.toString()))
      add({
        id: 'input.validation',
        category: 'Input handling',
        title: 'Request bodies are validated with a schema',
        severity: 'high',
        component: 'server/src/routes',
        status: unvalidated.length ? STATUS.WARNING : STATUS.PASS,
        evidence: unvalidated.length
          ? unvalidated.map((r) => `No schema .parse() found in handler: ${r.key}`)
          : [`All ${routes.filter((r) => ['POST', 'PUT', 'PATCH'].includes(r.method)).length} POST/PUT/PATCH handlers validate input with Zod (body-less exceptions: ${[...NO_BODY].join(', ')})`],
        remediation: 'Parse req.body with a Zod schema before using it.',
      })

      const missingLimits = []
      for (const [key, name] of Object.entries(RATE_LIMITED)) {
        const r = routes.find((x) => x.key === key)
        if (!r) {
          missingLimits.push(`${key}: route not found`)
          continue
        }
        const tags = r.chain.filter((f) => f.security?.type === 'rateLimit').map((f) => f.security.name)
        if (name === '*' ? !tags.length : !tags.includes(name)) missingLimits.push(`${key}: expected the ${name === '*' ? 'any' : name} limiter`)
      }
      const appStack = app?.router?.stack || []
      const globalLimit = appStack.some((l) => l.handle === limits.global)
      add({
        id: 'ratelimit.sensitive',
        category: 'API security',
        title: 'Rate limits on login, sign-up, OTP, password reset and expensive endpoints',
        severity: 'high',
        component: 'server/src/middleware/rateLimit.js',
        status: missingLimits.length || !globalLimit ? STATUS.FAIL : STATUS.PASS,
        evidence: [
          ...missingLimits,
          globalLimit ? `Global limit on /api: ${limits.global.security.limit} requests/min per IP` : 'Global /api limiter is not mounted',
          ...(missingLimits.length ? [] : [`${Object.keys(RATE_LIMITED).length} sensitive endpoints carry their limiter (login: ${limits.login.security.limit} failures/15 min per IP, plus a per-account lock)`]),
          'Store: in-memory (one server). Use a shared store such as Redis when running several API instances.',
        ],
        remediation: 'Add the matching limiter from middleware/rateLimit.js to the route.',
      })

      const last = appStack.at(-1)?.handle
      const sanitizer = appStack.some((l) => l.handle === rejectUnsafeKeys)
      const csrf = appStack.some((l) => l.handle === originCheck)
      add({
        id: 'input.operators',
        category: 'Input handling',
        title: 'Mongo operator / prototype-pollution keys are rejected',
        severity: 'high',
        component: 'server/src/middleware/security.js',
        status: sanitizer ? STATUS.PASS : STATUS.FAIL,
        evidence: [sanitizer ? 'rejectUnsafeKeys runs on every /api request; query strings are parsed into flat strings only' : 'rejectUnsafeKeys is not mounted'],
        remediation: 'Mount rejectUnsafeKeys on /api before the routers.',
      })
      add({
        id: 'errors.handler',
        category: 'Error handling',
        title: 'Central error handler is the last middleware',
        severity: 'medium',
        component: 'server/src/middleware/error.js',
        status: last === errorHandler ? STATUS.PASS : STATUS.FAIL,
        evidence: [last === errorHandler ? 'errorHandler is registered last on the app' : 'The last middleware is not errorHandler'],
        remediation: 'Register app.use(errorHandler) after every route.',
      })
      add({
        id: 'cookies.csrf',
        category: 'Authentication & authorization',
        title: 'Cross-site request forgery protection for cookie sessions',
        severity: 'high',
        component: 'server/src/middleware/security.js',
        status: csrf ? STATUS.PASS : STATUS.FAIL,
        evidence: [csrf ? 'originCheck rejects state-changing requests that carry session cookies from origins outside CLIENT_URL' : 'originCheck is not mounted'],
        remediation: 'Mount originCheck on /api.',
      })
    }

    // ── Cookies and tokens ──
    {
      const prod = cookieOptions({ isProd: true, cookieSameSite: env.cookieSameSite })
      const here = cookieOptions()
      const ok = prod.httpOnly && prod.secure && ['lax', 'strict', 'none'].includes(prod.sameSite)
      add({
        id: 'cookies.flags',
        category: 'Authentication & authorization',
        title: 'Session cookies are HttpOnly, Secure and SameSite',
        severity: 'high',
        component: 'server/src/middleware/auth.js',
        status: ok ? (env.isProd && !here.secure ? STATUS.FAIL : STATUS.PASS) : STATUS.FAIL,
        evidence: [
          `Production flags: HttpOnly=${prod.httpOnly}, Secure=${prod.secure}, SameSite=${prod.sameSite}`,
          `This process: Secure=${here.secure} (HTTP is allowed only outside production)`,
          'Refresh cookie is scoped to /api/auth; tokens are only returned in JSON for the mobile app (X-Client-Type: mobile)',
        ],
        remediation: 'Keep cookieOptions() unchanged; set COOKIE_SAMESITE=none only when the website and API are on unrelated domains.',
      })
      add({
        id: 'auth.tokens',
        category: 'Authentication & authorization',
        title: 'Short-lived access tokens with rotating, revocable refresh tokens',
        severity: 'high',
        component: 'server/src/middleware/auth.js',
        status: ACCESS_TTL <= 15 * 60 && REFRESH_TTL <= 30 * 86400 ? STATUS.PASS : STATUS.WARNING,
        evidence: [
          `Access token lifetime: ${ACCESS_TTL / 60} minutes; refresh token lifetime: ${REFRESH_TTL / 86400} days`,
          'Each refresh rotates the token; reusing a rotated token revokes the whole session family; logout revokes the family; password change, reset and blocking bump tokenVersion',
          `Password hashing: bcrypt, cost ${env.bcryptRounds}${env.isTest ? ' (reduced for tests)' : ''}`,
        ],
        remediation: 'Keep access tokens at 15 minutes or less.',
      })
    }

    // ── Sensitive data in responses ──
    {
      const json = new User({ name: 'Audit', password: 'x', tokenVersion: 3, resetToken: { hash: 'h', expiresAt: new Date() }, failedLogins: 2, lockUntil: new Date() }).toJSON()
      const leaked = ['password', 'resetToken', 'tokenVersion', 'otp', 'failedLogins', 'lockUntil'].filter((k) => k in json)
      const delivery = fs.readFileSync(path.join(ROOT, 'server/src/routes/delivery.js'), 'utf8')
      const evidence = [leaked.length ? `User JSON still contains: ${leaked.join(', ')}` : 'User JSON drops password, reset token, token version and lockout fields']
      evidence.push(/-deliveryOtp/.test(delivery) ? 'Delivery partner order queries exclude the customer\'s delivery OTP' : 'Delivery partner order queries may expose deliveryOtp')
      let status = leaked.length || !/-deliveryOtp/.test(delivery) ? STATUS.FAIL : STATUS.PASS
      if (P && db) {
        const s = await P.send('/api/settings').catch(() => null)
        if (s?.status === 200 && s.body && typeof s.body === 'object') {
          const extra = Object.keys(s.body).filter((k) => !PUBLIC_SETTINGS.has(k))
          evidence.push(extra.length ? `Public /api/settings exposes: ${extra.join(', ')}` : 'Public /api/settings returns only whitelisted store settings')
          if (extra.length) status = STATUS.FAIL
        } else evidence.push('Public /api/settings could not be fetched (not checked)')
      }
      add({
        id: 'data.responses',
        category: 'Sensitive data',
        title: 'No secrets or private fields in API responses',
        severity: 'high',
        component: 'server/src/models/User.js, server/src/routes',
        status,
        evidence,
        remediation: 'Remove the field in the model\'s toJSON transform or with .select("-field").',
      })
    }

    // ── Live probes against a private copy of the API ──
    if (!P) {
      for (const [id, title] of [
        ['headers.api', 'Security headers on API responses'],
        ['cors.config', 'CORS allows only configured origins'],
        ['errors.safe', 'Errors never leak internals'],
        ['authz.probes', 'Unauthenticated and forged requests are rejected'],
      ]) add({ id, category: 'API security', title, severity: 'high', component: 'server/src/app.js', status: STATUS.NOT_CHECKED, evidence: ['Probe server could not start'], remediation: 'Re-run the audit.' })
    } else {
      const h = await P.send('/api/health')
      const need = [
        ['content-security-policy', (v) => /default-src 'none'/.test(v || '')],
        ['x-content-type-options', (v) => v === 'nosniff'],
        ['x-frame-options', (v) => /deny|sameorigin/i.test(v || '')],
        ['referrer-policy', (v) => !!v],
        ['cross-origin-opener-policy', (v) => !!v],
      ]
      const missing = need.filter(([k, ok]) => !ok(h.headers.get(k))).map(([k]) => k)
      const hsts = h.headers.get('strict-transport-security')
      const powered = h.headers.get('x-powered-by')
      add({
        id: 'headers.api',
        category: 'API security',
        title: 'Security headers on API responses',
        severity: 'medium',
        component: 'server/src/app.js (helmet)',
        status: missing.length || powered || (env.isProd && !hsts) ? STATUS.FAIL : STATUS.PASS,
        evidence: [
          missing.length ? `Missing or weak: ${missing.join(', ')}` : `Present: ${need.map(([k]) => k).join(', ')}`,
          powered ? `X-Powered-By is exposed (${powered})` : 'X-Powered-By is not sent',
          hsts ? `HSTS: ${hsts}` : env.isProd ? 'HSTS missing in production' : 'HSTS is sent in production only (this process is not production)',
        ],
        remediation: 'Keep helmet() mounted first with the configuration in app.js.',
      })

      const evil = 'https://evil.example'
      const pre = await P.send('/api/auth/login', { method: 'OPTIONS', headers: { Origin: evil, 'Access-Control-Request-Method': 'POST' } })
      const good = env.clientUrls[0]
      const preOk = await P.send('/api/auth/login', { method: 'OPTIONS', headers: { Origin: good, 'Access-Control-Request-Method': 'POST' } })
      const evilAllowed = pre.headers.get('access-control-allow-origin')
      const wild = env.clientUrls.some((u) => u.includes('*'))
      const insecure = env.isProd && env.clientUrls.some((u) => !u.startsWith('https://'))
      add({
        id: 'cors.config',
        category: 'API security',
        title: 'CORS allows only configured origins',
        severity: 'high',
        component: 'server/src/app.js, CLIENT_URL',
        status: evilAllowed || wild || insecure ? STATUS.FAIL : preOk.headers.get('access-control-allow-origin') === good ? STATUS.PASS : STATUS.WARNING,
        evidence: [
          `Allowed origins (CLIENT_URL): ${env.clientUrls.join(', ')}`,
          evilAllowed ? `Preflight from ${evil} was allowed (${evilAllowed})` : `Preflight from ${evil} got no Access-Control-Allow-Origin`,
          `Preflight from ${good}: Access-Control-Allow-Origin=${preOk.headers.get('access-control-allow-origin') || 'none'}, credentials=${preOk.headers.get('access-control-allow-credentials') || 'false'}`,
          'CORS only controls which sites can read responses; authorization is enforced separately on every route',
        ],
        remediation: 'List exact https origins in CLIENT_URL; never use *.',
      })

      const missingRoute = await P.send('/api/__audit_missing__')
      const malformed = await P.send('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"identifier": ' })
      const leaky = (r) => /\bat \S+:\d+|node_modules|Unexpected token|SyntaxError|stack/i.test(r.text)
      const leaks = [missingRoute, malformed].filter(leaky)
      const masked = await new Promise((resolve) => {
        const res = { statusCode: 0, status(c) { this.statusCode = c; return this }, json(b) { resolve({ code: this.statusCode, body: b }) } }
        const prev = console.error
        console.error = () => {}
        try {
          errorHandler(new Error('internal-detail-xyz at db.js:12'), { id: 'audit', method: 'GET', path: '/' }, res, () => {})
        } finally {
          console.error = prev
        }
      })
      add({
        id: 'errors.safe',
        category: 'Error handling',
        title: 'Errors never leak internals',
        severity: 'medium',
        component: 'server/src/middleware/error.js',
        status: leaks.length || JSON.stringify(masked.body).includes('internal-detail') || malformed.status !== 400 ? STATUS.FAIL : STATUS.PASS,
        evidence: [
          `Unknown route → ${missingRoute.status} ${JSON.stringify(missingRoute.body)}`,
          `Malformed JSON → ${malformed.status} ${JSON.stringify(malformed.body)}`,
          `Unexpected exception → ${masked.code} ${JSON.stringify(masked.body)}`,
        ],
        remediation: 'Return only messages written for users; log details server-side.',
      })

      const forged = jwt.sign({ sub: '000000000000000000000000', role: 'superadmin', v: 0, sid: 'x' }, 'not-the-real-secret', { issuer: 'gavyora-api', audience: 'gavyora' })
      const results = [
        ['GET /api/account/wallet without a token', await P.send('/api/account/wallet'), 401],
        ['GET /api/admin/stats without a token', await P.send('/api/admin/stats'), 401],
        ['GET /api/security/audit without a token', await P.send('/api/security/audit'), 401],
        ['GET /api/admin/stats with a forged superadmin token', await P.send('/api/admin/stats', { headers: { Authorization: `Bearer ${forged}` } }), 401],
        ['POST /api/auth/login with {"$gt": ""} as identifier', await P.send('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: { $gt: '' }, password: 'x' }) }), 400],
        ['POST /api/account/addresses with a session cookie from https://evil.example', await P.send('/api/account/addresses', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: evil, Cookie: 'gv_at=probe' }, body: '{}' }), 403],
      ]
      const wrong = results.filter(([, r, want]) => r.status !== want)
      add({
        id: 'authz.probes',
        category: 'Authentication & authorization',
        title: 'Unauthenticated, forged, injected and cross-site requests are rejected',
        severity: 'critical',
        component: 'server/src/middleware',
        status: wrong.length ? STATUS.FAIL : STATUS.PASS,
        evidence: results.map(([label, r, want]) => `${label} → ${r.status} (expected ${want})`),
        remediation: 'Check the middleware order in app.js and the guards on the failing route.',
      })
    }

    // ── Website (static configuration) ──
    {
      const vercel = path.join(ROOT, 'client', 'vercel.json')
      const vite = path.join(ROOT, 'client', 'vite.config.js')
      const v = fs.existsSync(vercel) ? fs.readFileSync(vercel, 'utf8') : ''
      const cspPlugin = fs.existsSync(vite) && /Content-Security-Policy/.test(fs.readFileSync(vite, 'utf8'))
      const want = ['Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy', 'Content-Security-Policy']
      const missing = want.filter((k) => !v.includes(k))
      add({
        id: 'headers.web',
        category: 'API security',
        title: 'Website security headers and Content Security Policy',
        severity: 'medium',
        component: 'client/vercel.json, client/vite.config.js',
        status: !v ? STATUS.WARNING : missing.length || !cspPlugin ? STATUS.WARNING : STATUS.PASS,
        evidence: [
          v ? (missing.length ? `vercel.json is missing: ${missing.join(', ')}` : `vercel.json sets ${want.join(', ')}`) : 'client/vercel.json not found',
          cspPlugin ? 'Production builds also embed a CSP <meta> tag (vite.config.js)' : 'No CSP in the production build',
          'Static check only: confirm the headers on the deployed site with your browser dev tools or securityheaders.com',
        ],
        remediation: 'Serve the website with the headers in client/vercel.json (or the equivalent on your host).',
      })
    }

    // ── Dependencies ──
    {
      let report = null
      try {
        report = JSON.parse(fs.readFileSync(DEPENDENCY_REPORT, 'utf8'))
      } catch {
        /* none yet */
      }
      if (!report) {
        add({ id: 'deps.audit', category: 'Dependencies', title: 'No known vulnerable dependencies', severity: 'high', component: 'package-lock.json (root, server, client)', status: STATUS.NOT_CHECKED, evidence: ['No dependency audit report yet'], remediation: 'Run npm run security:deps in server/ (needs internet access).' })
      } else {
        const ageDays = (Date.now() - new Date(report.generatedAt).getTime()) / 86400000
        const totals = report.packages.reduce((t, p) => {
          for (const k of ['low', 'moderate', 'high', 'critical']) t[k] += p.counts?.[k] || 0
          return t
        }, { low: 0, moderate: 0, high: 0, critical: 0 })
        const failed = report.packages.filter((p) => p.error)
        add({
          id: 'deps.audit',
          category: 'Dependencies',
          title: 'No known vulnerable dependencies',
          severity: 'high',
          component: 'package-lock.json (root, server, client)',
          status: totals.high || totals.critical ? STATUS.FAIL : failed.length ? STATUS.NOT_CHECKED : totals.low || totals.moderate || ageDays > 7 ? STATUS.WARNING : STATUS.PASS,
          evidence: [
            ...report.packages.map((p) => (p.error ? `${p.name}: audit failed (${p.error})` : `${p.name}: ${p.counts.critical} critical, ${p.counts.high} high, ${p.counts.moderate} moderate, ${p.counts.low} low`)),
            `npm audit run ${new Date(report.generatedAt).toLocaleString('en-IN')}${ageDays > 7 ? ' (older than 7 days, re-run it)' : ''}`,
          ],
          remediation: 'Run npm audit fix in the affected package; review breaking upgrades by hand. Re-run npm run security:deps.',
          dependencies: { generatedAt: report.generatedAt, totals, packages: report.packages },
        })
      }
    }
  } finally {
    await P?.close()
  }

  const count = (s) => checks.filter((c) => c.status === s).length
  const summary = { pass: count(STATUS.PASS), warning: count(STATUS.WARNING), fail: count(STATUS.FAIL), notChecked: count(STATUS.NOT_CHECKED), total: checks.length }
  return {
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    environment: env.nodeEnv,
    overall: summary.fail ? STATUS.FAIL : summary.warning || summary.notChecked ? STATUS.WARNING : STATUS.PASS,
    summary,
    checks,
    note: 'Automated checks cannot prove the application is secure. Results depend on correct deployment, configuration, patching and testing.',
  }
}
