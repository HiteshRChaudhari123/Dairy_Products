# Gavyora — Dairy E‑Commerce Platform Blueprint (MERN + Mobile)

> Paste this file to Claude (Opus 5.5) at the start of each session: *"Read GAVYORA_BLUEPRINT.md and do Phase N."*

---

## 1. Brand

| | |
|---|---|
| **Name** | **Gavyora** (Gavya = pure cow products in Sanskrit + "ora" = glow/dawn → *"the fresh glow of pure milk"*) |
| **Tagline** | *Farm‑fresh. Every morning.* |
| **Domains** | `gavyora.com` and `gavyora.in` — both were unregistered on 28 Sep 2026 (RDAP check). **Buy both today**, plus `gavyora.co.in`. |
| **Backups** (also free on both .com + .in) | MilkGrove, Kshirva, Dudhvan |

**To avoid future problems:**
1. Buy domains (GoDaddy / Namecheap / Hostinger), enable auto‑renew + domain lock.
2. Search the name at the IP India trademark site (ipindia.gov.in → Trademark Search, Class 29 = dairy, Class 35 = online retail) and file a trademark application.
3. Grab the same handle on Instagram, Facebook, X, YouTube, WhatsApp Business.
4. Register the business (Udyam/MSME + GST) and get an **FSSAI licence** (mandatory for selling dairy online in India).

---

## 2. Design system

### Colors (nature + milk)
| Token | Hex | Use |
|---|---|---|
| `primary` Meadow Green | `#2E7D32` | Buttons, header, links |
| `primary-dark` Forest | `#1B5E20` | Hover, footer |
| `secondary` Butter Yellow | `#F9C74F` | Offers, badges, highlights |
| `accent` Sky Blue | `#4FC3F7` | Info, delivery tracking |
| `background` Milk Cream | `#FFFDF7` | Page background |
| `surface` White | `#FFFFFF` | Cards |
| `text` Charcoal | `#263238` | Body text |
| `muted` | `#78909C` | Secondary text |
| `success` / `warning` / `error` | `#43A047` / `#FB8C00` / `#E53935` | Status |

Dark mode: background `#121A14`, surface `#1C261E`, text `#ECEFE9`, primary `#66BB6A`.

### Fonts (Google Fonts, free)
- **Headings:** `Poppins` (600/700) — modern, friendly
- **Body:** `Inter` (400/500) — very readable on mobile
- **Hindi/regional (optional):** `Noto Sans Devanagari`

### Style
Rounded corners (12–16px), soft shadows, leaf/milk‑drop illustrations, real farm photos, lots of white space. Mobile‑first, breakpoints 480 / 768 / 1024 / 1280px.

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| Frontend web | **React 18 + Vite**, Tailwind CSS, React Router, Redux Toolkit + RTK Query, React Hook Form + Zod, Framer Motion, Recharts |
| Mobile app | **React Native (Expo)** — reuses your JS/React skills and the same API |
| Backend | **Node.js + Express**, JWT (access + refresh tokens), bcrypt, Joi/Zod validation, Helmet, rate‑limit, CORS |
| Database | **MongoDB Atlas** + Mongoose |
| Realtime | **Socket.IO** (live order status, delivery tracking) |
| Payments | **Razorpay** (UPI, cards, wallets, COD) |
| Images | Cloudinary |
| SMS/OTP | MSG91 or Twilio; Email: Nodemailer / Resend |
| Push notifications | Firebase Cloud Messaging (via Expo Notifications) |
| Maps | Google Maps API (address, live tracking, delivery zones) |
| Jobs | node-cron / BullMQ + Redis (daily subscription orders) |
| Hosting | Frontend → Vercel; Backend → Render / Railway / AWS; DB → Atlas |
| App stores | Expo EAS Build → Google Play + Apple App Store |

**One app, four roles:** a single website and a single mobile app. After login, the user's `role` (`customer`, `delivery`, `admin`, `superadmin`) decides which panel/dashboard they see. Admin panels are protected routes (`/admin`, `/superadmin`, `/delivery`).

