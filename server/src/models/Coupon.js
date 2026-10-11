import mongoose from 'mongoose'
import { httpError } from '../utils/http.js'

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: String,
    type: { type: String, enum: ['percent', 'flat'], default: 'percent' },
    value: { type: Number, required: true, min: 0 },
    maxDiscount: Number,
    minOrder: { type: Number, default: 0 },
    usageLimit: Number,
    usedCount: { type: Number, default: 0 },
    validFrom: Date,
    validTo: Date,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

/** Returns the discount for this subtotal, or throws a 400 explaining why it can't be applied. */
couponSchema.methods.discountFor = function (subtotal) {
  const now = new Date()
  const fail = (msg) => {
    throw httpError(400, msg)
  }
  if (!this.isActive) fail('This coupon is not active')
  if (this.validFrom && now < this.validFrom) fail('This coupon is not active yet')
  if (this.validTo && now > this.validTo) fail('This coupon has expired')
  if (this.usageLimit && this.usedCount >= this.usageLimit) fail('This coupon has been fully used')
  if (subtotal < this.minOrder) fail(`Add ₹${this.minOrder - subtotal} more to use this coupon`)
  let discount = this.type === 'percent' ? (subtotal * this.value) / 100 : this.value
  if (this.maxDiscount) discount = Math.min(discount, this.maxDiscount)
  return Math.min(Math.round(discount), subtotal)
}

export default mongoose.model('Coupon', couponSchema)
