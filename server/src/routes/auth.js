import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Router } from 'express'
import { z } from 'zod'
import { devFeaturesEnabled, env } from '../config/env.js'
import {
  clearTokens,
  issueTokens,
  protect,
  revokeAllSessions,
  revokeFamily,
  currentUser,
  rotateRefresh,
  verifyRefresh,
} from '../middleware/auth.js'
import { limits } from '../middleware/rateLimit.js'
import { noStore } from '../middleware/security.js'
import { OtpCode, Session } from '../models/auth.js'
import { Setting } from '../models/misc.js'
import User from '../models/User.js'
import { httpError } from '../utils/http.js'
import { logger } from '../utils/logger.js'
import { walletChange } from '../utils/services.js'

const router = Router()
router.use(noStore)

const MAX_FAILED_LOGINS = 10
const LOCK_MS = 15 * 60 * 1000
const OTP_TTL_MS = 5 * 60 * 1000
const OTP_MAX_ATTEMPTS = 5
const OTP_RESEND_MS = 30 * 1000
const RESET_TTL_MS = 30 * 60 * 1000
const LOGIN_FAILED = 'Wrong email/phone or password'

const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number')
// bcrypt only uses the first 72 bytes, so cap the length.
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password is too long')
const emailSchema = z.email().max(254)
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')
// Compared against when the account does not exist, so a failed login takes the same time either way.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', env.bcryptRounds)

async function finishLogin(req, res, user) {
  if (user.isBlocked) throw httpError(403, 'Your account has been blocked. Contact support.')
  user.lastLoginAt = new Date()
  await user.save()
  const tokens = await issueTokens(req, res, user)
  res.json({ user, ...tokens })
}

async function applyReferral(user, code) {
  if (!code) return
  const referrer = await User.findOne({ referralCode: code.toUpperCase().trim() })
  if (!referrer || String(referrer._id) === String(user._id)) return
  user.referredBy = referrer._id
  await user.save()
  const { referralBonus } = await Setting.get()
  if (referralBonus > 0) {
    await walletChange(referrer._id, referralBonus, `Referral bonus: ${user.name} joined`)
    await walletChange(user._id, referralBonus, 'Welcome bonus for joining with a referral')
  }
}

router.post('/register', limits.register, async (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(2).max(80),
      email: emailSchema,
      phone: phoneSchema.optional().or(z.literal('')),
      password: passwordSchema,
      referralCode: z.string().max(20).optional(),
    })
    .parse(req.body)
  const taken = await User.exists({ $or: [{ email: body.email.toLowerCase() }, ...(body.phone ? [{ phone: body.phone }] : [])] })
  if (taken) throw httpError(409, 'An account with these details already exists. Try logging in instead.')
  const user = await User.create({ name: body.name, email: body.email, phone: body.phone || undefined, password: body.password })
  await applyReferral(user, body.referralCode)
  await finishLogin(req, res, await User.findById(user._id))
})

router.post('/login', limits.login, async (req, res) => {
  const { identifier, password } = z
    .object({ identifier: z.string().trim().min(3).max(254), password: z.string().min(1).max(200) })
    .parse(req.body)
  const id = identifier.toLowerCase()
  const user = await User.findOne(id.includes('@') ? { email: id } : { phone: id }).select('+password +failedLogins +lockUntil')
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH)
    throw httpError(401, LOGIN_FAILED)
  }
  if (user.lockUntil && user.lockUntil > new Date()) {
    throw httpError(429, 'Too many failed login attempts. Please wait 15 minutes or reset your password.')
  }
  if (!(await user.comparePassword(password))) {
    const failed = (user.failedLogins || 0) + 1
    await User.updateOne(
      { _id: user._id },
      failed >= MAX_FAILED_LOGINS ? { failedLogins: 0, lockUntil: new Date(Date.now() + LOCK_MS) } : { failedLogins: failed },
    )
    throw httpError(401, LOGIN_FAILED)
  }
  user.failedLogins = 0
  user.lockUntil = undefined
  await finishLogin(req, res, user)
})

