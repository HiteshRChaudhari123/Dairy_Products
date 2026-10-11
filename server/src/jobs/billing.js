// Billing jobs: membership term ends, renewals, grace periods and retries, reminders, abandoned checkouts,
// low prepaid balances and audit-log retention. Each step is conditional on current state, so reruns are safe.
import cron from 'node-cron'
import { Membership, PaymentTransaction } from '../models/billing.js'
import { AuditLog, Setting } from '../models/misc.js'
import Subscription from '../models/Subscription.js'
import User from '../models/User.js'
import { DAY_MS, recordEvent, todayKey } from '../services/common.js'
import { setMembershipStatus, startRenewal } from '../services/memberships.js'
import { sendDueCampaigns } from '../services/campaigns.js'
import { notify, retryFailedNotifications } from '../services/notify.js'
import { perDeliveryMinor, setSubscriptionStatus } from '../services/productSubscriptions.js'
import { logger } from '../utils/logger.js'
import { expireUnpaidOnlineOrders } from '../utils/orders.js'
import { generateDueDeliveries } from './subscriptions.js'
import { pruneJobRuns, runJob } from './runner.js'

const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

/** Try a wallet renewal; true when it went through. */
async function tryWalletRenewal(m, attempt) {
  const user = await User.findById(m.user)
  if (!user || user.isBlocked) return { ok: false, reason: 'Account unavailable.' }
  try {
    const key = `auto-renew:${m._id}:${new Date(m.currentPeriodEnd).toISOString()}:${attempt}`
    const { tx } = await startRenewal({ membership: m, user, paymentMethod: 'wallet', idempotencyKey: key, auto: true })
    return tx.status === 'paid' ? { ok: true } : { ok: false, reason: tx.failureReason || 'Payment did not complete.' }
  } catch (e) {
    return { ok: false, reason: /wallet/i.test(e.message) ? 'Your wallet balance was too low.' : e.message }
  }
}

export async function runMembershipCycle(now = new Date()) {
  const { billing } = await Setting.get()
  const out = { ended: 0, renewed: 0, pastDue: 0, expired: 0, retried: 0, reminders: 0 }

  // 1. Terms that have ended.
  for (const m of await Membership.find({ status: { $in: ['active', 'cancellation_pending'] }, currentPeriodEnd: { $lte: now } })) {
    if (m.status === 'cancellation_pending') {
      m.cancelledAt = now
      await setMembershipStatus(m, 'cancelled', { type: 'ended', note: 'Cancelled at the end of the term' })
      out.ended++
      continue
    }
    const policy = m.terms.policies || {}
    let failure
    if (m.autoRenew && policy.renewal?.autoRenewAllowed !== false) {
      const r = await tryWalletRenewal(m, 0)
      if (r.ok) {
        out.renewed++
        continue
      }
      await recordEvent({ entityType: 'membership', entity: m._id, user: m.user, type: 'renewal_failed', note: r.reason })
      m.renewalAttempts = 1
      m.nextRetryAt = new Date(now.getTime() + (policy.retry?.intervalHours || 24) * 3600000)
      failure = r.reason
    }
    const grace = policy.gracePeriodDays || 0
    if (grace > 0) {
      m.graceUntil = new Date(m.currentPeriodEnd.getTime() + grace * DAY_MS)
      await setMembershipStatus(m, 'past_due', { type: 'term_ended', note: failure || 'Not renewed' })
      await notify(m.user, 'renewal_failed', { plan: m.terms.name, reason: failure || 'Your membership term has ended.', graceUntil: fmt(m.graceUntil) }, { key: `grace:${m._id}:${m.currentPeriodEnd.toISOString()}`, link: '/account/membership' })
      out.pastDue++
    } else {
      await setMembershipStatus(m, 'expired', { type: 'expired', note: failure || 'Not renewed' })
      await notify(m.user, 'membership_expired', { plan: m.terms.name }, { key: `expired:${m._id}:${m.currentPeriodEnd.toISOString()}`, link: '/plans' })
      out.expired++
    }
  }

  // 2. Grace periods: retry auto-renewal, expire when the grace period is over.
  for (const m of await Membership.find({ status: 'past_due' })) {
    if (m.graceUntil && m.graceUntil <= now) {
      await setMembershipStatus(m, 'expired', { type: 'expired', note: 'Grace period ended' })
      await notify(m.user, 'membership_expired', { plan: m.terms.name }, { key: `expired:${m._id}:${m.currentPeriodEnd.toISOString()}`, link: '/plans' })
      out.expired++
      continue
    }
    const retry = m.terms.policies?.retry || {}
    if (m.autoRenew && m.nextRetryAt && m.nextRetryAt <= now && m.renewalAttempts < (retry.attempts ?? 3)) {
      out.retried++
      const r = await tryWalletRenewal(m, m.renewalAttempts)
      if (!r.ok) {
        m.renewalAttempts += 1
        m.nextRetryAt = new Date(now.getTime() + (retry.intervalHours || 24) * 3600000)
        await m.save()
        await recordEvent({ entityType: 'membership', entity: m._id, user: m.user, type: 'renewal_failed', note: r.reason, data: { attempt: m.renewalAttempts } })
      } else out.renewed++
    }
  }

  // 3. Renewal reminders (one per reminder day per term).
  const days = [...(billing?.reminderDays || [7, 1])].sort((a, b) => a - b)
  if (days.length) {
    const horizon = new Date(now.getTime() + days.at(-1) * DAY_MS)
    for (const m of await Membership.find({ status: { $in: ['active', 'cancellation_pending'] }, currentPeriodEnd: { $gt: now, $lte: horizon } })) {
      const left = (m.currentPeriodEnd - now) / DAY_MS
      const d = days.find((x) => left <= x)
      if (d === undefined) continue
      const action =
        m.status === 'cancellation_pending'
          ? 'You cancelled, so it will not renew. Changed your mind? Undo the cancellation from My membership.'
          : m.autoRenew
            ? 'It renews automatically from your wallet. Keep enough balance to avoid interruption.'
            : 'Renew now to keep your member benefits.'
      const sent = await notify(m.user, 'renewal_upcoming', { plan: m.terms.name, until: fmt(m.currentPeriodEnd), action }, { key: `reminder:${m._id}:${m.currentPeriodEnd.toISOString()}:${d}`, link: '/account/membership' })
      if (sent) out.reminders++
    }
  }
  return out
}

