// Interaction checks in the installed Chrome (headless): menus, logo, 404, feedback messages, contact links, assets.
// Same setup as scripts/qa.mjs (local dev API with demo data). Usage: npm run qa:flows -- http://localhost:4173
import { chromium } from 'playwright-core'

const BASE = (process.argv[2] || 'http://localhost:4173').replace(/\/$/, '')
const OWNER_PASSWORD = process.env.QA_OWNER_PASSWORD || 'Gavyora@123'
const results = []
const check = async (name, fn) => {
  try {
    const detail = await fn()
    results.push(['PASS', name, detail || ''])
  } catch (e) {
    results.push(['FAIL', name, e.message.split('\n')[0]])
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const errors = []
const newPage = async (ctx) => {
  const page = await ctx.newPage()
  // The wrong-password check expects one 401 from the API; anything else is a real error.
  page.on('console', (m) => m.type() === 'error' && !/status of 401/.test(m.text()) && errors.push(m.text().slice(0, 160)))
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)))
  return page
}

// ── Phone-sized guest ──
const phone = await browser.newContext({ viewport: { width: 375, height: 800 }, hasTouch: true })
let page = await newPage(phone)
await page.goto(BASE + '/', { waitUntil: 'networkidle' })

await check('Theme script runs before the app (no CSP block)', async () => {
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'))
  expect(theme === 'light' || theme === 'dark', `data-theme=${theme}`)
  return `data-theme=${theme}`
})

await check('Mobile menu opens, traps nothing, closes with Escape and returns focus', async () => {
  const toggle = page.getByRole('button', { name: 'Open menu' })
  await toggle.click()
  const dialog = page.getByRole('dialog', { name: 'Menu' })
  await dialog.waitFor({ state: 'visible' })
  expect((await toggle.getAttribute('aria-expanded')) === 'true', 'aria-expanded not true')
  const focusedInside = await page.evaluate(() => !!document.activeElement?.closest('#mobile-menu'))
  expect(focusedInside, 'focus did not move into the menu')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const open = await page.evaluate(() => document.querySelector('#mobile-menu').getBoundingClientRect().right > 0)
  expect(!open, 'menu still on screen after Escape')
  const back = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  expect(back === 'Open menu', `focus went to ${back}`)
})

await check('Mobile menu links navigate and close the menu', async () => {
  await page.getByRole('button', { name: 'Open menu' }).click()
  await page.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Help & support' }).click()
  await page.waitForURL('**/support')
  await page.waitForTimeout(400)
  const open = await page.evaluate(() => document.querySelector('#mobile-menu').getBoundingClientRect().right > 0)
  expect(!open, 'menu stayed open')
  return page.url().replace(BASE, '')
})

await check('Logo links home (header) with an accessible name', async () => {
  await page.goto(BASE + '/contact', { waitUntil: 'networkidle' })
  await page.locator('header').getByRole('link', { name: 'Gavyora home' }).first().click() // the second one sits in the closed menu
  await page.waitForURL(BASE + '/')
})

await check('Logo links home (footer)', async () => {
  await page.goto(BASE + '/careers', { waitUntil: 'networkidle' })
  await page.locator('footer').getByRole('link', { name: 'Gavyora home' }).click()
  await page.waitForURL(BASE + '/')
})

await check('Unknown URL shows the 404 page with a working home button', async () => {
  await page.goto(BASE + '/no-such-page', { waitUntil: 'networkidle' })
  expect(await page.locator('[data-page="not-found"]').isVisible(), '404 not shown')
  expect((await page.title()).startsWith('Page not found'), `title: ${await page.title()}`)
  expect((await page.locator('meta[name="robots"]').getAttribute('content')).includes('noindex'), '404 is indexable')
  await page.getByRole('link', { name: 'Go to home page' }).click()
  await page.waitForURL(BASE + '/')
})

await check('Footer shows the current year', async () => {
  const text = await page.locator('footer').innerText()
  const year = String(new Date().getFullYear())
  expect(text.includes(`© ${year}`), `no © ${year}`)
  return `© ${year}`
})

