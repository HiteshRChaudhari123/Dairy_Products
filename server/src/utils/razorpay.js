import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { httpError } from './http.js'

export const razorpayEnabled = () => !!(env.razorpayKeyId && env.razorpayKeySecret)

async function call(path, body) {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString('base64'),
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw httpError(502, data?.error?.description || 'The payment gateway did not respond. Please try again.')
  return data
}

/**
 * Gateway calls in one object so they can be replaced in tests (no network) or by another provider later.
 * Amounts are integer paise.
 */
export const gateway = {
  createOrder: (amountMinor, receipt, notes = {}) => call('/orders', { amount: amountMinor, currency: 'INR', receipt: String(receipt).slice(0, 40), notes }),
  refund: (paymentId, amountMinor, notes = {}) => call(`/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountMinor, notes }),
}

export async function createRazorpayOrder(amountRupees, receipt) {
  return gateway.createOrder(Math.round(amountRupees * 100), receipt)
}

const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

export function verifyPaymentSignature(orderId, paymentId, signature) {
  const expected = crypto.createHmac('sha256', env.razorpayKeySecret).update(`${orderId}|${paymentId}`).digest('hex')
  return safeEqual(expected, signature || '')
}

export function verifyWebhookSignature(rawBody, signature) {
  const secret = env.razorpayWebhookSecret
  if (!secret) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  return safeEqual(expected, signature || '')
}
