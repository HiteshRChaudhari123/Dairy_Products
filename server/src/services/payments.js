// Payment transactions for memberships and subscriptions: start, verify, fulfil exactly once, fail, refund.
// Activation only ever follows a payment the server has verified (gateway signature or signed webhook), a wallet
// debit the server made itself, or a zero-amount checkout the server priced.
import { env } from '../config/env.js'
import { PaymentTransaction, Refund } from '../models/billing.js'
import { Setting } from '../models/misc.js'
import { httpError } from '../utils/http.js'
import { logger } from '../utils/logger.js'
import { gateway, razorpayEnabled, verifyPaymentSignature } from '../utils/razorpay.js'
import { audit, walletChange } from '../utils/services.js'
import { formatMinor, fromMinor } from './common.js'
import { invoiceForTransaction } from './invoices.js'
import { notify } from './notify.js'

// Fulfilment handlers by purpose, registered by the membership and subscription services (avoids import cycles).
const handlers = {}
export const onPaid = (purposes, fn) => purposes.forEach((p) => (handlers[p] = fn))

export function txView(tx) {
  return {
    _id: tx._id,
    purpose: tx.purpose,
    provider: tx.provider,
    status: tx.status,
    fulfilment: tx.fulfilment,
    amountMinor: tx.amountMinor,
    refundedMinor: tx.refundedMinor,
    currency: tx.currency,
    breakdown: tx.breakdown,
    membership: tx.membership,
    subscription: tx.subscription,
    paidAt: tx.paidAt,
    failureReason: tx.failureReason,
    createdAt: tx.createdAt,
  }
}

/** Create (or return the existing) transaction for this user + idempotency key. */
export async function createTransaction({ user, idempotencyKey, ...fields }) {
  const existing = await PaymentTransaction.findOne({ user: user._id, idempotencyKey })
  if (existing) return { tx: existing, replay: true }
  try {
    const tx = await PaymentTransaction.create({ user: user._id, idempotencyKey, ...fields, history: [{ status: 'created' }] })
    return { tx, replay: false }
  } catch (e) {
    if (e.code === 11000) return { tx: await PaymentTransaction.findOne({ user: user._id, idempotencyKey }), replay: true }
    throw e
  }
}

/**
 * Collect the money for a new transaction. Razorpay: create the gateway order and return what the checkout widget
 * needs (the payment is verified later). Wallet: debit now. Free: nothing to collect.
 */
export async function collect(tx, user) {
  if (tx.provider === 'razorpay') {
    if (!razorpayEnabled()) throw httpError(400, 'Online payment is not configured yet. Please pay from your wallet.')
    if (!tx.providerOrderId) {
      const rp = await gateway.createOrder(tx.amountMinor, `tx-${tx._id}`, { transaction: String(tx._id), purpose: tx.purpose })
      if (rp.amount !== tx.amountMinor) throw httpError(502, 'The payment gateway returned a different amount')
      tx.providerOrderId = rp.id
      await tx.save()
    }
    return { razorpay: { keyId: env.razorpayKeyId, orderId: tx.providerOrderId, amount: tx.amountMinor, currency: tx.currency, name: user.name, email: user.email, contact: user.phone } }
  }
  if (tx.status === 'created') {
    if (tx.provider === 'wallet' && tx.amountMinor > 0) {
      try {
        await walletChange(user._id, -fromMinor(tx.amountMinor), `Payment for ${tx.purpose.replaceAll('_', ' ')} (${tx._id})`)
      } catch (e) {
        await failTransaction(tx._id, e.message)
        throw e
      }
    }
    await markPaid(tx._id, { note: tx.provider === 'wallet' ? 'Paid from wallet' : 'No payment due' })
  }
  await fulfil(tx._id)
  return {}
}

/** created/failed/expired → paid, once. Returns the updated transaction, or null if it was already paid. */
export async function markPaid(txId, { paymentId, note } = {}) {
  return PaymentTransaction.findOneAndUpdate(
    { _id: txId, status: { $in: ['created', 'failed', 'expired'] } },
    { $set: { status: 'paid', paidAt: new Date(), ...(paymentId ? { providerPaymentId: paymentId } : {}) }, $push: { history: { status: 'paid', note } } },
    { returnDocument: 'after' },
  )
}

export async function failTransaction(txId, reason) {
  const tx = await PaymentTransaction.findOneAndUpdate(
    { _id: txId, status: 'created' },
    { $set: { status: 'failed', failureReason: String(reason || 'Payment failed').slice(0, 300) }, $push: { history: { status: 'failed', note: reason } } },
    { returnDocument: 'after' },
  )
  if (tx) await notify(tx.user, 'payment_failed', { amount: formatMinor(tx.amountMinor) }, { key: `payfail:${tx._id}`, link: '/account/billing' })
  return tx
}

