// Plan lookup, availability and server-side pricing. Prices are never taken from the client.
import mongoose from 'mongoose'
import { Plan, PlanVersion } from '../models/billing.js'
import { Zone } from '../models/misc.js'
import Product from '../models/Product.js'
import Subscription from '../models/Subscription.js'
import { httpError } from '../utils/http.js'
import { addDaysKey, dateRange, percentOf, toMinor } from './common.js'

export const versionIsOpen = (v, now = new Date()) => (!v.validFrom || v.validFrom <= now) && (!v.validTo || v.validTo >= now)

/** The plan and its published version, or 404 when it is not on sale. */
export async function planOnSale(slug) {
  const plan = await Plan.findOne({ slug, status: 'published' }).populate('publishedVersion')
  const version = plan?.publishedVersion
  if (!plan || !version) throw httpError(404, 'This plan is not available')
  if (!versionIsOpen(version)) throw httpError(400, 'This plan is not open for sign-ups right now')
  return { plan, version }
}

/** Whether the plan version can be delivered/sold at this pincode. */
export async function servesPincode(version, pincode) {
  if (version.availability?.allZones !== false) return true
  if (!pincode) return false
  return !!(await Zone.exists({ _id: { $in: version.availability.zones }, isActive: true, pincodes: pincode }))
}

/** Membership price breakdown (fee + tax). */
export function quoteMembership(version) {
  const fee = version.priceMinor
  const tax = percentOf(fee, version.taxPercent)
  return {
    currency: version.currency,
    lines: [{ description: `${version.name} membership · ${version.durationDays} days`, qty: 1, unitMinor: fee, amountMinor: fee }],
    subtotalMinor: fee,
    discountMinor: 0,
    taxPercent: version.taxPercent,
    taxMinor: tax,
    totalMinor: fee + tax,
    durationDays: version.durationDays,
    balanceCreditMinor: 0,
  }
}

/** Plan price for one unit of a variant (rupees, two decimals). */
export const planUnitPrice = (variant, discountPercent = 0) => Math.round(variant.price * (100 - discountPercent)) / 100

/** Products and variants a product plan allows, with the plan price for each. */
export async function eligibleCatalog(version) {
  const pv = version.product || {}
  const filter = { isActive: true, isSubscribable: true }
  if (pv.eligible?.length) filter._id = { $in: pv.eligible.map((e) => e.product) }
  const products = await Product.find(filter).select('name slug images variants category isSubscribable').populate('category', 'name slug icon').sort('name')
  return products
    .map((p) => {
      const variants = p.variants
        .filter((v) => !pv.eligible?.length || pv.eligible.some((e) => String(e.product) === String(p._id) && (!e.variantId || String(e.variantId) === String(v._id))))
        .map((v) => ({ _id: v._id, label: v.label, price: v.price, mrp: v.mrp, planPrice: planUnitPrice(v, pv.discountPercent), inStock: v.stock > 0 }))
      return { _id: p._id, name: p.name, slug: p.slug, images: p.images, category: p.category, variants }
    })
    .filter((p) => p.variants.length)
}

/** Validate requested basket items against the plan and lock their prices. */
export async function resolveItems(version, requested = []) {
  const pv = version.product || {}
  if (!requested.length) throw httpError(400, 'Choose at least one product')
  if (requested.length > (pv.maxItems || 5)) throw httpError(400, `This plan allows up to ${pv.maxItems} products`)
  const keys = new Set()
  for (const r of requested) {
    if (!mongoose.isValidObjectId(r.product) || !mongoose.isValidObjectId(r.variantId)) throw httpError(400, 'Invalid product')
    if (keys.has(String(r.variantId))) throw httpError(400, 'Each product size can only be added once')
    keys.add(String(r.variantId))
  }
  const products = await Product.find({ _id: { $in: requested.map((r) => r.product) }, isActive: true, isSubscribable: true })
  return requested.map((r) => {
    const p = products.find((x) => String(x._id) === String(r.product))
    const v = p?.variants.id(r.variantId)
    if (!v) throw httpError(400, 'One of the products is not available for subscription')
    const allowed = !pv.eligible?.length || pv.eligible.some((e) => String(e.product) === String(p._id) && (!e.variantId || String(e.variantId) === String(v._id)))
    if (!allowed) throw httpError(400, `${p.name} is not included in this plan`)
    if (r.qty < (pv.minQty || 1) || r.qty > (pv.maxQty || 10)) throw httpError(400, `Quantity for ${p.name} must be between ${pv.minQty} and ${pv.maxQty}`)
    return { product: p._id, variantId: v._id, productName: p.name, variantLabel: v.label, price: planUnitPrice(v, pv.discountPercent), listPrice: v.price, qty: r.qty }
  })
}

