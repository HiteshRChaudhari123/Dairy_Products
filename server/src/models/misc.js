// Smaller models grouped in one file.
import mongoose from 'mongoose'

const { Schema, model } = mongoose

export const Banner = model(
  'Banner',
  new Schema(
    {
      eyebrow: String, // short label above the title, e.g. "Milk subscription"
      title: { type: String, required: true },
      subtitle: String,
      cta: { type: String, default: 'Shop now' },
      link: { type: String, default: '/' },
      image: String,
      imageDark: String, // optional dark-mode version of the photo (same composition, darker lighting)
      // Which part of the photo stays in view when it's cropped: 'right' keeps a subject on the right clear of the text fade.
      imagePosition: { type: String, enum: ['center', 'left', 'right'], default: 'center' },
      highlights: [String], // up to 3 short product facts shown as floating badges on wide screens
      bg: { type: String, default: '#101D35' },
      sortOrder: { type: Number, default: 0 },
      isActive: { type: Boolean, default: true },
    },
    { timestamps: true },
  ),
)

// A delivery zone belongs to a branch/warehouse and covers a list of pincodes.
export const Zone = model(
  'Zone',
  new Schema(
    {
      name: { type: String, required: true },
      branch: { type: String, default: 'Main Warehouse' },
      pincodes: [{ type: String, match: [/^\d{6}$/, 'Pincodes must be 6 digits'] }],
      extraFee: { type: Number, default: 0 },
      isActive: { type: Boolean, default: true },
    },
    { timestamps: true },
  ),
)

export const WalletTransaction = model(
  'WalletTransaction',
  new Schema(
    {
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
      type: { type: String, enum: ['credit', 'debit'], required: true },
      amount: { type: Number, required: true },
      reason: String,
      balanceAfter: Number,
      order: { type: Schema.Types.ObjectId, ref: 'Order' },
    },
    { timestamps: true },
  ),
)

// Tracks a wallet add-money attempt from creation to Razorpay verification, so the
// verify step credits exactly the amount the Razorpay order was created for.
export const WalletTopup = model(
  'WalletTopup',
  new Schema(
    {
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
      amount: { type: Number, required: true, min: 1 },
      status: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
      razorpayOrderId: String,
      razorpayPaymentId: String,
    },
    { timestamps: true },
  ),
)

export const Ticket = model(
  'Ticket',
  new Schema(
    {
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      subject: { type: String, required: true },
      order: { type: Schema.Types.ObjectId, ref: 'Order' },
      subscription: { type: Schema.Types.ObjectId, ref: 'Subscription' },
      category: { type: String, enum: ['general', 'order', 'missed_delivery', 'subscription', 'membership', 'billing'], default: 'general' },
      priority: { type: String, enum: ['normal', 'high'], default: 'normal' }, // high for members with priority support
      status: { type: String, enum: ['open', 'resolved'], default: 'open' },
      messages: [
        {
          from: { type: Schema.Types.ObjectId, ref: 'User' },
          name: String,
          role: String,
          text: String,
          at: { type: Date, default: Date.now },
        },
      ],
    },
    { timestamps: true },
  ),
)

export const AuditLog = model(
  'AuditLog',
  new Schema(
    {
      actor: { type: Schema.Types.ObjectId, ref: 'User' },
      actorName: String,
      role: String,
      action: String, // e.g. "product.update"
      entity: String,
      entityId: String,
      details: String,
    },
    { timestamps: true },
  ),
)

// CMS pages: about, terms, privacy, refund-policy, shipping-policy
export const Page = model(
  'Page',
  new Schema(
    {
      slug: { type: String, required: true, unique: true },
      title: { type: String, required: true },
      content: { type: String, default: '' },
    },
    { timestamps: true },
  ),
)