/** Run the purpose's activation exactly once for a paid transaction, then issue the invoice. */
export async function fulfil(txId) {
  const tx = await PaymentTransaction.findOneAndUpdate({ _id: txId, status: 'paid', fulfilment: { $in: ['pending', 'failed'] } }, { fulfilment: 'running' }, { returnDocument: 'after' })
  if (!tx) return PaymentTransaction.findById(txId)
  try {
    const handler = handlers[tx.purpose]
    if (!handler) throw new Error(`No handler for ${tx.purpose}`)
    await handler(tx)
    await invoiceForTransaction(tx)
    tx.fulfilment = 'done'
    tx.fulfilmentError = undefined
  } catch (e) {
    tx.fulfilment = 'failed'
    tx.fulfilmentError = String(e.message).slice(0, 300)
    logger.error('Payment fulfilment failed', { transaction: String(tx._id), error: e })
  }
  await tx.save()
  return tx
}

/** Browser-side Razorpay success: verify the signature server-side, then fulfil. */
export async function verifyGatewayPayment(tx, { razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
  if (tx.provider !== 'razorpay' || tx.providerOrderId !== razorpay_order_id) throw httpError(404, 'Payment not found')
  if (tx.status === 'paid' || tx.status === 'refunded' || tx.status === 'partially_refunded') return fulfil(tx._id)
  if (!verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    await failTransaction(tx._id, 'Payment signature did not match')
    throw httpError(400, 'Payment verification failed')
  }
  await markPaid(tx._id, { paymentId: razorpay_payment_id, note: 'Verified checkout signature' })
  return fulfil(tx._id)
}

/**
 * Signed Razorpay webhook for a membership/subscription payment or refund. Returns true when it was ours.
 * Safe to receive more than once: every step is conditional on the current state.
 */
export async function handleGatewayEvent(event) {
  const payment = event.payload?.payment?.entity
  if (payment && ['payment.captured', 'order.paid', 'payment.failed'].includes(event.event)) {
    const tx = await PaymentTransaction.findOne({ providerOrderId: payment.order_id })
    if (!tx) return false
    if (event.event === 'payment.failed') {
      await failTransaction(tx._id, payment.error_description || 'Payment failed at the gateway')
      return true
    }
    if (payment.amount !== tx.amountMinor || payment.currency !== tx.currency) {
      logger.warn('Webhook amount mismatch', { transaction: String(tx._id), amount: payment.amount })
      return true
    }
    await markPaid(tx._id, { paymentId: payment.id, note: `Webhook ${event.event}` })
    await fulfil(tx._id)
    return true
  }
  const refund = event.payload?.refund?.entity
  if (refund && ['refund.processed', 'refund.failed'].includes(event.event)) {
    const r = await Refund.findOne({ providerRefundId: refund.id })
    if (!r) return false
    if (event.event === 'refund.processed') await settleRefund(r, 'succeeded', 'Confirmed by the payment gateway')
    else await settleRefund(r, 'failed', refund.error_description || 'The gateway could not process the refund')
    return true
  }
  return false
}

// ───────────── Refunds ─────────────

const refundable = (tx) => tx.amountMinor - (tx.refundedMinor || 0)

/** Refund amounts already promised but not finished (so two requests can't exceed the payment). */
async function pendingRefundsMinor(txId) {
  const [agg] = await Refund.aggregate([{ $match: { transaction: txId, status: { $in: ['requested', 'approved'] } } }, { $group: { _id: null, n: { $sum: '$amountMinor' } } }])
  return agg?.n || 0
}

/** Admins can refund up to the configured limit (with the refunds permission); super admins without limit. */
export async function canApproveRefund(user, amountMinor) {
  if (user?.role === 'superadmin') return true
  if (user?.role !== 'admin' || !user.permissions?.includes('refunds')) return false
  const { billing } = await Setting.get()
  return amountMinor <= (billing?.refundApprovalLimitMinor ?? 0)
}

/**
 * Create a refund for a paid transaction. `auto` refunds (a policy the customer bought, e.g. pro-rata cancellation)
 * and refunds within the requester's approval limit are processed immediately; others wait for a super admin.
 */
export async function requestRefund({ tx, amountMinor, reason, destination = 'wallet', req, auto = false }) {
  if (!['paid', 'partially_refunded'].includes(tx.status)) throw httpError(400, 'Only paid transactions can be refunded')
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) throw httpError(400, 'Enter a refund amount')
  if (amountMinor > refundable(tx) - (await pendingRefundsMinor(tx._id))) throw httpError(400, `At most ${formatMinor(refundable(tx))} can be refunded`)
  if (destination === 'source' && (tx.provider !== 'razorpay' || !tx.providerPaymentId)) throw httpError(400, 'This payment can only be refunded to the wallet')
  const refund = await Refund.create({
    transaction: tx._id,
    user: tx.user,
    membership: tx.membership,
    subscription: tx.subscription,
    amountMinor,
    currency: tx.currency,
    destination,
    reason,
    requestedBy: req?.user?._id,
    history: [{ status: 'requested', note: reason, by: req?.user?.name || 'system' }],
  })
  if (auto || (await canApproveRefund(req?.user, amountMinor))) return approveRefund(refund, { req, note: auto ? 'Automatic (plan policy)' : 'Within approval limit' })
  await notify(tx.user, 'refund_update', { status: 'requested', amount: formatMinor(amountMinor), reason }, { key: `refund:${refund._id}:requested` })
  return refund
}

