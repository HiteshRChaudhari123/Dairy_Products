# Security guide

How Gavyora protects accounts, data and payments, how to check it, and what to do before and after going live.

> No automated check can prove an application is secure. Protection depends on correct deployment and configuration,
> keeping dependencies patched, and re-running the audit and tests after every change.

## What is in place

| Area | Control | Where |
|---|---|---|
| Secrets | All secrets come from `server/.env` (git-ignored). The server validates them on start and **refuses to start in production** if JWT secrets are missing, short, placeholders or identical, `MONGO_URI` is missing, `CLIENT_URL` is not exact `https` origins, or the owner password is a demo value. Only `VITE_` values reach the browser, and none are secret. | `server/src/config/env.js` |
| Passwords | bcrypt (cost 12), 8–72 characters (admins 12+), never returned by the API. | `models/User.js` |
| Login | Generic error for wrong password and unknown account (same timing); 10 failed logins per IP per 15 min; per-account lock for 15 min after 10 failures. | `routes/auth.js`, `middleware/rateLimit.js` |
| Sessions | 15-minute access token + 7-day refresh token in `HttpOnly`, `SameSite`, `Secure` (production) cookies. The refresh cookie is scoped to `/api/auth`. Refresh tokens **rotate** on every use; replaying an old one revokes the whole session. Logout revokes the session server-side; "Sign out everywhere", a password change, a reset or a block revoke every session at once. Tokens are never put in `localStorage`, and the website never receives them in JSON (only the mobile app does, with `X-Client-Type: mobile`). | `middleware/auth.js`, `models/auth.js` |
| Password reset | 32-byte random token, stored only as a SHA-256 hash, valid 30 minutes, single use; the response is the same whether or not the email exists. | `routes/auth.js` |
| Phone OTP | `crypto.randomInt`, stored hashed, 5-minute expiry, burned after 5 wrong guesses, 30 s resend cool-down; no account is created until the code is verified. | `routes/auth.js` |
| Authorization | Every non-public route runs `protect`; staff routes run `allow(role)` and `can(permission)` on the server; customer routes filter by `req.user._id`; delivery partners see only their own orders and never the customer's delivery OTP. The audit verifies this for every route. | `routes/*`, `security/audit.js` |
| CSRF | Cookie-authenticated writes must come from an origin in `CLIENT_URL`. | `middleware/security.js` |
| Input | Zod schemas with length limits on every body; query strings become flat strings (no `?a[$ne]=`); bodies with `$`, `.` or `__proto__` keys are rejected; Mongo `strictQuery`; admin-entered links and images must be site paths or `https://` (no `javascript:`). | routes, `middleware/security.js` |
| XSS | React escapes output; no `dangerouslySetInnerHTML`; CMS pages are plain text; the production build ships a strict CSP (`script-src 'self'` plus the hash of the one inline script). | `client/vite.config.js` |
| Headers | API: helmet with `default-src 'none'`, `frame-ancestors 'none'`, nosniff, no-referrer, HSTS in production, no `X-Powered-By`, `Cache-Control: no-store` on personal data. Website: `client/vercel.json`. | `server/src/app.js` |
| CORS | Exact origins from `CLIENT_URL` with credentials; never `*`. CORS is not used for authorization. | `server/src/app.js` |
| Rate limits | Global 300/min/IP; login, sign-up, OTP, reset, refresh, orders, wallet, reports and the audit have their own limits; consistent `429 {code: "RATE_LIMITED"}`. | `middleware/rateLimit.js` |
| Errors and logs | One error handler; users never see stack traces or database errors (500s return a request id); logs are JSON with passwords, tokens, OTPs, cookies and connection-string passwords redacted. 30 s request timeout, 200 kb body limit. | `middleware/error.js`, `utils/logger.js` |
| Payments | Razorpay signatures verified with timing-safe comparison; the webhook only marks an order paid if the amount and currency match exactly; a payment can't be verified twice. | `routes/orders.js`, `utils/razorpay.js` |
| Production data | Demo accounts (published passwords) are never loaded in production; an empty production database gets only the owner account. | `server/src/index.js`, `seed.js` |

## Checking it

```bash
cd server
npm test                 # automated security, billing and subscription tests (in-memory database, no network)
npm run security:deps    # npm audit for root, server and client → server/security-reports/
npm run security:audit   # configuration + route + probe audit; exits 1 on any FAIL (use in CI)
```

The super admin panel has **Security audit** (`/superadmin/security`), which runs the same audit against the live
API process and shows each check as **PASS**, **WARNING**, **FAIL** or **NOT CHECKED**, with its evidence and fix.
The probes only target a private copy of the API on 127.0.0.1; nothing is sent to the public site.

## Deploying

1. **API (Render/Railway):** `NODE_ENV=production`, every variable from `server/.env.example`, `TRUST_PROXY=1`. Start with `npm start`.
   Install with `npm ci --omit=dev` (the in-memory database and test tools are dev-only).
2. **Website (Vercel):** set `VITE_API_URL` to the API's `https://` URL **before building** (it goes into the CSP), deploy `client/` with `client/vercel.json`.
3. Put the API on a subdomain of the website (e.g. `api.gavyora.com`) and keep `COOKIE_SAMESITE=lax`. Use `none` only if the domains are unrelated.
4. **MongoDB Atlas:** a database user with `readWrite` on the Gavyora database only (not `atlasAdmin`); IP access list limited to your host's egress IPs; continuous backups on; TLS is on by default.
5. Run `npm run security:audit` with the production environment and fix every FAIL before launch. After launch, open `/superadmin/security` and run it again.
6. Check the live site's headers in the browser dev tools (or securityheaders.com).
7. More than one API instance? Switch the rate-limit stores to a shared store (e.g. `rate-limit-redis`), see `middleware/rateLimit.js`.

## Rotating secrets

Rotate on a schedule (for example every 6 months), when someone with access leaves, and **immediately** if a secret may have leaked (committed, pasted in chat, in a screenshot or log).

| Secret | How to rotate | Effect |
|---|---|---|
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Generate new values (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`), update the host's environment, restart. | Everyone is signed out and logs in again. |
| `MONGO_URI` password | Atlas → Database Access → edit user → new password; update `MONGO_URI`; restart; check the old one no longer works. | Brief restart. |
| Razorpay keys | Razorpay dashboard → API Keys → regenerate; update both variables; restart. Webhook: set a new secret in the dashboard and `RAZORPAY_WEBHOOK_SECRET` at the same time. | Payments started with the old key fail; ask customers to retry. |
| Owner / admin password | Log in → change password (signs out all other sessions). For a lost password use "Forgot password". | Other sessions end. |

If a secret was ever committed to git, rotating it is mandatory; deleting the commit is not enough because copies of the history may exist.

## Known limitations and follow-ups

- **SMS and email are not connected yet** (Phase 10). Until then OTPs and reset links only appear in development; in production, users cannot reset passwords by email or log in by OTP until a provider (MSG91/Twilio, Resend/SMTP) is added.
- **Rate limits are per process** (in-memory). Use a shared store when scaling out.
- **Content Security Policy:** `style-src` allows `'unsafe-inline'` (React style attributes and the toast library need it); scripts are fully locked down.
- **KYC documents** are not uploaded yet (only the last 4 digits of Aadhaar and bank account are stored). When uploads arrive (Cloudinary), use signed uploads, restrict file types and sizes, and keep documents private.
- Registration says when an email is already registered. That is common practice, but it lets someone check whether an email has an account.
- The audit's ownership check is static (the handler must use `req.user`); the cross-user tests cover the main routes. Add a test for every new customer route.
