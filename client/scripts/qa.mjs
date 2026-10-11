// Website QA crawl: drives the installed Google Chrome (headless) through every route at phone, tablet and desktop
// widths and reports horizontal overflow, console errors, failed requests, titles, meta descriptions and links that
// lead to the 404 page. Signs in with the development demo accounts, so run it against a local dev database only.
//
//   1. API:     npm --prefix server run dev            (in-memory DB with demo data)
//   2. Website: npm run build && npm run preview       (or npm run dev)
//   3. QA:      npm run qa -- http://localhost:4173
import fs from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = (process.argv[2] || 'http://localhost:4173').replace(/\/$/, '')
const WIDTHS = [320, 375, 390, 768, 1024, 1440]
const ACCOUNTS = {
  customer: ['customer@gavyora.com', 'Customer@123'],
  delivery: ['rider@gavyora.com', 'Delivery@123'],
  admin: ['admin@gavyora.com', 'Admin@123'],
  superadmin: ['owner@gavyora.com', process.env.QA_OWNER_PASSWORD || 'Gavyora@123'],
}

const api = async (path) => (await fetch(`${BASE}/api${path}`)).json()
const products = (await api('/products?limit=1')).items
const categories = await api('/categories')

const ADMIN = ['', 'orders', 'subscriptions', 'missed-deliveries', 'billing', 'memberships', 'plan-subscriptions', 'plans', 'payments', 'payments?tab=refunds', 'requests', 'subscription-reports', 'delivery-partners', 'products', 'products/new', 'categories', 'inventory', 'customers', 'coupons', 'banners', 'reviews', 'tickets', 'notifications', 'reports']
const ROUTES = {
  guest: [
    '/', '/categories', `/c/${categories[0].slug}`, '/search?q=milk', '/deals', `/p/${products[0].slug}`, '/cart', '/wishlist',
    '/subscriptions', '/plans', '/plans/gavyora-plus-monthly', '/plans/daily-milk-prepaid', '/support', '/login', '/register', '/forgot-password', '/reset-password', '/delivery/register',
    '/about', '/terms', '/privacy', '/refund-policy', '/shipping-policy', '/contact', '/careers', '/this-page-does-not-exist',
  ],
  customer: [
    '/account', '/account/orders', '/account/addresses', '/account/wallet', '/account/rewards', '/account/settings',
    '/subscriptions', '/subscriptions/new', '/checkout', '/plans/gavyora-plus-monthly', '/plans/daily-milk-prepaid',
    '/account/membership', '/account/billing', '/account/notifications', '/account/nope',
  ],
  delivery: ['/delivery', '/delivery/orders', '/delivery/map', '/delivery/earnings', '/delivery/profile', '/delivery/support', '/delivery/nope'],
  admin: [...ADMIN.map((p) => `/admin${p ? `/${p}` : ''}`), '/admin/nope'],
  superadmin: ['/superadmin', 'admins', 'zones', 'financials', 'settings', 'billing-settings', 'plans/new', 'billing', 'requests', 'cms', 'audit-logs', 'system', 'security'].map((p, i) => (i ? `/superadmin/${p}` : p)),
}

/** Elements that stick out past the right edge of the viewport and are not inside a horizontal scroller. */
const MEASURE = () => {
  const vw = document.documentElement.clientWidth
  const over = document.documentElement.scrollWidth - vw
  const culprits = []
  if (over > 0) {
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.right <= vw + 1) continue
      let p = el.parentElement
      let clipped = false
      while (p && p !== document.body) {
        const ox = getComputedStyle(p).overflowX
        if (ox !== 'visible' && p.getBoundingClientRect().right <= vw + 1) {
          clipped = true
          break
        }
        p = p.parentElement
      }
      if (clipped || getComputedStyle(el).position === 'fixed') continue
      const id = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 4).join('.') : '')
      culprits.push(`${id} → ${Math.round(r.right - vw)}px`)
      if (culprits.length > 5) break
    }
  }
  return { over, culprits }
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const report = { base: BASE, at: new Date().toISOString(), pages: [], brokenLinks: [], externalLinks: new Set() }
const internalLinks = new Map() // href → first page seen on

