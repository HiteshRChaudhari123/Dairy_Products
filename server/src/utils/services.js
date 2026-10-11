import { AuditLog, WalletTransaction } from '../models/misc.js'
import User from '../models/User.js'
import { httpError } from './http.js'

export async function audit(req, action, entity, entityId, details = '') {
  try {
    await AuditLog.create({
      actor: req.user?._id,
      actorName: req.user?.name,
      role: req.user?.role,
      action,
      entity,
      entityId: entityId ? String(entityId) : undefined,
      details,
    })
  } catch (e) {
    console.error('audit log failed', e.message)
  }
}

/** Atomically credit (+) or debit (-) a user's wallet and record the transaction. */
export async function walletChange(userId, amount, reason, orderId) {
  const filter = { _id: userId }
  if (amount < 0) filter.wallet = { $gte: -amount }
  const user = await User.findOneAndUpdate(filter, { $inc: { wallet: amount } }, { returnDocument: 'after' })
  if (!user) throw httpError(400, 'Insufficient wallet balance')
  await WalletTransaction.create({
    user: userId,
    type: amount >= 0 ? 'credit' : 'debit',
    amount: Math.abs(amount),
    reason,
    balanceAfter: user.wallet,
    order: orderId,
  })
  return user.wallet
}