---

## 4. Features by panel

### 🛒 Customer (Amazon/Flipkart‑style)
- **Home:** hero banners carousel, categories, deals of the day, best sellers, "Subscribe & Save", recently viewed, testimonials
- **Categories:** Milk, Curd, Paneer, Ghee, Butter, Cheese, Buttermilk/Lassi, Ice cream, Sweets, Organic/A2
- **Search:** autocomplete, filters (price, fat %, brand, rating, veg/organic, in‑stock), sort (popularity, price, newest)
- **Product page:** image gallery + zoom, variants (500ml / 1L / 5L), price + MRP + discount %, stock status, delivery pincode check, ratings & reviews with photos, Q&A, similar products, "frequently bought together"
- **Milk subscription** ⭐ (key dairy feature): daily / alternate days / custom days, pause/resume, vacation mode, change quantity for tomorrow, morning slot choice
- **Cart & Wishlist**, save for later
- **Checkout:** multiple addresses with map pin, delivery slot, coupons, wallet, Razorpay/UPI/COD
- **Orders:** history, live tracking on map, cancel/return, invoice PDF download, reorder
- **Wallet:** prepaid balance for subscriptions, cashback, refunds
- **Account:** profile, addresses, notifications, referral code, loyalty points, language, dark mode
- **Support:** help center/FAQ, chat/WhatsApp, raise ticket
- Login with **mobile OTP**, email/password, Google

### 🚚 Delivery Partner
- Registration + KYC upload (Aadhaar, licence, bank details) → admin approval
- Online/offline toggle
- Today's route: list + map, optimized order of stops
- Accept/reject orders, navigate (Google Maps), call customer
- Mark picked up → out for delivery → delivered (with OTP or photo proof)
- Collect COD, bottle/crate return tracking
- Earnings: daily/weekly, payout history, incentives
- Ratings from customers

### 🧑‍💼 Admin (store/operations manager)
- Dashboard: today's orders, revenue, subscriptions, low stock, charts
- Products: add/edit/delete, variants, images, bulk upload (CSV), categories
- Inventory: stock levels, low‑stock alerts, batch/expiry dates (important for dairy)
- Orders: list/filter, change status, assign delivery partner, refunds, print invoices
- Subscriptions: tomorrow's milk sheet (quantity per area), pause requests
- Customers: list, details, wallet adjustments, block
- Delivery partners: approve KYC, assign zones, performance
- Coupons & offers, banners, push notification campaigns
- Reviews moderation, support tickets
- Reports: sales, product‑wise, area‑wise; export to Excel/PDF

### 👑 Super Admin (owner)
Everything Admin can do, plus:
- Create/manage admins and **role permissions** (RBAC)
- Multiple branches/warehouses and delivery zones (pincodes)
- Global settings: tax/GST, delivery charges, min order value, time slots, payment keys
- Financials: revenue, profit, payouts to delivery partners, GST reports
- Audit logs (who changed what), system health
- CMS: About, Terms, Privacy, Refund policy pages

---

## 4A. Every page & tab (sitemap)

### Customer — website header / app bottom tabs
**Header (web):** Logo · Deliver‑to pincode · Search bar · Categories menu · Subscriptions · Offers · Wallet · Wishlist ♡ · Cart 🛒 · Account ▾ (login/profile)
**Bottom tabs (app + mobile web):** Home · Categories · Subscriptions · Cart · Account

