import app from './app.js'
import { connectDB } from './config/db.js'
import { env, validateEnv } from './config/env.js'
import { scheduleJobs } from './jobs/billing.js'
import { migrate } from './migrate.js'
import User from './models/User.js'
import { ensureSuperadmin, seed } from './seed.js'
import { logger } from './utils/logger.js'

const { warnings } = validateEnv()
for (const w of warnings) logger.warn(`Config: ${w}`)

const { isMemory } = await connectDB()
const empty = (await User.countDocuments()) === 0
// Demo data (with its well-known demo passwords) is only ever loaded in development.
// A new production database gets just the owner account from SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD.
if (!env.isProd && (isMemory || empty)) await seed({ reset: isMemory })
else if (env.isProd && empty) await ensureSuperadmin()
await migrate()
scheduleJobs()

const server = app.listen(env.port, () => {
  console.log(`🚀 Gavyora API running on http://localhost:${env.port} (${env.nodeEnv})`)
  if (!env.isProd) {
    console.log(`
  Demo logins (development only)
  ───────────────────────────────────────────────
  Super admin  ${env.superadminEmail} / ${env.superadminPassword}
  Admin        admin@gavyora.com / Admin@123
  Delivery     rider@gavyora.com / Delivery@123
  Customer     customer@gavyora.com / Customer@123
`)
  }
})
// Slow or stalled clients must not hold connections open forever.
server.requestTimeout = 30_000
server.headersTimeout = 20_000
server.keepAliveTimeout = 5_000