// Phone OTP: nothing is written to the user collection until the code is verified.
router.post('/otp/send', limits.otp, async (req, res) => {
  const { phone } = z.object({ phone: phoneSchema }).parse(req.body)
  const existing = await OtpCode.findOne({ phone })
  if (existing && Date.now() - existing.updatedAt.getTime() < OTP_RESEND_MS) {
    throw httpError(429, 'Please wait 30 seconds before requesting another OTP')
  }
  const otp = String(crypto.randomInt(100000, 1000000))
  await OtpCode.findOneAndUpdate(
    { phone },
    { hash: await bcrypt.hash(otp, 8), attempts: 0, expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    { upsert: true },
  )
  const isNew = !(await User.exists({ phone }))
  // TODO(Phase 10): send by SMS (MSG91 / Twilio). Until then the code is only visible in development.
  if (devFeaturesEnabled()) console.log(`📱 [dev] OTP for ${phone}: ${otp}`)
  res.json({ message: 'OTP sent', isNew, ...(devFeaturesEnabled() ? { devOtp: otp } : {}) })
})

router.post('/otp/verify', limits.otp, async (req, res) => {
  const { phone, otp, name } = z
    .object({ phone: phoneSchema, otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit OTP'), name: z.string().trim().min(2).max(80).optional() })
    .parse(req.body)
  const code = await OtpCode.findOne({ phone })
  if (!code || code.expiresAt < new Date()) throw httpError(400, 'OTP expired. Request a new one.')
  if (code.attempts >= OTP_MAX_ATTEMPTS) {
    await code.deleteOne()
    throw httpError(400, 'Too many wrong attempts. Request a new OTP.')
  }
  if (!(await bcrypt.compare(otp, code.hash))) {
    await OtpCode.updateOne({ _id: code._id }, { $inc: { attempts: 1 } })
    throw httpError(400, 'Incorrect OTP')
  }
  await code.deleteOne()
  let user = await User.findOne({ phone })
  if (!user) user = await User.create({ name: name || 'Gavyora Customer', phone })
  await finishLogin(req, res, user)
})

router.post('/refresh', limits.refresh, async (req, res) => {
  const token = req.cookies?.gv_rt || req.body?.refreshToken
  if (!token || typeof token !== 'string') throw httpError(401, 'No session')
  try {
    const { user, tokens } = await rotateRefresh(req, res, token)
    res.json({ user, ...tokens })
  } catch (e) {
    clearTokens(res)
    throw e
  }
})

router.post('/logout', async (req, res) => {
  const token = req.cookies?.gv_rt || req.body?.refreshToken
  if (typeof token === 'string') {
    try {
      const { jti } = verifyRefresh(token)
      const session = await Session.findOne({ jti })
      if (session) await revokeFamily(session.family)
    } catch {
      /* already invalid */
    }
  }
  clearTokens(res)
  res.json({ message: 'Logged out' })
})

/** Sign out everywhere: every session of this user, on every device. */
router.post('/logout-all', protect, async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } })
  await revokeAllSessions(req.user._id)
  clearTokens(res)
  res.json({ message: 'Logged out on all devices' })
})

router.get('/me', protect, (req, res) => res.json({ user: req.user }))

/**
 * Session check for the website on page load. Always 200: { user } when signed in (refreshing an expired access
 * token from the refresh cookie if needed), { user: null } for guests, so a visitor's browser never logs a 401.
 */
router.post('/session', limits.session, async (req, res) => {
  const user = await currentUser(req)
  if (user) return res.json({ user })
  const token = req.cookies?.gv_rt
  if (typeof token === 'string') {
    try {
      return res.json({ user: (await rotateRefresh(req, res, token)).user })
    } catch {
      clearTokens(res)
    }
  }
  res.json({ user: null })
})

// Password reset with a random, single-use token. Only its hash is stored. In production, email the link (Phase 10).
router.post('/forgot-password', limits.passwordReset, async (req, res) => {
  const { email } = z.object({ email: emailSchema }).parse(req.body)
  const response = { message: 'If that email is registered, a reset link has been sent.' }
  const user = await User.findOne({ email: email.toLowerCase() })
  if (user) {
    const token = crypto.randomBytes(32).toString('base64url')
    await User.updateOne({ _id: user._id }, { resetToken: { hash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) } })
    const link = `${env.clientUrl}/reset-password?token=${token}`
    if (devFeaturesEnabled()) {
      console.log(`🔑 [dev] Password reset link for ${email}: ${link}`)
      response.devResetLink = link
    } else {
      logger.info('Password reset requested', { userId: String(user._id) })
    }
  }
  res.json(response)
})

router.post('/reset-password', limits.passwordReset, async (req, res) => {
  const { token, password } = z.object({ token: z.string().min(20).max(200), password: passwordSchema }).parse(req.body)
  const user = await User.findOne({ 'resetToken.hash': sha256(token) }).select('+resetToken +password')
  if (!user || !user.resetToken?.expiresAt || user.resetToken.expiresAt < new Date()) {
    throw httpError(400, 'This reset link is invalid or has expired. Please request a new one.')
  }
  user.password = password
  user.resetToken = undefined
  user.failedLogins = 0
  user.lockUntil = undefined
  user.tokenVersion += 1 // log out every other session
  await user.save()
  await revokeAllSessions(user._id)
  clearTokens(res)
  res.json({ message: 'Password updated. Please log in.' })
})

router.post('/delivery/register', limits.register, async (req, res) => {
  const body = z
    .object({
      name: z.string().trim().min(2).max(80),
      phone: phoneSchema,
      email: emailSchema.optional().or(z.literal('')),
      password: passwordSchema,
      vehicle: z.string().trim().min(2).max(60),
      licenseNo: z.string().trim().min(4).max(30),
      aadhaarLast4: z.string().regex(/^\d{4}$/, 'Enter the last 4 digits of Aadhaar'),
      bankAccountLast4: z.string().regex(/^\d{4}$/, 'Enter the last 4 digits of your bank account'),
      ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/i, 'Enter a valid IFSC code'),
    })
    .parse(req.body)
  const taken = await User.exists({ $or: [{ phone: body.phone }, ...(body.email ? [{ email: body.email.toLowerCase() }] : [])] })
  if (taken) throw httpError(409, 'An account with these details already exists. Try logging in instead.')
  const user = await User.create({
    name: body.name,
    phone: body.phone,
    email: body.email || undefined,
    password: body.password,
    role: 'delivery',
    delivery: {
      vehicle: body.vehicle,
      licenseNo: body.licenseNo,
      aadhaarLast4: body.aadhaarLast4,
      bankAccountLast4: body.bankAccountLast4,
      ifsc: body.ifsc.toUpperCase(),
      kycStatus: 'pending',
    },
  })
  await finishLogin(req, res, user)
})

export default router
