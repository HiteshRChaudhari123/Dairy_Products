// Small shared helpers for the billing services: money, the delivery calendar, event history and admin scope.
import { SubscriptionEvent } from '../models/billing.js'
import { Zone } from '../models/misc.js'
import { addDays, dateKey } from '../utils/http.js'
import { logger } from '../utils/logger.js'

// ── Money: integer paise everywhere in billing; catalogue prices are rupees ──
export const toMinor = (rupees) => Math.round(Number(rupees || 0) * 100)
export const fromMinor = (minor) => Math.round(Number(minor || 0)) / 100
export const percentOf = (minor, pct) => Math.round((minor * (pct || 0)) / 100)
export const formatMinor = (minor, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100)

// ── Calendar (the server runs in IST; see config/env.js) ──
export const DAY_MS = 86400000
export const todayKey = (now = new Date()) => dateKey(now)
const toMinutes = (hhmm = '21:00') => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
export const pastCutoff = (cutoff, now = new Date()) => now.getHours() * 60 + now.getMinutes() >= toMinutes(cutoff)

/**
 * The first delivery date a customer can still change. Tomorrow's deliveries lock at the daily cut-off (default 9 PM),
 * because that is when they are generated and packed. `extraDays` adds a plan's notice period.
 */
export function firstEditableDate(billing, extraDays = 0, now = new Date()) {
  return dateKey(addDays(now, (pastCutoff(billing?.deliveryCutoff, now) ? 2 : 1) + extraDays))
}

/** Inclusive list of YYYY-MM-DD dates (capped). */
export function dateRange(from, to, max = 400) {
  const out = []
  for (let d = from; d <= to && out.length < max; d = dateKey(addDays(new Date(d + 'T00:00:00'), 1))) out.push(d)
  return out
}

export const addDaysKey = (key, n) => dateKey(addDays(new Date(key + 'T00:00:00'), n))

// ── Event history ──
export async function recordEvent({ entityType, entity, user, type, from, to, req, actorName, note, data }) {
  try {
    const actor = req?.user ? { id: req.user._id, name: req.user.name, role: req.user.role } : { name: actorName || 'system', role: 'system' }
    await SubscriptionEvent.create({ entityType, entity, user, type, from, to, actor, note, data })
  } catch (e) {
    logger.error('Could not record subscription event', { type, entity: String(entity), error: e })
  }
}

// ── Admin scope: admins can be limited to some delivery zones ──
/** Pincodes an admin may see, or null for "everything" (super admins and unscoped admins). */
export async function scopePincodes(user) {
  if (user.role === 'superadmin' || !user.scopeZones?.length) return null
  const zones = await Zone.find({ _id: { $in: user.scopeZones } }).select('pincodes')
  return [...new Set(zones.flatMap((z) => z.pincodes))]
}
