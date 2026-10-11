// Membership plans, payments, refunds, invoices, notifications and the durable history behind them.
// Money in this file is always an integer number of minor units (paise) plus an explicit currency.
import mongoose from 'mongoose'

const { Schema, model } = mongoose
const { ObjectId } = Schema.Types

const minor = (extra = {}) => ({
  type: Number,
  default: 0,
  min: 0,
  validate: { validator: Number.isInteger, message: 'Amounts are stored in whole paise' },
  ...extra,
})

export const PLAN_KINDS = ['membership', 'product']
export const PLAN_STATUSES = ['draft', 'published', 'unpublished', 'archived']
export const FREQUENCIES = ['daily', 'alternate', 'weekly', 'custom']
export const INTERVALS = { month: 30, quarter: 90, year: 365 }

/** A plan is the stable, listable thing ("Gold membership"). Its terms live in immutable versions. */
export const Plan = model(
  'Plan',
  new Schema(
    {
      kind: { type: String, enum: PLAN_KINDS, required: true },
      name: { type: String, required: true, trim: true },
      slug: { type: String, required: true, unique: true },
      status: { type: String, enum: PLAN_STATUSES, default: 'draft', index: true },
      latestVersion: { type: Number, default: 1 },
      publishedVersion: { type: ObjectId, ref: 'PlanVersion' },
      sortOrder: { type: Number, default: 0 },
      createdBy: { type: ObjectId, ref: 'User' },
    },
    { timestamps: true },
  ),
)

const versionSchema = new Schema(
  {
    plan: { type: ObjectId, ref: 'Plan', required: true },
    version: { type: Number, required: true },
    // draft: still editable; published: the terms new customers buy; superseded: replaced by a newer published version.
    // Published and superseded versions never change, so every subscriber keeps the terms they accepted.
    status: { type: String, enum: ['draft', 'published', 'superseded'], default: 'draft' },
    name: { type: String, required: true },
    tagline: String,
    description: String,
    termsText: String,
    currency: { type: String, default: 'INR' },
    // Membership fee per term (product plans: optional joining fee per prepaid term, usually 0).
    priceMinor: minor(),
    interval: { type: String, enum: ['month', 'quarter', 'year', 'custom'], default: 'month' },
    durationDays: { type: Number, min: 1, max: 730, default: 30 },
    taxPercent: { type: Number, min: 0, max: 28, default: 0 }, // on the plan fee
    benefits: {
      discountPercent: { type: Number, min: 0, max: 90, default: 0 },
      maxDiscountPerOrderMinor: minor(),
      minOrderForDiscountMinor: minor(),
      freeDelivery: { type: Boolean, default: false },
      freeDeliveryMinOrderMinor: minor(),
      prioritySupport: { type: Boolean, default: false },
      ordersPerTermLimit: { type: Number, min: 0, default: 0 }, // 0 = no limit on discounted/free-delivery orders
      exclusiveOffers: [String],
      perks: [String],
    },
    product: {
      // prepaid: the customer pays for a window of deliveries up front; each delivery is drawn from that balance.
      // per_delivery: no upfront charge; each delivery is paid from the wallet, else cash on delivery.
      billingMode: { type: String, enum: ['prepaid', 'per_delivery'], default: 'prepaid' },
      eligible: [{ product: { type: ObjectId, ref: 'Product' }, variantId: ObjectId }], // empty = every subscribable product
      discountPercent: { type: Number, min: 0, max: 90, default: 0 },
      minQty: { type: Number, min: 1, default: 1 },
      maxQty: { type: Number, min: 1, max: 50, default: 10 },
      maxItems: { type: Number, min: 1, max: 20, default: 5 },
      frequencies: { type: [{ type: String, enum: FREQUENCIES }], default: ['daily', 'alternate', 'weekly', 'custom'] },
      deliveryFeeMinor: minor(),
      prepayDays: { type: Number, min: 1, max: 180, default: 30 },
    },
    policies: {
      pause: {
        allowed: { type: Boolean, default: true },
        minDays: { type: Number, min: 1, default: 1 },
        maxDays: { type: Number, min: 1, default: 30 },
        noticeDays: { type: Number, min: 0, default: 0 }, // extra notice on top of the daily cut-off
      },
      cancellation: {
        mode: { type: String, enum: ['end_of_term', 'immediate'], default: 'end_of_term' },
        refund: { type: String, enum: ['none', 'prorata'], default: 'none' }, // unused membership days
        refundUnusedBalance: { type: Boolean, default: true }, // prepaid product balance back to the wallet
      },
      renewal: { autoRenewAllowed: { type: Boolean, default: true } },
      gracePeriodDays: { type: Number, min: 0, max: 30, default: 3 },
      retry: { attempts: { type: Number, min: 0, max: 10, default: 3 }, intervalHours: { type: Number, min: 1, max: 168, default: 24 } },
    },
    availability: { allZones: { type: Boolean, default: true }, zones: [{ type: ObjectId, ref: 'Zone' }] },
    validFrom: Date,
    validTo: Date,
    publishedAt: Date,
    createdBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true },
)
versionSchema.index({ plan: 1, version: 1 }, { unique: true })
export const PlanVersion = model('PlanVersion', versionSchema)

