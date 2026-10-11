// Page titles, meta descriptions, canonical URLs and social-sharing tags for a single-page app.
// Layouts set the defaults for each route (useRouteMeta, in a layout effect so they run first); pages that know more
// (a product, a category, a CMS page) refine them with usePageMeta in a normal effect, which runs afterwards.
import { useEffect, useLayoutEffect } from 'react'
import { matchPath, useLocation } from 'react-router-dom'

export const SITE = 'Gavyora'
const DEFAULT_DESCRIPTION = 'Farm-fresh milk, curd, paneer, ghee and more from partner farms, delivered to your door every morning. Subscribe, pause anytime.'

// [path pattern, title, description, indexable]. The first match wins, so specific patterns come first.
const STORE_ROUTES = [
  ['/', `${SITE} · Farm-fresh milk & dairy, delivered every morning`, DEFAULT_DESCRIPTION, true],
  ['/categories', 'All categories', 'Browse every Gavyora category: milk, curd, paneer, ghee, butter, cheese, lassi, ice cream, sweets and organic A2 dairy.', true],
  ['/c/:slug', 'Shop', 'Fresh dairy from our partner farms, delivered every morning.', true],
  ['/search', 'Search products', 'Search Gavyora milk, curd, paneer, ghee and more.', true],
  ['/deals', 'Deals of the day', "Today's offers on milk, ghee, paneer and more. Prices end at midnight.", true],
  ['/p/:slug', 'Product', DEFAULT_DESCRIPTION, true],
  ['/cart', 'Your cart', 'Review the items in your Gavyora cart.', false],
  ['/wishlist', 'Your wishlist', 'Products you saved for later.', false],
  ['/checkout', 'Checkout', 'Choose your address, delivery slot and payment.', false],
  ['/order-success/:id', 'Order placed', 'Your Gavyora order is confirmed.', false],
  ['/plans/payment/:id', 'Payment status', 'The status of your membership or subscription payment.', false],
  ['/plans/:slug', 'Plan details', 'Plan details, price breakdown and checkout.', true],
  ['/plans', 'Memberships & subscriptions', 'Gavyora memberships for savings on every order, and recurring dairy subscriptions on your schedule.', true],
  ['/account/membership', 'My membership', 'Your membership, benefits and renewal.', false],
  ['/account/billing', 'Billing & invoices', 'Membership and subscription payments, invoices and refunds.', false],
  ['/account/notifications', 'Notifications', 'Updates about your account.', false],
  ['/subscriptions/new', 'Start a subscription', 'Set up a daily, alternate-day or custom milk subscription.', false],
  ['/subscriptions/:id', 'Manage subscription', 'Change quantity, pause or set vacation mode.', false],
  ['/subscriptions', 'Milk subscriptions', 'Fresh milk at your door every morning. Choose your days, pause anytime and pay from your wallet.', true],
  ['/account/orders/:id', 'Order details', 'Track your order and download the invoice.', false],
  ['/account/orders', 'My orders', 'Your Gavyora order history.', false],
  ['/account/addresses', 'Saved addresses', 'Manage your delivery addresses.', false],
  ['/account/wallet', 'Gavyora wallet', 'Wallet balance and transactions.', false],
  ['/account/rewards', 'Rewards & referral', 'Loyalty points and your referral code.', false],
  ['/account/settings', 'Account settings', 'Dark mode, notifications and sign-in settings.', false],
  ['/account', 'My profile', 'Your Gavyora account.', false],
  ['/support/tickets/:id', 'Support ticket', 'Your conversation with Gavyora support.', false],
  ['/support', 'Help & support', 'Answers about delivery times, subscriptions, refunds and payments, and ways to reach our care team.', true],
  ['/faq', 'Help & support', 'Answers about delivery times, subscriptions, refunds and payments, and ways to reach our care team.', true],
  ['/login', 'Log in', 'Log in to Gavyora with your mobile number or email.', true],
  ['/register', 'Create an account', 'Create a Gavyora account to order fresh dairy and start a subscription.', true],
  ['/forgot-password', 'Forgot password', 'Reset your Gavyora password.', false],
  ['/reset-password', 'Set a new password', 'Choose a new Gavyora password.', false],
  ['/delivery/register', 'Become a delivery partner', 'Deliver fresh milk in your neighbourhood with flexible morning shifts and weekly payouts.', true],
  ['/about', 'About us', 'How Gavyora brings milk from local partner farms to your door every morning.', true],
  ['/terms', 'Terms & conditions', 'The terms for using Gavyora.', true],
  ['/privacy', 'Privacy policy', 'How Gavyora collects and uses your information.', true],
  ['/refund-policy', 'Refund & cancellation policy', 'How cancellations, returns and refunds work at Gavyora.', true],
  ['/shipping-policy', 'Delivery policy', 'Where and when Gavyora delivers.', true],
  ['/contact', 'Contact us', 'Reach the Gavyora care team for orders, subscriptions, bulk orders and partnerships.', true],
  ['/careers', 'Careers', 'Open roles at Gavyora in delivery, operations, farm quality, customer care and technology.', true],
]

function setTag(selector, create, attr, value) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = create()
    document.head.appendChild(el)
  }
  el.setAttribute(attr, value)
}

const metaName = (name) => () => Object.assign(document.createElement('meta'), { name })
const metaProp = (property) => () => {
  const m = document.createElement('meta')
  m.setAttribute('property', property)
  return m
}

/** Write title, description, canonical, Open Graph and robots tags. */
export function applyMeta({ title, description = DEFAULT_DESCRIPTION, index = true }) {
  const full = title?.includes(SITE) ? title : `${title} · ${SITE}`
  const url = window.location.origin + window.location.pathname
  document.title = full
  setTag('meta[name="description"]', metaName('description'), 'content', description)
  setTag('meta[name="robots"]', metaName('robots'), 'content', index ? 'index, follow' : 'noindex, nofollow')
  setTag('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' }), 'href', url)
  setTag('meta[property="og:title"]', metaProp('og:title'), 'content', full)
  setTag('meta[property="og:description"]', metaProp('og:description'), 'content', description)
  setTag('meta[property="og:url"]', metaProp('og:url'), 'content', url)
}

/** Defaults for the current store route. Call once in the store layout. */
export function useStoreRouteMeta() {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    const hit = STORE_ROUTES.find(([pattern]) => matchPath({ path: pattern, end: true }, pathname))
    if (hit) applyMeta({ title: hit[1], description: hit[2], index: hit[3] })
    else applyMeta({ title: 'Page not found', description: "This page doesn't exist.", index: false })
  }, [pathname])
}

/** Defaults for a dashboard panel page (never indexed). */
export function usePanelRouteMeta(title) {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    applyMeta({ title, description: `${SITE} ${title}`, index: false })
  }, [pathname, title])
}

/** Page-specific meta once the page knows it (e.g. the product name). Skips while title is empty. */
export function usePageMeta(title, description, index = true) {
  useEffect(() => {
    if (title) applyMeta({ title, description: description || undefined, index })
  }, [title, description, index])
}
