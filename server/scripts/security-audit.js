// `npm run security:audit`: run the security audit from the command line (no database needed).
// Exits with code 1 when any check FAILs, so it can gate a CI pipeline.
import app, { MOUNTS } from '../src/app.js'
import { runAudit } from '../src/security/audit.js'

const report = await runAudit({ app, mounts: MOUNTS, db: false })
const ICON = { PASS: '✔', WARNING: '!', FAIL: '✖', 'NOT CHECKED': '?' }

console.log(`\nGavyora security audit · ${report.generatedAt} · NODE_ENV=${report.environment}\n`)
for (const c of report.checks) {
  console.log(`${ICON[c.status]} ${c.status.padEnd(11)} [${c.severity}] ${c.title}`)
  if (c.status !== 'PASS' || process.argv.includes('--verbose')) {
    for (const e of c.evidence) console.log(`      ${e}`)
    if (c.status !== 'PASS') console.log(`      → ${c.remediation}`)
  }
}
const s = report.summary
console.log(`\nOverall: ${report.overall} · ${s.pass} pass · ${s.warning} warning · ${s.fail} fail · ${s.notChecked} not checked`)
console.log(report.note + '\n')
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2))
process.exit(s.fail ? 1 : 0)