/** The terms a subscriber agreed to: a frozen copy of the plan version at purchase time. */
export const termsOf = (v) => ({
  version: v.version,
  name: v.name,
  currency: v.currency,
  priceMinor: v.priceMinor,
  interval: v.interval,
  durationDays: v.durationDays,
  taxPercent: v.taxPercent,
  benefits: JSON.parse(JSON.stringify(v.benefits || {})),
  product: JSON.parse(JSON.stringify(v.product || {})),
  policies: JSON.parse(JSON.stringify(v.policies || {})),
})

export const MEMBERSHIP_STATUSES = ['pending_payment', 'active', 'cancellation_pending', 'past_due', 'suspended', 'cancelled', 'expired', 'failed']
// A customer can hold at most one membership in these states (enforced by a unique index on liveKey).
export const LIVE_MEMBERSHIP = ['pending_payment', 'active', 'cancellation_pending', 'past_due', 'suspended']
// Member benefits apply in these states (past_due only until the grace period ends).
export const BENEFIT_STATES = ['active', 'cancellation_pending', 'past_due']

const membershipSchema = new Schema(
  {
    code: { type: String, unique: true },
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    plan: { type: ObjectId, ref: 'Plan', required: true },
    planVersion: { type: ObjectId, ref: 'PlanVersion', required: true },
    terms: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: MEMBERSHIP_STATUSES, default: 'pending_payment', index: true },
    liveKey: String,
    startedAt: Date,
    currentPeriodStart: Date,
    currentPeriodEnd: { type: Date, index: true },
    graceUntil: Date,
    autoRenew: { type: Boolean, default: false }, // renew from the wallet when the term ends
    cancelAt: Date,
    cancelledAt: Date,
    cancelReason: String,
    renewalAttempts: { type: Number, default: 0 },
    nextRetryAt: Date,
    nextPlanVersion: { type: ObjectId, ref: 'PlanVersion' }, // plan change that applies at the next renewal
    termsAcceptedAt: Date,
  },
  { timestamps: true },
)
membershipSchema.index({ liveKey: 1 }, { unique: true, sparse: true })
membershipSchema.pre('validate', function () {
  if (!this.code) this.code = 'MBR' + Date.now().toString(36).toUpperCase().slice(-5) + Math.random().toString(36).slice(2, 5).toUpperCase()
  this.liveKey = LIVE_MEMBERSHIP.includes(this.status) ? String(this.user) : undefined
})
export const Membership = model('Membership', membershipSchema)

export const TX_PURPOSES = ['membership', 'membership_renewal', 'subscription_prepay', 'subscription_topup']
export const TX_STATUSES = ['created', 'paid', 'failed', 'expired', 'refunded', 'partially_refunded']

/** One payment attempt. Fulfilment (activation, balance credit) runs exactly once, guarded by `fulfilment`. */
const txSchema = new Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, index: true },
    purpose: { type: String, enum: TX_PURPOSES, required: true },
    membership: { type: ObjectId, ref: 'Membership' },
    subscription: { type: ObjectId, ref: 'Subscription' },
    planVersion: { type: ObjectId, ref: 'PlanVersion' },
    provider: { type: String, enum: ['razorpay', 'wallet', 'free'], required: true },
    currency: { type: String, default: 'INR' },
    amountMinor: minor({ required: true }),
    breakdown: { type: Schema.Types.Mixed }, // immutable price snapshot shown to the customer
    refundedMinor: minor(),
    status: { type: String, enum: TX_STATUSES, default: 'created', index: true },
    fulfilment: { type: String, enum: ['pending', 'running', 'done', 'failed'], default: 'pending' },
    fulfilmentError: String,
    idempotencyKey: { type: String, required: true },
    providerOrderId: String,
    providerPaymentId: String,
    paidAt: Date,
    failureReason: String,
    history: [{ status: String, at: { type: Date, default: Date.now }, note: String }],
  },
  { timestamps: true },
)
txSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true })
txSchema.index({ providerOrderId: 1 }, { unique: true, sparse: true })
txSchema.index({ providerPaymentId: 1 }, { unique: true, sparse: true })
export const PaymentTransaction = model('PaymentTransaction', txSchema)