/** Unpaid checkouts older than the configured window are abandoned (a late verified payment can still activate). */
export async function expireAbandonedCheckouts(now = new Date()) {
  const { billing } = await Setting.get()
  const cutoff = new Date(now.getTime() - (billing?.checkoutExpiryMinutes || 60) * 60000)
  const stale = await PaymentTransaction.find({ status: 'created', createdAt: { $lt: cutoff } })
  for (const tx of stale) {
    const done = await PaymentTransaction.findOneAndUpdate({ _id: tx._id, status: 'created' }, { $set: { status: 'expired' }, $push: { history: { status: 'expired', note: 'Checkout abandoned' } } })
    if (!done) continue
    if (tx.purpose === 'membership' && tx.membership) {
      const m = await Membership.findById(tx.membership)
      if (m?.status === 'pending_payment') await setMembershipStatus(m, 'failed', { type: 'checkout_abandoned' })
    }
    if (tx.purpose === 'subscription_prepay' && tx.subscription) {
      const sub = await Subscription.findById(tx.subscription)
      if (sub?.status === 'pending_payment') await setSubscriptionStatus(sub, 'failed', { type: 'checkout_abandoned' })
    }
  }
  return { expired: stale.length }
}

/** Warn prepaid subscribers whose balance covers fewer than 3 deliveries. */
export async function lowBalanceReminders() {
  let sent = 0
  for (const sub of await Subscription.find({ status: 'active', billingMode: 'prepaid' })) {
    const each = perDeliveryMinor(sub)
    const left = each ? Math.floor(sub.prepaidBalanceMinor / each) : 0
    if (left >= 3) continue
    const n = await notify(sub.user, 'balance_low', { left }, { key: `lowbal:${sub._id}:${todayKey()}`, link: `/subscriptions/${sub._id}` })
    if (n) sent++
  }
  return { sent }
}

/** Delete audit logs older than the retention period (0 = keep forever). */
export async function applyAuditRetention(now = new Date()) {
  const { billing } = await Setting.get()
  const days = billing?.auditRetentionDays || 0
  if (!days) return { kept: 'forever' }
  const r = await AuditLog.deleteMany({ createdAt: { $lt: new Date(now.getTime() - days * DAY_MS) } })
  return { deleted: r.deletedCount }
}

export const JOBS = {
  'deliveries.generate': generateDueDeliveries,
  'memberships.cycle': runMembershipCycle,
  'checkouts.expire': expireAbandonedCheckouts,
  'orders.expire-unpaid': expireUnpaidOnlineOrders,
  'subscriptions.low-balance': lowBalanceReminders,
  'notifications.retry': retryFailedNotifications,
  'campaigns.send': sendDueCampaigns,
  'audit.retention': applyAuditRetention,
  'jobs.prune': pruneJobRuns,
}

/** Schedule every job in this process (times are IST). Each run is guarded by a lease, so several instances are fine. */
export function scheduleJobs() {
  const tz = { timezone: 'Asia/Kolkata' }
  const every = (expr, name) => cron.schedule(expr, () => runJob(name, JOBS[name]).catch((e) => logger.error(`Job ${name}`, { error: e })), tz)
  every('*/10 * * * *', 'deliveries.generate') // generates tomorrow's orders once the cut-off passes
  every('7 * * * *', 'memberships.cycle')
  every('*/15 * * * *', 'checkouts.expire')
  every('*/15 * * * *', 'orders.expire-unpaid')
  every('0 10 * * *', 'subscriptions.low-balance')
  every('*/20 * * * *', 'notifications.retry')
  every('*/5 * * * *', 'campaigns.send')
  every('30 3 * * *', 'audit.retention')
  every('45 3 * * 0', 'jobs.prune')
}
