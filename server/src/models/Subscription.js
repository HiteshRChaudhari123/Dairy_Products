import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

export const SUBSCRIPTION_STATUSES = ['pending_payment', 'active', 'paused', 'past_due', 'suspended', 'cancelled', 'failed']
// States in which deliveries are generated.
export const DELIVERING = ['active']

const itemSchema = new mongoose.Schema(
  {
    product: { type: ObjectId, ref: 'Product', required: true },
    variantId: { type: ObjectId, required: true },
    productName: String,
    variantLabel: String,
    price: { type: Number, min: 0 }, // rupees per unit, locked when the item was added (plan discount applied)
    qty: { type: Number, default: 1, min: 1, max: 50 },
  },
  { _id: false },
)

const subscriptionSchema = new mongoose.Schema(
  {
    code: { type: String, unique: true, sparse: true },
    user: { type: ObjectId, ref: 'User', required: true },
    // Plan-based subscriptions keep a frozen copy of the plan terms; older subscriptions have none (pay per delivery).
    plan: { type: ObjectId, ref: 'Plan' },
    planVersion: { type: ObjectId, ref: 'PlanVersion' },
    terms: mongoose.Schema.Types.Mixed,
    billingMode: { type: String, enum: ['prepaid', 'per_delivery'], default: 'per_delivery' },
    prepaidBalanceMinor: { type: Number, default: 0, min: 0 },
    autoRenew: { type: Boolean, default: false }, // top up the prepaid balance from the wallet when it runs low
    items: { type: [itemSchema], validate: [(v) => v.length > 0, 'Add at least one product'] },

    // Legacy single-product fields (subscriptions created before baskets). Migrated into `items` on save.
    product: { type: ObjectId, ref: 'Product' },
    variantId: ObjectId,
    variantLabel: String,
    productName: String,
    price: Number,
    qty: { type: Number, default: 1, min: 1, max: 50 },

    frequency: { type: String, enum: ['daily', 'alternate', 'weekly', 'custom'], default: 'daily' },
    days: [{ type: Number, min: 0, max: 6 }], // for custom: 0 = Sunday
    startDate: { type: String, required: true }, // YYYY-MM-DD
    endDate: String, // YYYY-MM-DD, set when cancelled
    slot: { type: String, default: '6:00 AM - 8:00 AM' },
    address: {
      name: String,
      phone: String,
      line1: String,
      line2: String,
      landmark: String,
      city: String,
      state: String,
      pincode: String,
    },
    pausedDates: [String], // YYYY-MM-DD (vacation / skipped days)
    // One-day quantity changes: { date, items: [{ variantId, qty }] } (qty 0 skips that item on that day).
    dayOverrides: [{ date: String, items: [{ variantId: ObjectId, qty: Number, _id: false }], _id: false }],
    qtyOverrides: [{ date: String, qty: Number }], // legacy, migrated into dayOverrides
    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'active' },
    pauseUntil: String, // YYYY-MM-DD: an open-ended pause resumes after this date (if set)
    cancelReason: String,
    cancelledAt: Date,
    termsAcceptedAt: Date,
    lastGeneratedFor: String,
  },
  { timestamps: true },
)

subscriptionSchema.index({ user: 1, status: 1 })

subscriptionSchema.pre('validate', function () {
  if (!this.items?.length && this.product && this.variantId) {
    this.items = [{ product: this.product, variantId: this.variantId, productName: this.productName, variantLabel: this.variantLabel, price: this.price, qty: this.qty || 1 }]
  }
  if (this.qtyOverrides?.length && this.items?.length === 1) {
    for (const o of this.qtyOverrides) {
      if (!this.dayOverrides.some((d) => d.date === o.date)) this.dayOverrides.push({ date: o.date, items: [{ variantId: this.items[0].variantId, qty: o.qty }] })
    }
    this.qtyOverrides = []
  }
  if (!this.code) this.code = 'SUB' + Date.now().toString(36).toUpperCase().slice(-5) + Math.random().toString(36).slice(2, 5).toUpperCase()
  // Keep the legacy fields pointing at the first item so older screens and reports still read sensibly.
  const first = this.items?.[0]
  if (first) Object.assign(this, { product: first.product, variantId: first.variantId, productName: first.productName, variantLabel: first.variantLabel, price: first.price, qty: first.qty })
})

/** True when the schedule (frequency/days/start) includes this YYYY-MM-DD, ignoring status and pauses. */
subscriptionSchema.methods.scheduledOn = function (dateStr) {
  if (dateStr < this.startDate || (this.endDate && dateStr > this.endDate)) return false
  const d = new Date(dateStr + 'T00:00:00')
  const diff = Math.round((d - new Date(this.startDate + 'T00:00:00')) / 86400000)
  if (this.frequency === 'alternate') return diff % 2 === 0
  if (this.frequency === 'weekly') return diff % 7 === 0
  if (this.frequency === 'custom') return this.days.includes(d.getDay())
  return true
}

/** Items (with quantities) to deliver on the given YYYY-MM-DD; empty when nothing is due. */
subscriptionSchema.methods.itemsFor = function (dateStr, { holidays = [] } = {}) {
  if (this.status !== 'active' || holidays.includes(dateStr) || this.pausedDates.includes(dateStr)) return []
  if (!this.scheduledOn(dateStr)) return []
  const o = this.dayOverrides.find((x) => x.date === dateStr)
  return this.items
    .map((it) => {
      const plain = it.toObject ? it.toObject() : { ...it }
      const ov = o?.items.find((x) => String(x.variantId) === String(it.variantId))
      return { ...plain, qty: ov ? ov.qty : it.qty }
    })
    .filter((it) => it.qty > 0)
}

/** Total units due on a date (0 = no delivery). */
subscriptionSchema.methods.qtyFor = function (dateStr, opts) {
  return this.itemsFor(dateStr, opts).reduce((s, it) => s + it.qty, 0)
}

export default mongoose.model('Subscription', subscriptionSchema)