export const REFUND_STATUSES = ['requested', 'approved', 'processing', 'succeeded', 'failed', 'rejected']
export const Refund = model(
  'Refund',
  new Schema(
    {
      transaction: { type: ObjectId, ref: 'PaymentTransaction' },
      user: { type: ObjectId, ref: 'User', required: true, index: true },
      membership: { type: ObjectId, ref: 'Membership' },
      subscription: { type: ObjectId, ref: 'Subscription' },
      amountMinor: minor({ required: true }),
      currency: { type: String, default: 'INR' },
      destination: { type: String, enum: ['wallet', 'source'], default: 'wallet' }, // source = back to the card/UPI via the gateway
      reason: { type: String, required: true },
      status: { type: String, enum: REFUND_STATUSES, default: 'requested', index: true },
      requestedBy: { type: ObjectId, ref: 'User' },
      decidedBy: { type: ObjectId, ref: 'User' },
      decisionNote: String,
      providerRefundId: { type: String },
      failureReason: String,
      history: [{ status: String, at: { type: Date, default: Date.now }, note: String, by: String }],
    },
    { timestamps: true },
  ),
)

/** Sequential, gap-free counters (invoice numbers). */
export const Counter = model('Counter', new Schema({ _id: String, seq: { type: Number, default: 0 } }))

export const Invoice = model(
  'Invoice',
  new Schema(
    {
      number: { type: String, required: true, unique: true },
      user: { type: ObjectId, ref: 'User', required: true, index: true },
      transaction: { type: ObjectId, ref: 'PaymentTransaction', unique: true, sparse: true },
      billTo: { name: String, email: String, phone: String, address: String },
      lines: [{ description: String, qty: Number, unitMinor: Number, amountMinor: Number }],
      subtotalMinor: minor(),
      discountMinor: minor(),
      taxPercent: { type: Number, default: 0 },
      taxMinor: minor(),
      totalMinor: minor(),
      currency: { type: String, default: 'INR' },
      issuedAt: { type: Date, default: Date.now },
      seller: { name: String, address: String, gstNo: String, fssaiNo: String },
    },
    { timestamps: true },
  ),
)

/** Append-only history of everything that happened to a membership or product subscription. */
export const SubscriptionEvent = model(
  'SubscriptionEvent',
  new Schema(
    {
      entityType: { type: String, enum: ['membership', 'subscription'], required: true },
      entity: { type: ObjectId, required: true, index: true },
      user: { type: ObjectId, ref: 'User', index: true },
      type: { type: String, required: true }, // e.g. "activated", "status", "renewal_failed", "pause"
      from: String,
      to: String,
      actor: { id: { type: ObjectId, ref: 'User' }, name: String, role: String },
      note: String,
      data: Schema.Types.Mixed,
    },
    { timestamps: { createdAt: true, updatedAt: false } },
  ),
)

/** Actions an admin may only request (manual overrides, large refunds); a super admin approves or rejects them. */
export const SubscriptionRequest = model(
  'SubscriptionRequest',
  new Schema(
    {
      type: { type: String, enum: ['override', 'refund'], required: true },
      entityType: { type: String, enum: ['membership', 'subscription', 'refund'], required: true },
      entity: { type: ObjectId, required: true },
      action: String, // override: suspend | reinstate | extend | credit
      payload: Schema.Types.Mixed,
      reason: { type: String, required: true },
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
      requestedBy: { id: { type: ObjectId, ref: 'User' }, name: String },
      decidedBy: { id: { type: ObjectId, ref: 'User' }, name: String },
      decisionNote: String,
      decidedAt: Date,
    },
    { timestamps: true },
  ),
)

/** In-app notification plus the outcome of each delivery channel. `key` makes sends idempotent. */
export const Notification = model(
  'Notification',
  new Schema(
    {
      user: { type: ObjectId, ref: 'User', required: true, index: true },
      type: { type: String, required: true },
      title: { type: String, required: true },
      body: String,
      link: String,
      key: { type: String, unique: true, sparse: true },
      channels: [{ channel: String, status: { type: String, enum: ['delivered', 'skipped', 'failed'] }, detail: String, attempts: { type: Number, default: 1 }, at: { type: Date, default: Date.now } }],
      readAt: Date,
    },
    { timestamps: true },
  ),
)

/** Gateway webhook events already processed (Razorpay retries deliveries). */
export const WebhookEvent = model(
  'WebhookEvent',
  new Schema({ _id: String, event: String, receivedAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 } }),
)

/** Background job runs (monitoring) and a lease so only one server instance runs a job at a time. */
export const JobRun = model(
  'JobRun',
  new Schema(
    {
      name: { type: String, required: true, index: true },
      startedAt: { type: Date, default: Date.now },
      finishedAt: Date,
      ok: Boolean,
      result: Schema.Types.Mixed,
      error: String,
    },
    { timestamps: false },
  ),
)
export const JobLock = model('JobLock', new Schema({ _id: String, until: Date, owner: String }))
