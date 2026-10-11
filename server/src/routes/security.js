// Super admin: run the security audit and read the latest result.
import { Router } from 'express'
import { allow, protect } from '../middleware/auth.js'
import { limits } from '../middleware/rateLimit.js'
import { noStore } from '../middleware/security.js'
import { audit } from '../utils/services.js'

const router = Router()
router.use(protect, allow('superadmin'), noStore)

let latest = null

router.get('/audit', (_req, res) => res.json({ report: latest }))

router.post('/audit', limits.audit, async (req, res) => {
  // Loaded lazily: the audit inspects the app, which itself mounts this router.
  const [{ runAudit }, { default: app, MOUNTS }] = await Promise.all([import('../security/audit.js'), import('../app.js')])
  latest = await runAudit({ app, mounts: MOUNTS, db: true })
  const s = latest.summary
  await audit(req, 'security.audit', 'Security', null, `${latest.overall}: ${s.pass} pass, ${s.warning} warning, ${s.fail} fail, ${s.notChecked} not checked`)
  res.json({ report: latest })
})

export default router