/** Cost of one delivery in paise at plan prices: goods + goods tax + per-delivery fee. */
export function deliveryCost(items, { deliveryFeeMinor = 0, goodsTaxPercent = 0 } = {}, priceKey = 'price') {
  const goods = items.reduce((s, it) => s + toMinor(it[priceKey]) * it.qty, 0)
  return goods + percentOf(goods, goodsTaxPercent) + deliveryFeeMinor
}

/** Dates in [start, start + days) on which this schedule delivers (holidays excluded). */
export function deliveryDates(schedule, items, startDate, days, holidays = []) {
  const probe = new Subscription({ user: new mongoose.Types.ObjectId(), items, ...schedule, startDate, status: 'active' })
  return dateRange(startDate, addDaysKey(startDate, days - 1)).filter((d) => probe.itemsFor(d, { holidays }).length > 0)
}

/**
 * Product plan price breakdown. Prepaid plans charge for every delivery in the prepay window plus the plan fee;
 * pay-per-delivery plans charge only the (optional) plan fee now.
 */
export async function quoteProductPlan(version, input, settings) {
  const pv = version.product || {}
  if (!pv.frequencies?.includes(input.frequency)) throw httpError(400, 'This delivery frequency is not offered on this plan')
  if (input.frequency === 'custom' && !input.days?.length) throw httpError(400, 'Pick at least one delivery day')
  const items = await resolveItems(version, input.items)
  const goodsTaxPercent = settings.taxPercent || 0
  const pricing = { deliveryFeeMinor: pv.deliveryFeeMinor || 0, goodsTaxPercent }
  const perDeliveryMinor = deliveryCost(items, pricing)
  const listPerDeliveryMinor = deliveryCost(items, pricing, 'listPrice')
  const schedule = { frequency: input.frequency, days: input.frequency === 'custom' ? input.days : [] }
  const dates = deliveryDates(schedule, items, input.startDate, pv.prepayDays || 30, settings.billing?.holidays || [])
  const fee = version.priceMinor
  const feeTax = percentOf(fee, version.taxPercent)
  const lines = []
  let balanceCreditMinor = 0
  if (pv.billingMode === 'prepaid') {
    if (!dates.length) throw httpError(400, 'This schedule has no deliveries in the first billing period')
    balanceCreditMinor = perDeliveryMinor * dates.length
    lines.push({ description: `${dates.length} deliveries (${pv.prepayDays} days) at ${(perDeliveryMinor / 100).toFixed(2)} each`, qty: dates.length, unitMinor: perDeliveryMinor, amountMinor: balanceCreditMinor })
  }
  if (fee > 0) lines.push({ description: `${version.name} plan fee`, qty: 1, unitMinor: fee, amountMinor: fee })
  const savingsMinor = pv.discountPercent > 0 ? (listPerDeliveryMinor - perDeliveryMinor) * (pv.billingMode === 'prepaid' ? dates.length : 1) : 0
  return {
    currency: version.currency,
    billingMode: pv.billingMode,
    items,
    schedule,
    perDeliveryMinor,
    deliveries: dates.length,
    firstDelivery: dates[0] || null,
    prepayDays: pv.prepayDays,
    lines,
    subtotalMinor: balanceCreditMinor + fee,
    discountMinor: 0,
    savingsMinor, // informational: plan price vs today's list price, computed from real prices
    taxPercent: version.taxPercent,
    taxMinor: feeTax,
    totalMinor: balanceCreditMinor + fee + feeTax,
    balanceCreditMinor,
    goodsTaxPercent,
  }
}

/** Public view of a plan version (what a customer may see). */
export function publicVersion(v) {
  return {
    _id: v._id,
    version: v.version,
    name: v.name,
    tagline: v.tagline,
    description: v.description,
    termsText: v.termsText,
    currency: v.currency,
    priceMinor: v.priceMinor,
    interval: v.interval,
    durationDays: v.durationDays,
    taxPercent: v.taxPercent,
    benefits: v.benefits,
    product: v.product ? { ...JSON.parse(JSON.stringify(v.product)), eligible: undefined } : undefined,
    policies: v.policies,
    availability: { allZones: v.availability?.allZones !== false },
    validFrom: v.validFrom,
    validTo: v.validTo,
  }
}

export async function versionById(id) {
  const v = await PlanVersion.findById(id)
  if (!v) throw httpError(404, 'Plan version not found')
  return v
}
