// Notifications: always stored in-app; email/SMS/push go through pluggable senders. A channel is only marked
// "delivered" when its provider confirms it; with no provider configured it is recorded as "skipped".
import { Notification } from '../models/billing.js'
import { Setting } from '../models/misc.js'
import User from '../models/User.js'
import { logger } from '../utils/logger.js'

export const TEMPLATES = {
  membership_activated: { title: 'Welcome to {{plan}}', body: 'Your membership is active until {{until}}. Your benefits apply automatically at checkout.' },
  membership_renewed: { title: '{{plan}} renewed', body: 'Thank you! Your membership now runs until {{until}}.' },
  renewal_upcoming: { title: '{{plan}} ends on {{until}}', body: '{{action}}' },
  renewal_failed: { title: 'We could not renew {{plan}}', body: '{{reason}} Your benefits continue until {{graceUntil}}. Add money to your wallet or renew manually.' },
  membership_expired: { title: '{{plan}} has ended', body: 'Renew any time to get your member benefits back.' },
  membership_cancelled: { title: '{{plan}} cancellation confirmed', body: 'Your membership ends on {{until}}.{{refund}}' },
  membership_updated: { title: 'Your membership was updated', body: '{{note}}' },
  payment_failed: { title: 'Payment not completed', body: 'We could not confirm your payment of {{amount}}. Nothing was activated. Please try again.' },
  subscription_activated: { title: 'Subscription started', body: 'Your {{plan}} deliveries start on {{start}}.' },
  subscription_paused: { title: 'Deliveries paused', body: 'No deliveries {{range}}.' },
  subscription_resumed: { title: 'Deliveries resumed', body: 'Your subscription is active again.' },
  subscription_changed: { title: 'Subscription updated', body: 'Your changes apply from {{from}}.' },
  subscription_cancelled: { title: 'Subscription cancelled', body: 'No further deliveries will be scheduled.{{refund}}' },
  balance_low: { title: 'Subscription balance is low', body: 'Your prepaid balance covers {{left}} more deliveries. Top up to keep them coming.' },
  delivery_skipped: { title: 'Delivery for {{date}} skipped', body: '{{reason}}' },
  delivery_at_risk: { title: 'Problem with your delivery for {{date}}', body: '{{reason}} We will keep trying until midnight. If it still cannot be scheduled, nothing is charged for that day.' },
  refund_update: { title: 'Refund {{status}}', body: '{{amount}}: {{reason}}' },
  delivery_upcoming: { title: 'Delivery tomorrow', body: '{{items}} arriving {{slot}} on {{date}}.' },
  delivery_missed: { title: 'We missed your delivery', body: 'Order {{orderNo}} could not be delivered: {{reason}}. Our team will arrange a redelivery or refund.' },
  delivery_completed: { title: 'Delivered', body: 'Order {{orderNo}} was delivered. Enjoy!' },
}

/**
 * External channel senders: async (user, { title, body, link }) => ({ ok: boolean, detail?: string }).
 * Register real providers here (e.g. MSG91/Twilio for sms, Resend for email) when credentials are available.
 */
export const senders = { email: null, sms: null, push: null }

const render = (text = '', vars = {}) => text.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? '').toString())

export const MAX_SEND_ATTEMPTS = 3

/** Try one external channel. Returns the channel record ({ channel, status, detail }); never throws. */
async function sendChannel(channel, user, message) {
  const send = senders[channel]
  const contact = channel === 'email' ? user.email : channel === 'sms' ? user.phone : null
  if (!send) return { channel, status: 'skipped', detail: 'Provider not configured' }
  if (user.preferences?.notifications === false) return { channel, status: 'skipped', detail: 'Customer turned notifications off' }
  if (channel !== 'push' && !contact) return { channel, status: 'skipped', detail: `No ${channel === 'email' ? 'email address' : 'phone number'}` }
  try {
    const r = await send(user, message)
    return { channel, status: r?.ok ? 'delivered' : 'failed', detail: r?.detail }
  } catch (e) {
    return { channel, status: 'failed', detail: String(e.message || e).slice(0, 200) }
  }
}

/**
 * Send a notification. Never throws (a failed notification must not break billing or delivery work).
 * `key` makes it idempotent: a second call with the same key does nothing and returns null.
 */
export async function notify(userId, type, vars = {}, { key, link, content, channels: only = ['email', 'sms', 'push'] } = {}) {
  try {
    if (key && (await Notification.exists({ key }))) return null
    const settings = await Setting.get()
    const custom = settings.billing?.notificationTemplates?.get?.(type)
    const base = TEMPLATES[type] || { title: type, body: '' }
    // `content` is ready-made text (admin announcements); everything else renders a template.
    const title = content ? content.title : render(custom?.title || base.title, vars)
    const body = content ? content.body : render(custom?.body || base.body, vars)
    const user = await User.findById(userId).select('email phone preferences')
    if (!user) return null
    const channels = [{ channel: 'in_app', status: 'delivered' }]
    for (const channel of ['email', 'sms', 'push'].filter((c) => only.includes(c))) channels.push({ ...(await sendChannel(channel, user, { title, body, link })), attempts: 1 })
    return await Notification.create({ user: userId, type, title, body, link, key, channels })
  } catch (e) {
    if (e?.code === 11000) return null // the same key was sent concurrently
    logger.error('Notification failed', { type, error: e })
    return null
  }
}

/**
 * Retry external channels that failed (provider error or outage), up to MAX_SEND_ATTEMPTS per channel, for
 * notifications from the last 24 hours. Older messages are left alone: a late "delivery tomorrow" SMS is worse
 * than none. Runs from the job runner, so only one instance retries at a time.
 */
export async function retryFailedNotifications(now = new Date()) {
  const since = new Date(now.getTime() - 24 * 3600 * 1000)
  const pending = await Notification.find({
    createdAt: { $gte: since },
    channels: { $elemMatch: { status: 'failed', attempts: { $lt: MAX_SEND_ATTEMPTS } } },
  }).limit(500)
  const out = { checked: pending.length, delivered: 0, failed: 0 }
  for (const n of pending) {
    const user = await User.findById(n.user).select('email phone preferences')
    if (!user) continue
    for (const c of n.channels) {
      if (c.status !== 'failed' || (c.attempts || 1) >= MAX_SEND_ATTEMPTS) continue
      const r = await sendChannel(c.channel, user, { title: n.title, body: n.body, link: n.link })
      Object.assign(c, { status: r.status, detail: r.detail, attempts: (c.attempts || 1) + 1, at: new Date() })
      out[r.status === 'delivered' ? 'delivered' : 'failed']++
    }
    await n.save()
  }
  return out
}
