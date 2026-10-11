// Invoices for membership and subscription payments, numbered sequentially per Indian financial year.
import { Counter, Invoice } from '../models/billing.js'
import { Setting } from '../models/misc.js'
import User from '../models/User.js'

/** "25-26" for any date between 1 April 2025 and 31 March 2026. */
export function financialYear(d = new Date()) {
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`
}

export async function nextInvoiceNumber(prefix = 'GV', d = new Date()) {
  const fy = financialYear(d)
  const c = await Counter.findOneAndUpdate({ _id: `invoice:${fy}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })
  return `${prefix}/${fy}/${String(c.seq).padStart(6, '0')}`
}

/** One invoice per paid transaction (safe to call repeatedly). */
export async function invoiceForTransaction(tx) {
  const existing = await Invoice.findOne({ transaction: tx._id })
  if (existing) return existing
  const [settings, user] = await Promise.all([Setting.get(), User.findById(tx.user)])
  const b = tx.breakdown || {}
  const addr = user?.addresses?.find((a) => a.isDefault) || user?.addresses?.[0]
  try {
    return await Invoice.create({
      number: await nextInvoiceNumber(settings.billing?.invoicePrefix || 'GV'),
      user: tx.user,
      transaction: tx._id,
      billTo: {
        name: user?.name,
        email: user?.email,
        phone: user?.phone,
        address: addr ? [addr.line1, addr.line2, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ') : '',
      },
      lines: b.lines || [{ description: tx.purpose, qty: 1, unitMinor: tx.amountMinor, amountMinor: tx.amountMinor }],
      subtotalMinor: b.subtotalMinor ?? tx.amountMinor,
      discountMinor: b.discountMinor || 0,
      taxPercent: b.taxPercent || 0,
      taxMinor: b.taxMinor || 0,
      totalMinor: tx.amountMinor,
      currency: tx.currency,
      issuedAt: tx.paidAt || new Date(),
      seller: { name: settings.storeName, address: settings.address, gstNo: settings.gstNo, fssaiNo: settings.fssaiNo },
    })
  } catch (e) {
    if (e.code === 11000) return Invoice.findOne({ transaction: tx._id })
    throw e
  }
}
