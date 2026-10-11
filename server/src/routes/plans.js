// Membership and subscription plans for customers: browse (public), price (server-side) and check out.
import { Router } from 'express'
import { z } from 'zod'
import { protect } from '../middleware/auth.js'
import { limits } from '../middleware/rateLimit.js'
import { noStore } from '../middleware/security.js'
import { Plan } from '../models/billing.js'
import { Setting } from '../models/misc.js'
import { httpError } from '../utils/http.js'
import { razorpayEnabled } from '../utils/razorpay.js'
import { firstEditableDate } from '../services/common.js'
import { startMembershipCheckout } from '../services/memberships.js'
import { txView } from '../services/payments.js'
import { eligibleCatalog, planOnSale, publicVersion, quoteMembership, quoteProductPlan, servesPincode, versionIsOpen } from '../services/plans.js'
import { startProductCheckout } from '../services/productSubscriptions.js'

const router = Router()

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id')
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

// ───────────── Public ─────────────

router.get('/', async (req, res) => {
  const filter = { status: 'published' }
  if (['membership', 'product'].includes(req.query.kind)) filter.kind = req.query.kind
  const plans = await Plan.find(filter).sort('sortOrder name').populate('publishedVersion')
  res.json(
    plans
      .filter((p) => p.publishedVersion && versionIsOpen(p.publishedVersion))
      .map((p) => ({ _id: p._id, kind: p.kind, slug: p.slug, name: p.name, version: publicVersion(p.publishedVersion) })),
  )
})

router.get('/:slug', async (req, res) => {
  const { plan, version } = await planOnSale(req.params.slug)
  const [catalog, settings] = await Promise.all([plan.kind === 'product' ? eligibleCatalog(version) : undefined, Setting.get()])
  res.json({
    _id: plan._id,
    kind: plan.kind,
    slug: plan.slug,
    name: plan.name,
    version: publicVersion(version),
    catalog,
    // What the checkout form needs to offer only valid choices; prices still come from the quote endpoint.
    checkout: { earliestStart: firstEditableDate(settings.billing), slots: settings.slots, onlinePayments: razorpayEnabled() },
  })
})

// ───────────── Customer: quote + checkout ─────────────

const productInput = z.object({
  items: z.array(z.object({ product: objectId, variantId: objectId, qty: z.number().int().min(1).max(50) })).min(1).max(20),
  frequency: z.enum(['daily', 'alternate', 'weekly', 'custom']),
  days: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  startDate: dateStr,
  slot: z.string().max(40).optional(),
  addressId: objectId,
})

async function priceFor(req, plan, version, body) {
  const settings = await Setting.get()
  if (plan.kind === 'membership') {
    const addr = req.user.addresses.find((a) => a.isDefault) || req.user.addresses[0]
    if (!(await servesPincode(version, addr?.pincode))) throw httpError(400, 'This membership is not available in your area yet')
    return { settings, quote: quoteMembership(version) }
  }
  const input = productInput.parse(body)
  const address = req.user.addresses.id(input.addressId)
  if (!address) throw httpError(400, 'Please choose a delivery address')
  if (!(await servesPincode(version, address.pincode))) throw httpError(400, `This plan is not available at ${address.pincode} yet`)
  const earliest = firstEditableDate(settings.billing)
  if (input.startDate < earliest) throw httpError(400, `The earliest start date is ${earliest}`)
  const slot = input.slot || settings.slots[0]
  if (!settings.slots.includes(slot)) throw httpError(400, 'Choose one of the available delivery slots')
  const quote = await quoteProductPlan(version, input, settings)
  return { settings, quote, address, slot, startDate: input.startDate }
}

router.post('/:slug/quote', protect, noStore, async (req, res) => {
  const { plan, version } = await planOnSale(req.params.slug)
  z.object({}).passthrough().parse(req.body || {})
  const { quote, settings } = await priceFor(req, plan, version, req.body)
  res.json({ quote, earliestStart: firstEditableDate(settings.billing), walletBalance: req.user.wallet })
})

const checkoutSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(80),
    acceptTerms: z.literal(true, { error: 'Please accept the plan terms' }),
    paymentMethod: z.enum(['razorpay', 'wallet']),
    autoRenew: z.boolean().optional(),
  })
  .passthrough()

router.post('/:slug/checkout', protect, noStore, limits.sensitive, async (req, res) => {
  const body = checkoutSchema.parse(req.body)
  const { plan, version } = await planOnSale(req.params.slug)
  const priced = await priceFor(req, plan, version, req.body)
  const common = { user: req.user, plan, version, quote: priced.quote, paymentMethod: body.paymentMethod, idempotencyKey: body.idempotencyKey, autoRenew: body.autoRenew }
  const r =
    plan.kind === 'membership'
      ? await startMembershipCheckout(common)
      : await startProductCheckout({ ...common, address: priced.address.toObject(), slot: priced.slot, startDate: priced.startDate })
  res.status(201).json({ transaction: txView(r.tx), membership: r.membership?._id, subscription: r.subscription?._id, ...r.payment })
})

export default router