/** Approve and process a refund: wallet refunds complete now; gateway refunds complete when the gateway confirms. */
export async function approveRefund(refund, { req, note } = {}) {
  const claimed = await Refund.findOneAndUpdate(
    { _id: refund._id, status: 'requested' },
    { $set: { status: 'approved', decidedBy: req?.user?._id, decisionNote: note }, $push: { history: { status: 'approved', note, by: req?.user?.name || 'system' } } },
    { returnDocument: 'after' },
  )
  if (!claimed) throw httpError(409, 'This refund has already been decided')
  // Reserve the amount on the transaction before money moves, so it can never be refunded twice.
  if (claimed.transaction) {
    const ok = await PaymentTransaction.findOneAndUpdate(
      { _id: claimed.transaction, $expr: { $lte: [{ $add: ['$refundedMinor', claimed.amountMinor] }, '$amountMinor'] } },
      { $inc: { refundedMinor: claimed.amountMinor } },
      { returnDocument: 'after' },
    )
    if (!ok) return settleRefund(claimed, 'failed', 'Amount exceeds what is left to refund', { release: false })
  }
  try {
    if (claimed.destination === 'wallet') {
      await walletChange(claimed.user, fromMinor(claimed.amountMinor), `Refund: ${claimed.reason}`)
      return settleRefund(claimed, 'succeeded', 'Credited to wallet')
    }
    if (!razorpayEnabled()) throw new Error('Online refunds need the payment gateway to be configured')
    const tx = await PaymentTransaction.findById(claimed.transaction)
    const r = await gateway.refund(tx.providerPaymentId, claimed.amountMinor, { refund: String(claimed._id) })
    claimed.providerRefundId = r.id
    claimed.status = 'processing'
    claimed.history.push({ status: 'processing', note: `Gateway refund ${r.id}`, by: 'system' })
    await claimed.save()
    if (r.status === 'processed') return settleRefund(claimed, 'succeeded', 'Processed by the payment gateway')
    return claimed
  } catch (e) {
    return settleRefund(claimed, 'failed', e.message)
  } finally {
    if (req) await audit(req, 'refund.approve', 'Refund', claimed._id, `${formatMinor(claimed.amountMinor)} (${claimed.destination})`)
  }
}

export async function rejectRefund(refund, { req, note }) {
  const r = await Refund.findOneAndUpdate(
    { _id: refund._id, status: 'requested' },
    { $set: { status: 'rejected', decidedBy: req.user._id, decisionNote: note }, $push: { history: { status: 'rejected', note, by: req.user.name } } },
    { returnDocument: 'after' },
  )
  if (!r) throw httpError(409, 'This refund has already been decided')
  await audit(req, 'refund.reject', 'Refund', r._id, note)
  await notify(r.user, 'refund_update', { status: 'rejected', amount: formatMinor(r.amountMinor), reason: note }, { key: `refund:${r._id}:rejected` })
  return r
}

/** Final refund state. A failed refund releases the reserved amount on the transaction. */
async function settleRefund(refund, status, note, { release = true } = {}) {
  const r = await Refund.findOneAndUpdate(
    { _id: refund._id, status: { $in: ['approved', 'processing'] } },
    { $set: { status, ...(status === 'failed' ? { failureReason: note } : {}) }, $push: { history: { status, note, by: 'system' } } },
    { returnDocument: 'after' },
  )
  if (!r) return Refund.findById(refund._id)
  if (r.transaction) {
    if (status === 'failed' && release) await PaymentTransaction.updateOne({ _id: r.transaction }, { $inc: { refundedMinor: -r.amountMinor } })
    const tx = await PaymentTransaction.findById(r.transaction)
    if (tx && status === 'succeeded') {
      tx.status = tx.refundedMinor >= tx.amountMinor ? 'refunded' : 'partially_refunded'
      tx.history.push({ status: tx.status, note: `${formatMinor(r.amountMinor)} refunded` })
      await tx.save()
    }
  }
  await notify(r.user, 'refund_update', { status, amount: formatMinor(r.amountMinor), reason: r.reason }, { key: `refund:${r._id}:${status}`, link: '/account/billing' })
  return r
}

/** Record a refund that is not tied to a gateway payment (prepaid balance returned to the wallet). */
export async function recordBalanceRefund({ user, subscription, amountMinor, reason, req }) {
  await walletChange(user, fromMinor(amountMinor), `Refund: ${reason}`)
  return Refund.create({
    user,
    subscription,
    amountMinor,
    destination: 'wallet',
    reason,
    status: 'succeeded',
    requestedBy: req?.user?._id,
    history: [{ status: 'succeeded', note: 'Unused prepaid balance credited to wallet', by: req?.user?.name || 'system' }],
  })
}