const settingSchema = new Schema(
  {
    key: { type: String, default: 'global', unique: true },
    storeName: { type: String, default: 'Gavyora' },
    supportPhone: { type: String, default: '' }, // shown and dialled only once the owner sets a real number
    supportEmail: { type: String, default: 'care@gavyora.com' },
    address: { type: String, default: '' },
    fssaiNo: { type: String, default: '' },
    gstNo: { type: String, default: '' },
    deliveryFee: { type: Number, default: 25 },
    freeDeliveryAbove: { type: Number, default: 299 },
    minOrderValue: { type: Number, default: 99 },
    taxPercent: { type: Number, default: 0 }, // fresh milk/curd are GST-exempt; adjust for your catalogue
    codEnabled: { type: Boolean, default: true },
    slots: {
      type: [String],
      default: ['6:00 AM - 8:00 AM', '8:00 AM - 10:00 AM', '5:00 PM - 7:00 PM'],
    },
    deliveryPayoutPerOrder: { type: Number, default: 20 },
    referralBonus: { type: Number, default: 50 },
    // Memberships and subscription billing. Money in paise. Gateway secrets stay in server/.env, never here.
    billing: {
      currency: { type: String, default: 'INR' },
      invoicePrefix: { type: String, default: 'GV' },
      deliveryCutoff: { type: String, default: '21:00' }, // HH:MM IST: changes for tomorrow lock at this time
      holidays: [String], // YYYY-MM-DD dates with no deliveries
      refundApprovalLimitMinor: { type: Number, default: 50000 }, // admins can refund up to this; above needs a super admin
      reminderDays: { type: [Number], default: [7, 1] }, // renewal reminders before a membership ends
      checkoutExpiryMinutes: { type: Number, default: 60 }, // unpaid checkouts are abandoned after this
      auditRetentionDays: { type: Number, default: 0 }, // 0 = keep audit logs forever
      notificationTemplates: { type: Map, of: new Schema({ title: String, body: String }, { _id: false }), default: {} },
    },
  },
  { timestamps: true },
)

settingSchema.statics.get = async function () {
  return (await this.findOne({ key: 'global' })) || this.create({ key: 'global' })
}

export const Setting = model('Setting', settingSchema)

// An announcement sent to a group of customers or partners (admin Notifications page). Each recipient gets an in-app
// notification keyed `campaign:<id>:<user>`, so a send that is interrupted and resumed never messages anyone twice.
export const CAMPAIGN_AUDIENCES = ['all', 'subscribers', 'inactive', 'zone', 'delivery']
export const CAMPAIGN_CHANNELS = ['email', 'sms', 'push'] // in-app is always included
export const Campaign = model(
  'Campaign',
  new Schema(
    {
      title: { type: String, required: true },
      body: { type: String, required: true },
      link: String,
      audience: { type: String, enum: CAMPAIGN_AUDIENCES, required: true },
      zone: { type: Schema.Types.ObjectId, ref: 'Zone' },
      channels: [{ type: String, enum: CAMPAIGN_CHANNELS }],
      status: { type: String, enum: ['scheduled', 'sending', 'sent', 'cancelled', 'failed'], default: 'scheduled', index: true },
      scheduleAt: { type: Date, required: true, index: true },
      startedAt: Date,
      sentAt: Date,
      recipients: { type: Number, default: 0 },
      // Per channel: { delivered, failed, skipped } counts from the providers' answers.
      results: { type: Schema.Types.Mixed, default: {} },
      error: String,
      createdBy: { id: { type: Schema.Types.ObjectId, ref: 'User' }, name: String },
    },
    { timestamps: true },
  ),
)

// Delivery photo proof: one per order, uploaded by the assigned partner. Kept in MongoDB (a few hundred kB at most,
// compressed on the phone) so it works without an external file store; served only to the order's customer,
// its partner and admins with the orders permission.
export const DeliveryProof = model(
  'DeliveryProof',
  new Schema(
    {
      order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
      by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      contentType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
      size: Number,
      data: { type: Buffer, required: true },
    },
    { timestamps: true },
  ),
)
