# Gavyora: farm-fresh dairy e-commerce (MERN)

One website, four panels: **Customer store**, **Delivery partner**, **Admin**, **Super admin**.
After login, the user's role decides which panel they see. The full product plan is in [GAVYORA_BLUEPRINT.md](GAVYORA_BLUEPRINT.md).

```
Dairy/
├── server/   Express + MongoDB (Mongoose) API
└── client/   React 19 + Vite + Tailwind v4 + Redux Toolkit (RTK Query)
```

## Run it locally

Needs **Node.js 20+**.

```bash
npm run install:all   # installs root, server and client packages
npm run dev           # API on http://localhost:5000, website on http://localhost:5173
```

With no `MONGO_URI` set, the API starts a **built-in in-memory MongoDB** and fills it with demo data.
The first start downloads MongoDB (~780 MB, one time only). Data resets every restart.

### Demo logins (development only)

These accounts exist only in the development database. Production never loads demo data, and the login page hides this list in production builds.

| Role | Login | Password | Lands on |
|---|---|---|---|
| Customer | customer@gavyora.com (or OTP to 9876543210) | Customer@123 | `/` |
| Delivery partner | rider@gavyora.com | Delivery@123 | `/delivery` |
| Admin | admin@gavyora.com | Admin@123 | `/admin` |
| Super admin | owner@gavyora.com | Gavyora@123 | `/superadmin` |

Mobile OTP login works too: in development the OTP is shown on screen and printed in the API console.
Demo pincodes that we "deliver" to: 411001, 411002, 411004, 411005, 411011 (Central), 411038, 411045, 411052, 411057 (West), 411006, 411014, 411028, 411036 (East).

## Use a real database (MongoDB Atlas)

1. Create a free cluster at mongodb.com/atlas and copy the connection string.
2. Edit `server/.env` and set `MONGO_URI=...`, plus new random `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`.
3. `npm --prefix server run seed` creates the demo data and the super admin (add `-- --reset` to wipe first). With `NODE_ENV=production` it only creates the super admin.

## Deploy on Render (one service)

`render.yaml` sets up one Render web service that runs the API and serves the website from the same address
(first-party login cookies, nothing cross-site). In Render: **New → Blueprint** → this repository, then fill
`MONGO_URI`, `CLIENT_URL` (the service's own `https://` address), `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD`.
The same setup by hand: Web Service, root directory empty, build `npm install && npm run build`, start `npm start`,
`NODE_ENV=production` and the variables below. Use the Starter plan or above: the free plan sleeps, and the
background jobs (9 PM deliveries, renewals) don't run while it sleeps.

To host the website separately instead (e.g. Vercel with `client/vercel.json`), set `SERVE_CLIENT=false` on the API
and `VITE_API_URL` on the website.

## Environment variables (`server/.env`)

| Key | What it's for |
|---|---|
| `NODE_ENV` | `production` on every deployed server (turns off all development conveniences) |
| `MONGO_URI` | MongoDB Atlas connection string (empty = in-memory dev DB; required in production) |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Login tokens: two different random strings of 32+ characters (the server won't start in production otherwise) |
| `CLIENT_URL` | Exact website origin(s) allowed by CORS and the CSRF check, comma separated (`https://` in production) |
| `COOKIE_SAMESITE` | `lax` (default) when website and API share a site; `none` only for unrelated domains |
| `TRUST_PROXY` | Number of proxies in front of the API (default 1) |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` | First owner account (12+ characters, not a demo value) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Online payments. Empty = simulated in development, unavailable in production |

Website (`client/.env`): only `VITE_API_URL`. Anything prefixed `VITE_` is public, so never put secrets there.

## Website QA

With the API running in development (demo data) and the website built (`npm --prefix client run build && npm --prefix client run preview`):

```bash
cd client
npm run qa -- http://localhost:4173        # every route at 320/375/390/768/1024/1440px: overflow, console errors, titles, descriptions, broken links
npm run qa:flows -- http://localhost:4173  # menu, logo, 404, success/error messages, phone/email links, favicon, WebP images
npm run images                             # regenerate responsive WebP photos after replacing a product/category/banner JPG
```

Both QA scripts drive your installed Google Chrome (headless) through `playwright-core`.

## Security

See [SECURITY.md](SECURITY.md) for the full list of controls, deployment steps and secret rotation.

```bash
cd server
npm test                 # automated security tests
npm run security:deps    # dependency audit (root, server, client)
npm run security:audit   # configuration/route audit; exits 1 on any FAIL
```

The super admin can also run the audit from **Security audit** in the panel.

### Pre-launch security checklist

- [ ] `NODE_ENV=production`, new random `JWT_*` secrets, Atlas `MONGO_URI` with a least-privilege user, exact `https` `CLIENT_URL`
- [ ] `SUPERADMIN_PASSWORD` set to a unique 12+ character password, changed after first login, then removed from the host's environment
- [ ] `npm run security:audit` shows no FAIL with the production environment; `npm test` passes
- [ ] `npm run security:deps` shows no high/critical advisories
- [ ] HTTPS on both the website and API; `client/vercel.json` headers live (check in dev tools)
- [ ] Razorpay live keys and webhook secret set; webhook URL `https://<api>/api/payments/webhook`
- [ ] Atlas backups on and network access restricted
- [ ] SMS and email providers connected before relying on OTP login or password reset
- [ ] Monitoring/alerts on the API logs (500s include a request id)

## What's built

- **Customer:** home (banners, categories, deals, best sellers, subscribe & save, recently viewed, testimonials), category listing with filters/sort/pagination, search with autocomplete, product page (variants, reviews, pincode check, frequently bought together), cart + save for later, wishlist, 4-step checkout (address, slot, coupon, COD / wallet / Razorpay), order tracking with delivery OTP, cancel/return, printable invoice, **milk subscriptions** (daily/alternate/custom days, pause, vacation mode, change tomorrow's quantity), wallet, rewards & referral, addresses, support tickets, dark mode.
- **Delivery partner:** sign-up with KYC, approval flow, online toggle, today's deliveries, route to Google Maps, OTP-verified delivery, COD tracking, earnings.
- **Admin:** dashboard charts, orders (status, assignment, returns), tomorrow's milk sheet + subscription order generation, products (CRUD, CSV bulk upload), categories, inventory (stock, batches, expiry), customers (wallet adjust, block), delivery partner KYC & zones, coupons, banners, reviews moderation, support tickets, notification composer, sales reports (CSV/PDF).
- **Super admin:** everything above + admins with granular permissions, branches & delivery zones, global settings (fees, GST, slots, COD), financials, GST report, delivery payouts, CMS pages, audit logs, system health, security audit dashboard.
- **Background jobs** (IST, safe to rerun, one instance at a time): after the 9 PM cut-off, creates tomorrow's subscription orders (prepaid balance, else wallet, else COD; out-of-stock days are retried until midnight and the customer is warned once); membership renewals, grace periods and reminders; abandoned checkouts; low prepaid balance warnings; retries of failed email/SMS/push sends. Status and manual runs: Super admin → Billing settings.

## Next phases (see blueprint §7)

These need your API keys/accounts before they can be switched on:
Cloudinary image uploads · MSG91/Twilio SMS OTP · Google login · Google Maps (address pin + live tracking) · Socket.IO live tracking (order pages currently refresh every 15 s) · Firebase push · email (Resend/Nodemailer) · Hindi (i18next) · **Expo mobile app** (Phase 11) · deployment to Vercel + Render (Phase 13).
