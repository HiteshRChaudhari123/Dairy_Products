import crypto from 'node:crypto'
import mongoose from 'mongoose'

export const ORDER_STATUSES = [
  'placed',
  'confirmed',
  'packed',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'returned',
  'undelivered', // the partner could not deliver (customer away, address closed): paid amounts are refunded
]

const orderSchema = new mongoose.Schema(
  {
    orderNo: { type: String, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        image: String,
        category: String,
        variantId: mongoose.Schema.Types.ObjectId,
        variantLabel: String,
        price: Number,
        mrp: Number,
        qty: Number,
      },
    ],
    address: {
      name: String,
      phone: String,
      line1: String,
      line2: String,
      landmark: String,
      city: String,
      state: String,
      pincode: String,
      location: { lat: Number, lng: Number },
    },
    slot: { date: String, label: String },
    subtotal: Number,
    discount: { type: Number, default: 0 },
    deliveryFee: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: Number,
    couponCode: String,
    memberDiscount: { type: Number, default: 0 },
    memberFreeDelivery: { type: Boolean, default: false },
    membership: { type: mongoose.Schema.Types.ObjectId, ref: 'Membership' },
    payment: {
      method: { type: String, enum: ['cod', 'wallet', 'online', 'prepaid'], required: true }, // prepaid = drawn from a subscription's prepaid balance
      status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
      razorpayOrderId: String,
      razorpayPaymentId: String,
    },
    status: { type: String, enum: ORDER_STATUSES, default: 'placed' },
    timeline: [
      {
        status: String,
        note: String,
        at: { type: Date, default: Date.now },
        by: String,
      },
    ],
    deliveryPartner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    deliveryOtp: String,
    codCollected: { type: Boolean, default: false },
    deliveredAt: Date,
    source: { type: String, enum: ['store', 'subscription'], default: 'store' },
    subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
    cancelReason: String,
    returnRequested: { type: Boolean, default: false },
    returnReason: String,
    failureReason: String,
    proofAt: Date, // when the delivery partner uploaded a photo proof (the image itself is a DeliveryProof)
    missedResolution: { action: String, amount: Number, by: String, at: Date, note: String },
  },
  { timestamps: true },
)

orderSchema.index({ user: 1, createdAt: -1 })
orderSchema.index({ status: 1, 'slot.date': 1 })
orderSchema.index({ deliveryPartner: 1, status: 1 })
// One delivery per subscription per date, even if the generator runs twice at once.
orderSchema.index({ subscription: 1, 'slot.date': 1 }, { unique: true, partialFilterExpression: { subscription: { $exists: true } } })
orderSchema.index({ membership: 1, createdAt: 1 }, { sparse: true })

orderSchema.pre('validate', function () {
  if (!this.orderNo) {
    const d = new Date()
    this.orderNo =
      'GV' +
      d.getFullYear().toString().slice(2) +
      String(d.getMonth() + 1).padStart(2, '0') +
      String(d.getDate()).padStart(2, '0') +
      Math.random().toString(36).slice(2, 8).toUpperCase()
  }
  if (!this.deliveryOtp) this.deliveryOtp = String(crypto.randomInt(1000, 10000))
})

export default mongoose.model('Order', orderSchema)
