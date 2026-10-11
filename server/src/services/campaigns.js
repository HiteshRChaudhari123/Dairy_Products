// Admin announcements: who receives them, and the job that sends due campaigns.
import { BENEFIT_STATES, Membership, Notification } from '../models/billing.js'
import { Campaign, Zone } from '../models/misc.js'
import Order from '../models/Order.js'
import Subscription from '../models/Subscription.js'
import User from '../models/User.js'
import { httpError } from '../utils/http.js'
import { logger } from '../utils/logger.js'
import { notify } from './notify.js'

export const MAX_RECIPIENTS = 20000
const DAY_MS = 86400000

/** User ids in an audience (blocked accounts never receive announcements). */
export async function audienceIds({ audience, zone }) {
  const customers = { role: 'customer', isBlocked: false }
  let filter
  if (audience === 'all') filter = customers
  else if (audience === 'delivery') filter = { role: 'delivery', isBlocked: false, 'delivery.kycStatus': 'approved' }
  else if (audience === 'subscribers') {
    const [subs, members] = await Promise.all([
      Subscription.distinct('user', { status: { $in: ['active', 'paused', 'past_due'] } }),
      Membership.distinct('user', { status: { $in: BENEFIT_STATES } }),
    ])
    filter = { ...customers, _id: { $in: [...subs, ...members] } }
  } else if (audience === 'inactive') {
    const recent = await Order.distinct('user', { createdAt: { $gte: new Date(Date.now() - 30 * DAY_MS) } })
    filter = { ...customers, _id: { $nin: recent } }
  } else if (audience === 'zone') {
    const z = zone && (await Zone.findById(zone).select('pincodes'))
    if (!z) throw httpError(400, 'Choose a delivery zone')
    filter = { ...customers, 'addresses.pincode': { $in: z.pincodes } }
  } else throw httpError(400, 'Unknown audience')
  const users = await User.find(filter).select('_id').limit(MAX_RECIPIENTS + 1).lean()
  return users.map((u) => u._id)
}

/**
 * Send every campaign whose time has come. A campaign is claimed (scheduled → sending) before sending, and each
 * recipient's notification is keyed per campaign, so overlapping or resumed runs never message anyone twice.
 * A campaign left in "sending" by a crashed run is picked up again after 30 minutes.
 */
export async function sendDueCampaigns(now = new Date()) {
  const out = { campaigns: 0, recipients: 0 }
  for (;;) {
    const c = await Campaign.findOneAndUpdate(
      {
        $or: [
          { status: 'scheduled', scheduleAt: { $lte: now } },
          { status: 'sending', startedAt: { $lt: new Date(now.getTime() - 30 * 60000) } },
        ],
      },
      { $set: { status: 'sending', startedAt: new Date() } },
      { returnDocument: 'after', sort: { scheduleAt: 1 } },
    )
    if (!c) break
    try {
      const ids = await audienceIds(c)
      if (ids.length > MAX_RECIPIENTS) throw new Error(`Audience is larger than ${MAX_RECIPIENTS} people`)
      for (const id of ids) {
        await notify(id, 'announcement', {}, { key: `campaign:${c._id}:${id}`, link: c.link || undefined, content: { title: c.title, body: c.body }, channels: c.channels })
      }
      // Count from what was stored (not from this run), so a resumed send still reports every recipient.
      const agg = await Notification.aggregate([
        { $match: { key: { $regex: `^campaign:${c._id}:` } } },
        { $unwind: '$channels' },
        { $group: { _id: { channel: '$channels.channel', status: '$channels.status' }, n: { $sum: 1 } } },
      ])
      const results = {}
      for (const { _id, n } of agg) (results[_id.channel] ??= { delivered: 0, failed: 0, skipped: 0 })[_id.status] = n
      await Campaign.updateOne({ _id: c._id }, { $set: { status: 'sent', sentAt: new Date(), recipients: ids.length, results } })
      out.campaigns++
      out.recipients += ids.length
    } catch (e) {
      logger.error('Campaign failed', { campaign: String(c._id), error: e })
      await Campaign.updateOne({ _id: c._id }, { $set: { status: 'failed', error: String(e.message).slice(0, 300) } })
    }
  }
  return out
}
