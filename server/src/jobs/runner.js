// Runs a background job at most once at a time across all API instances (a lease in MongoDB), records every run
// for the System health page, and never throws (a failed run is logged and retried on the next tick).
import crypto from 'node:crypto'
import { JobLock, JobRun } from '../models/billing.js'
import { logger } from '../utils/logger.js'

const OWNER = crypto.randomUUID()

export async function runJob(name, fn, { leaseMs = 10 * 60 * 1000 } = {}) {
  const now = new Date()
  let lock
  try {
    lock = await JobLock.findOneAndUpdate(
      { _id: name, $or: [{ until: { $lt: now } }, { until: null }] },
      { $set: { until: new Date(now.getTime() + leaseMs), owner: OWNER } },
      { upsert: true, returnDocument: 'after' },
    )
  } catch (e) {
    if (e.code === 11000) return { skipped: 'already running' } // another instance holds the lease
    throw e
  }
  if (!lock || lock.owner !== OWNER) return { skipped: 'already running' }
  const run = await JobRun.create({ name, startedAt: now })
  try {
    const result = await fn()
    Object.assign(run, { finishedAt: new Date(), ok: true, result })
    return result
  } catch (e) {
    Object.assign(run, { finishedAt: new Date(), ok: false, error: String(e.message).slice(0, 500) })
    logger.error(`Job ${name} failed`, { error: e })
    return { error: e.message }
  } finally {
    await run.save().catch(() => {})
    await JobLock.updateOne({ _id: name, owner: OWNER }, { $set: { until: new Date(0) } }).catch(() => {})
  }
}

/** Keep the run history small: last 500 runs per job. */
export async function pruneJobRuns() {
  const names = await JobRun.distinct('name')
  for (const name of names) {
    const keep = await JobRun.find({ name }).sort('-startedAt').skip(500).limit(1).select('startedAt')
    if (keep[0]) await JobRun.deleteMany({ name, startedAt: { $lte: keep[0].startedAt } })
  }
}
