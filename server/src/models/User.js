import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { env } from '../config/env.js'

export const ROLES = ['customer', 'delivery', 'admin', 'superadmin']

export const PERMISSIONS = [
  'orders',
  'products',
  'inventory',
  'subscriptions',
  'customers',
  'delivery',
  'coupons',
  'banners',
  'reviews',
  'tickets',
  'reports',
  'memberships', // memberships and plan-based subscriptions: view, pause/resume/cancel, request overrides
  'refunds', // issue refunds up to the configured approval limit
  'notifications', // send announcements to customers (in-app, plus email/SMS/push when providers are configured)
]

const addressSchema = new mongoose.Schema({
  label: { type: String, default: 'Home' },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  line1: { type: String, required: true },
  line2: String,
  landmark: String,
  city: { type: String, required: true },
  state: { type: String, required: true },
  pincode: { type: String, required: true, match: [/^\d{6}$/, 'Pincode must be 6 digits'] },
  location: { lat: Number, lng: Number },
  isDefault: { type: Boolean, default: false },
})

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
    phone: { type: String, trim: true, unique: true, sparse: true },
    password: { type: String, select: false },
    role: { type: String, enum: ROLES, default: 'customer' },
    permissions: [{ type: String, enum: PERMISSIONS }],
    // Admins: delivery zones they manage (empty = all). Limits the subscriptions and memberships they see.
    scopeZones: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Zone' }],
    isBlocked: { type: Boolean, default: false },
    wallet: { type: Number, default: 0 },
    loyaltyPoints: { type: Number, default: 0 },
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    addresses: [addressSchema],
    preferences: {
      language: { type: String, default: 'en' },
      notifications: { type: Boolean, default: true },
    },
    delivery: {
      vehicle: String,
      licenseNo: String,
      aadhaarLast4: String,
      bankAccountLast4: String,
      ifsc: String,
      kycStatus: { type: String, enum: ['none', 'pending', 'approved', 'rejected'], default: 'none' },
      kycNote: String,
      isOnline: { type: Boolean, default: false },
      zone: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone' },
      rating: { type: Number, default: 5 },
      earnings: { type: Number, default: 0 },
      paidOut: { type: Number, default: 0 },
    },
    // Password reset: only a SHA-256 hash of the emailed token is stored; it is single-use and expires in 30 minutes.
    resetToken: { type: { hash: String, expiresAt: Date }, select: false },
    // Per-account brute-force protection (on top of the per-IP rate limit).
    failedLogins: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
    // Bumped on password change, reset or block: every existing access and refresh token stops working.
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: Date,
  },
  { timestamps: true },
)

userSchema.pre('save', async function () {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, env.bcryptRounds)
  }
  if (!this.referralCode) {
    this.referralCode =
      (this.name || 'GAV').replace(/[^a-z]/gi, '').slice(0, 4).toUpperCase() +
      Math.random().toString(36).slice(2, 7).toUpperCase()
  }
})

userSchema.index({ 'resetToken.hash': 1 }, { sparse: true })

userSchema.methods.comparePassword = function (plain) {
  return this.password ? bcrypt.compare(plain, this.password) : false
}

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password
    delete ret.otp
    delete ret.resetToken
    delete ret.failedLogins
    delete ret.lockUntil
    delete ret.tokenVersion
    delete ret.__v
    return ret
  },
})

export default mongoose.model('User', userSchema)