| Route | Page |
|---|---|
| `/` | Home |
| `/categories`, `/c/:slug` | All categories, category listing (filters + sort + pagination) |
| `/search?q=` | Search results |
| `/p/:slug` | Product detail |
| `/deals` | Today's deals & offers |
| `/cart` | Cart + save for later |
| `/wishlist` | Wishlist |
| `/checkout` | Address → Slot → Payment → Review (4 steps) |
| `/order-success/:id` | Confirmation |
| `/subscriptions`, `/subscriptions/new`, `/subscriptions/:id` | My subscriptions, create, manage (calendar, pause, vacation) |
| `/account` | Account hub with tabs: **Profile · Orders · Subscriptions · Addresses · Wallet · Rewards & Referral · Notifications · Settings (language, dark mode) · Logout** |
| `/account/orders/:id` | Order detail + live tracking + invoice + return |
| `/support`, `/support/tickets/:id` | Help center, FAQ, tickets, chat |
| `/login`, `/register`, `/forgot-password`, `/verify-otp` | Auth |
| `/about`, `/contact`, `/privacy`, `/terms`, `/refund-policy`, `/shipping-policy` | Static/CMS |
| `*` | 404 page |

**Footer:** About · Contact · FAQ · Policies · FSSAI & GST no. · App store badges · Social links · Newsletter