await check('Footer has no placeholder (#) links and its email is a mailto: link', async () => {
  const hrefs = await page.locator('footer a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))
  expect(!hrefs.some((h) => !h || h === '#'), 'placeholder link found')
  expect(hrefs.some((h) => h.startsWith('mailto:')), 'no mailto link')
  return `${hrefs.length} links`
})

await check('Favicon and touch icon are served', async () => {
  for (const p of ['/favicon.svg', '/favicon-32.png', '/apple-touch-icon.png', '/robots.txt']) {
    const r = await page.request.get(BASE + p)
    expect(r.ok(), `${p} → ${r.status()}`)
  }
})

await check('Product cards use responsive WebP images with intrinsic size', async () => {
  await page.goto(BASE + '/search', { waitUntil: 'networkidle' })
  const img = page.locator('main .card img[srcset]').first()
  await img.scrollIntoViewIfNeeded()
  await page.waitForFunction(() => [...document.querySelectorAll('main .card img[srcset]')].some((i) => i.complete && i.currentSrc))
  const info = await img.evaluate((i) => ({ src: i.currentSrc, w: i.getAttribute('width'), h: i.getAttribute('height') }))
  expect(info.src.includes('.webp'), info.src)
  expect(info.w && info.h, 'missing width/height')
  return info.src.replace(BASE, '')
})

await check('Login with a wrong password shows an error and keeps the typed email', async () => {
  await page.goto(BASE + '/login?mode=password', { waitUntil: 'networkidle' })
  await page.getByLabel('Email or mobile number').fill('customer@gavyora.com')
  await page.getByLabel('Password', { exact: true }).fill('not-the-password')
  await page.getByRole('button', { name: 'Login' }).click()
  await page.getByText('Wrong email/phone or password').waitFor()
  expect((await page.getByLabel('Email or mobile number').inputValue()) === 'customer@gavyora.com', 'email cleared')
})
await phone.close()

// ── Signed-in customer (desktop) ──
const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await desk.request.post(BASE + '/api/auth/login', { data: { identifier: 'customer@gavyora.com', password: 'Customer@123' }, headers: { Origin: BASE } })
page = await newPage(desk)

await check('Wishlist button shows a success message', async () => {
  await page.goto(BASE + '/p/paneer', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /wishlist/ }).first().click()
  await page.getByText(/Saved to your wishlist|Removed from your wishlist/).waitFor()
})

await check('Saving a new address shows a success message', async () => {
  await page.goto(BASE + '/account/addresses', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Add new' }).click()
  const form = page.locator('#address-form')
  await form.getByLabel('Flat / house no., building').fill('QA House 1')
  await form.getByLabel('City').fill('Pune')
  await form.getByLabel('State').fill('Maharashtra')
  await form.getByLabel('Pincode').fill('411001')
  await page.getByRole('button', { name: 'Save address' }).click()
  await page.getByText('Address added').waitFor()
})
await desk.close()

// ── Contact links once the owner has set a phone number (test value in the throwaway dev database) ──
const owner = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const login = await owner.request.post(BASE + '/api/auth/login', { data: { identifier: 'owner@gavyora.com', password: OWNER_PASSWORD }, headers: { Origin: BASE } })
await check('Phone numbers become tel: links when a support number is configured', async () => {
  expect(login.ok(), `owner login ${login.status()}`)
  const set = await owner.request.put(BASE + '/api/admin/settings', { data: { supportPhone: '+91 99999 00000' }, headers: { Origin: BASE } })
  expect(set.ok(), `settings ${set.status()}`)
  page = await newPage(owner)
  await page.goto(BASE + '/contact', { waitUntil: 'networkidle' })
  const tel = await page.locator('main a[href^="tel:"]').first().getAttribute('href')
  const footerTel = await page.locator('footer a[href^="tel:"]').first().getAttribute('href')
  expect(tel === 'tel:+919999900000' && footerTel === tel, `${tel} / ${footerTel}`)
  return tel
})
await owner.request.put(BASE + '/api/admin/settings', { data: { supportPhone: '' }, headers: { Origin: BASE } })
await check('With no support number set, no phone link is shown', async () => {
  await page.goto(BASE + '/contact', { waitUntil: 'networkidle' })
  expect((await page.locator('a[href^="tel:"]').count()) === 0, 'tel link without a number')
})
await owner.close()
await browser.close()

for (const [s, n, d] of results) console.log(`${s === 'PASS' ? '✔' : '✖'} ${s}  ${n}${d ? `  (${d})` : ''}`)
console.log(`\n${results.filter((r) => r[0] === 'PASS').length}/${results.length} passed · console errors during flows: ${errors.length ? errors.join(' | ') : 'none'}`)
process.exit(results.some((r) => r[0] === 'FAIL') ? 1 : 0)