for (const [role, routes] of Object.entries(ROUTES)) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  if (role !== 'guest') {
    const [identifier, password] = ACCOUNTS[role]
    const res = await context.request.post(`${BASE}/api/auth/login`, { data: { identifier, password }, headers: { Origin: BASE } })
    if (!res.ok()) throw new Error(`login as ${role} failed: ${res.status()}`)
  }
  const page = await context.newPage()
  let errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)))
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`))
  page.on('response', (r) => {
    const u = r.url()
    const expected = (r.status() === 401 && /\/api\/auth\/(me|refresh)$/.test(u)) || (r.status() === 404 && /\/api\/products\//.test(u))
    if (r.status() >= 400 && !expected) errors.push(`HTTP ${r.status()} ${u.replace(BASE, '')}`)
  })

  for (const route of routes) {
    errors = []
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch((e) => errors.push(`goto: ${e.message}`))
    await page.waitForTimeout(300)
    const meta = await page.evaluate(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.content || '',
      notFound: !!document.querySelector('[data-page="not-found"]'),
      links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
      emptyButtons: [...document.querySelectorAll('button')].filter((b) => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.title).length,
    }))
    const widths = {}
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 800 })
      await page.waitForTimeout(150)
      const m = await page.evaluate(MEASURE)
      if (m.over > 0) widths[w] = m
    }
    for (const href of meta.links) {
      if (/^(https?:)?\/\//.test(href) || /^(mailto|tel|https?):/.test(href)) report.externalLinks.add(href.split('?')[0])
      else if (href.startsWith('/') && !internalLinks.has(href)) internalLinks.set(href, `${role} ${route}`)
    }
    report.pages.push({ role, route, title: meta.title, description: meta.description, notFound: meta.notFound, emptyButtons: meta.emptyButtons, overflow: widths, errors: [...new Set(errors)] })
    const flag = Object.keys(widths).length ? ` OVERFLOW@${Object.keys(widths).join(',')}` : ''
    console.log(`${role.padEnd(10)} ${route.padEnd(36)} ${meta.title.slice(0, 50).padEnd(50)}${flag}${errors.length ? ` ERRORS:${errors.length}` : ''}`)
  }

  // Every internal link found while signed in as this role must open a real page, not the 404.
  for (const [href, from] of internalLinks) {
    if (href.startsWith('/api/') || report.brokenLinks.some((b) => b.href === href)) continue
    if (from.split(' ')[0] !== role) continue
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(BASE + href, { waitUntil: 'networkidle' }).catch(() => {})
    const nf = await page.evaluate(() => !!document.querySelector('[data-page="not-found"]'))
    if (nf && !href.includes('does-not-exist') && !href.endsWith('/nope')) report.brokenLinks.push({ href, from })
  }
  await context.close()
}
await browser.close()

report.externalLinks = [...report.externalLinks].sort()
fs.mkdirSync('qa-report', { recursive: true })
fs.writeFileSync('qa-report/report.json', JSON.stringify(report, null, 2))

const titles = report.pages.filter((p) => !p.notFound).map((p) => p.title)
const dupTitles = [...new Set(titles.filter((t, i) => titles.indexOf(t) !== i))]
console.log('\n── Summary ──')
console.log(`Pages: ${report.pages.length} · widths: ${WIDTHS.join(', ')}`)
console.log(`Overflowing pages: ${report.pages.filter((p) => Object.keys(p.overflow).length).length}`)
for (const p of report.pages.filter((p) => Object.keys(p.overflow).length)) for (const [w, m] of Object.entries(p.overflow)) console.log(`  ${p.route} @${w}: +${m.over}px ${m.culprits.join(' | ')}`)
console.log(`Pages with console/network errors: ${report.pages.filter((p) => p.errors.length).length}`)
for (const p of report.pages.filter((p) => p.errors.length)) console.log(`  ${p.role} ${p.route}: ${p.errors.join(' || ')}`)
console.log(`Missing meta description: ${report.pages.filter((p) => !p.description).length}`)
console.log(`Titles used by more than one page: ${dupTitles.length ? dupTitles.join(' | ') : 'none'}`)
console.log(`Unlabelled icon buttons: ${report.pages.filter((p) => p.emptyButtons).map((p) => `${p.route}(${p.emptyButtons})`).join(', ') || 'none'}`)
console.log(`Broken internal links: ${report.brokenLinks.length ? report.brokenLinks.map((b) => `${b.href} (on ${b.from})`).join(', ') : 'none'}`)
console.log(`404 page shown for unknown URLs: ${report.pages.filter((p) => /does-not-exist|\/nope$/.test(p.route)).map((p) => `${p.route}=${p.notFound}`).join(', ')}`)
console.log(`External links (${report.externalLinks.length}): ${report.externalLinks.join(' ')}`)