### Delivery partner — `/delivery` (app bottom tabs: Today · Map · Earnings · Profile)
Tabs: **Dashboard (online toggle, today's summary) · Today's Deliveries · Route Map · Order Detail (call, navigate, OTP/photo proof, COD) · Bottle/Crate Returns · Earnings & Payouts · Ratings · Profile & KYC · Support**
Also: `/delivery/register` (onboarding + KYC upload), "pending approval" screen.

### Admin — `/admin` (left sidebar; collapses to hamburger drawer on mobile)
Sidebar tabs: **Dashboard · Orders · Subscriptions (tomorrow's milk sheet) · Products · Categories · Inventory (stock, batches, expiry) · Customers · Delivery Partners (KYC approvals, zones) · Coupons & Offers · Banners · Reviews · Support Tickets · Notifications (push/SMS campaigns) · Reports · Profile**

### Super admin — `/superadmin` (same sidebar layout as Admin + extra tabs)
All Admin tabs, plus: **Admins & Roles (RBAC permissions) · Branches/Warehouses · Delivery Zones (pincodes, map) · Financials (revenue, profit, GST) · Delivery Payouts · Global Settings (tax, delivery fee, min order, slots, payment keys) · CMS Pages · Audit Logs · System Health**

---

## 4B. Responsive rules
- **Mobile first**, breakpoints `sm 480 · md 768 · lg 1024 · xl 1280`.
- Product grid: 2 columns on phones → 3 (md) → 4 (lg) → 5 (xl).
- Phones: sticky top search bar + **bottom tab bar**; filters open in a bottom sheet; product page has a sticky "Add to cart / Buy now" bar.
- Admin/super admin: sidebar on `lg+`, hamburger drawer below; tables turn into stacked cards on phones.
- Touch targets ≥ 44px, images lazy‑loaded (WebP), skeleton loaders while data loads.
- Test on 360px (small Android), 768px (tablet), 1440px (desktop).

---

## 5. Database models (MongoDB)
`User` (name, phone, email, password, role, isVerified, wallet, addresses[]) · `DeliveryPartner` (userId, kyc, zone, isOnline, location, earnings) · `Category` · `Product` (name, slug, category, images, variants[{size, price, mrp, stock, sku}], fat%, shelfLife, ratings) · `Cart` · `Wishlist` · `Order` (user, items, address, slot, payment, status timeline, deliveryPartner, otp) · `Subscription` (user, product, variant, qty, frequency, days[], startDate, pausedDates[], status) · `Payment` · `WalletTransaction` · `Coupon` · `Review` · `Banner` · `Zone` · `Ticket` · `Notification` · `AuditLog` · `Setting`

---

## 6. Folder structure
```
gavyora/
├── server/          # Express API
│   ├── src/config  models  controllers  routes  middleware  services  jobs  sockets  utils
│   └── .env
├── client/          # React web (all 4 panels)
│   └── src/app  features/{auth,products,cart,orders,subscription,admin,superadmin,delivery}
│       components  layouts  pages  hooks  theme
└── mobile/          # React Native Expo (all 4 panels)
```

---

## 7. Step‑by‑step build plan (prompts for Claude)

Do **one phase per session**. Test before moving on. Use git and commit after every phase.

**Phase 0 — Setup (you do this)**
Install Node.js LTS, Git, VS Code, MongoDB Compass. Create accounts: MongoDB Atlas, Cloudinary, Razorpay (test mode), Firebase, Google Cloud (Maps), MSG91, GitHub, Vercel, Render, Expo.

**Phase 1 — Project scaffold**
> "Read GAVYORA_BLUEPRINT.md. Create the monorepo with server (Express + Mongoose), client (React + Vite + Tailwind with the design tokens and fonts from section 2), and mobile (Expo). Add ESLint, Prettier, .env.example, and a README with run commands. Replace the default Vite App.jsx with the real layouts (customer header/footer/bottom tabs, delivery layout, admin/superadmin sidebar layout) and placeholder pages for every route in section 4A, following the responsive rules in 4B."

**Phase 2 — Auth & roles**
> "Build authentication: mobile OTP + email/password + Google login, JWT access/refresh tokens in httpOnly cookies, role‑based middleware (customer, delivery, admin, superadmin), and a seed script that creates the first super admin. Add login/register/forgot‑password pages on web with protected routes per role."

**Phase 3 — Products & categories**
> "Build Category and Product models with variants, Cloudinary image upload, admin CRUD APIs and admin UI pages, and customer pages: home, category listing with filters/sort/pagination, search with autocomplete, product detail page."

**Phase 4 — Cart, wishlist, checkout, payments**
> "Build cart, wishlist, address book with Google Maps pin, pincode serviceability check, delivery slots, coupons, and checkout with Razorpay (test mode) + COD + wallet. Verify payments server‑side with webhook signature."

**Phase 5 — Orders & tracking**
> "Build the order lifecycle (placed → confirmed → packed → out for delivery → delivered/cancelled/returned), invoice PDF, order history, cancel/return, and live status updates with Socket.IO."

**Phase 6 — Milk subscription**
> "Build the subscription system: daily/alternate/custom days, pause/resume, vacation mode, wallet auto‑debit, and a nightly cron job that generates next morning's orders and the admin 'tomorrow's milk sheet' grouped by zone."

**Phase 7 — Delivery partner panel**
> "Build the delivery partner registration with KYC, admin approval, online toggle, assigned orders list + map route, status updates with delivery OTP/photo proof, COD collection, live location via Socket.IO, and earnings page."

**Phase 8 — Admin panel**
> "Build the admin dashboard with Recharts (revenue, orders, top products), inventory with expiry/low‑stock alerts, order management and delivery assignment, customers, coupons, banners, reviews moderation, support tickets, and Excel/PDF report exports."

**Phase 9 — Super admin panel**
> "Build super admin: manage admins with granular permissions, branches and delivery zones, global settings (GST, delivery fee, slots, min order), financial reports, delivery payouts, audit logs, and CMS pages."

**Phase 10 — Extras**
> "Add ratings & reviews with photos, referral & loyalty points, notifications (email, SMS, push), support chat, dark mode, Hindi language (i18next), and SEO (meta tags, sitemap, schema.org Product markup)."

**Phase 11 — Mobile app**
> "Build the Expo React Native app using the same API: customer screens, delivery partner screens, and a lightweight admin view; push notifications with Expo Notifications; secure token storage; same theme."

**Phase 12 — Security, testing, performance**
> "Harden security: Helmet, rate limiting, input validation, mongo‑sanitize, CORS whitelist, secrets in env. Add Jest + Supertest API tests and Playwright web tests. Optimize with lazy loading, image optimization, and MongoDB indexes."

**Phase 13 — Deploy**
> "Deploy: backend to Render, frontend to Vercel with custom domain gavyora.com + SSL, MongoDB Atlas production cluster, Razorpay live keys, GitHub Actions CI. Build Android/iOS with EAS and prepare Play Store / App Store listings."

---

## 8. Legal pages you need before launch
Privacy Policy, Terms & Conditions, Refund & Cancellation Policy, Shipping/Delivery Policy, Contact page with FSSAI number and GST number (required by Razorpay and app stores).
