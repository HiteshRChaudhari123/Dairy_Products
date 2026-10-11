// Safe, repeatable data migrations, run on every start (each step only touches documents that still need it).
// Also available as `npm run migrate` against MONGO_URI.
import mongoose from 'mongoose'
import { fileURLToPath } from 'node:url'
import { env } from './config/env.js'
import { Setting } from './models/misc.js'
import Subscription from './models/Subscription.js'
import { logger } from './utils/logger.js'

export async function migrate() {
  const out = { subscriptions: 0 }
  // 1. Single-product subscriptions → item baskets (the model's pre-validate hook converts them on save).
  const legacy = await Subscription.find({ $or: [{ items: { $exists: false } }, { items: { $size: 0 } }], product: { $exists: true } })
  for (const sub of legacy) {
    try {
      await sub.save()
      out.subscriptions++
    } catch (e) {
      logger.error('Subscription migration failed', { subscription: String(sub._id), error: e })
    }
  }
  // 2. Billing settings defaults on older settings documents.
  const s = await Setting.get()
  if (!s.billing?.deliveryCutoff) {
    s.billing = { ...(s.billing?.toObject?.() || {}) }
    await s.save()
  }
  // 3. New indexes (unique delivery per subscription per day, membership live key, payment ids).
  await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).createIndexes().catch((e) => logger.error(`Index build failed for ${n}`, { error: e }))))
  if (out.subscriptions) logger.info('Migrations applied', out)
  return out
}

// `npm run migrate`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!env.mongoUri) {
    console.log('Set MONGO_URI in server/.env to migrate a real database.')
    process.exit(1)
  }
  await mongoose.connect(env.mongoUri)
  // Models must be registered before createIndexes runs.
  await import('./models/billing.js')
  await import('./models/Order.js')
  console.log(await migrate())
  await mongoose.disconnect()
}
