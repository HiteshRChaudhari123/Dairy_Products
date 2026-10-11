// Delivery photo proofs: decode, check it is really an image, store, and serve.
import { DeliveryProof } from '../models/misc.js'
import Order from '../models/Order.js'
import { httpError } from '../utils/http.js'

export const MAX_PROOF_BYTES = 400 * 1024

/** The image type from its first bytes (never from the client's claim), or null. */
export function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  return null
}

/** Store (or replace) the proof for an order from a base64 data URL. */
export async function saveProof(order, user, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
  if (!m) throw httpError(400, 'Upload a JPEG, PNG or WebP photo')
  const data = Buffer.from(m[2], 'base64')
  if (data.length > MAX_PROOF_BYTES) throw httpError(413, 'The photo is too large. Please retake it.')
  const contentType = sniffImage(data)
  if (!contentType) throw httpError(400, 'That file is not a photo')
  await DeliveryProof.findOneAndUpdate(
    { order: order._id },
    { $set: { by: user._id, contentType, size: data.length, data } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  )
  await Order.updateOne({ _id: order._id }, { $set: { proofAt: new Date() } })
}

/** Send the proof image for an order the caller is already allowed to see. */
export async function sendProof(res, orderId) {
  const proof = await DeliveryProof.findOne({ order: orderId })
  if (!proof) throw httpError(404, 'No photo for this order')
  res.set({ 'Content-Type': proof.contentType, 'Cache-Control': 'private, no-store', 'Content-Disposition': 'inline' })
  res.send(proof.data)
}
