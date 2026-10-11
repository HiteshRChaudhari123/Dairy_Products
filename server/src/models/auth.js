// Login sessions and phone OTPs.
import mongoose from 'mongoose'

const { Schema, model } = mongoose

/**
 * One document per refresh token. A login starts a "family"; every refresh rotates the token (the old one is revoked
 * and points at its replacement). Presenting a revoked token outside the short grace window means it was stolen and
 * replayed, so the whole family is revoked. Logging out revokes the family, which also kills its access tokens.
 */
export const Session = model(
  'Session',
  new Schema(
    {
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
      jti: { type: String, required: true, unique: true },
      family: { type: String, required: true, index: true },
      expiresAt: { type: Date, required: true, index: { expires: 0 } },
      revokedAt: Date,
      replacedBy: String,
      userAgent: String,
    },
    { timestamps: true },
  ),
)

/** A pending phone OTP. Stored hashed, expires after 5 minutes, and is burned after 5 wrong guesses. */
export const OtpCode = model(
  'OtpCode',
  new Schema(
    {
      phone: { type: String, required: true, unique: true },
      hash: { type: String, required: true },
      attempts: { type: Number, default: 0 },
      expiresAt: { type: Date, required: true, index: { expires: 0 } },
    },
    { timestamps: true },
  ),
)
