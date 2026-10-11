// `npm run security:deps`: run `npm audit` for the root, server and client packages and save a summary that the
// security audit and dashboard read. Uses execFile (no shell) with fixed arguments.
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { DEPENDENCY_REPORT } from '../src/security/audit.js'

const root = path.resolve(path.dirname(DEPENDENCY_REPORT), '../..')
const npmCli = process.env.npm_execpath
if (!npmCli) {
  console.error('Run this through npm: npm run security:deps')
  process.exit(2)
}

const run = (cwd) =>
  new Promise((resolve) =>
    execFile(process.execPath, [npmCli, 'audit', '--json'], { cwd, timeout: 120000, maxBuffer: 32 * 1024 * 1024 }, (_err, stdout) => resolve(stdout)),
  )

const packages = []
for (const [name, dir] of [['root', root], ['server', path.join(root, 'server')], ['client', path.join(root, 'client')]]) {
  try {
    const json = JSON.parse(await run(dir))
    if (json.error) throw new Error(json.error.summary || 'npm audit failed')
    const v = json.metadata?.vulnerabilities || {}
    const advisories = Object.values(json.vulnerabilities || {}).map((x) => ({ name: x.name, severity: x.severity, range: x.range, fixAvailable: !!x.fixAvailable }))
    packages.push({ name, counts: { low: v.low || 0, moderate: v.moderate || 0, high: v.high || 0, critical: v.critical || 0 }, advisories })
  } catch (e) {
    packages.push({ name, error: e.message.slice(0, 200) })
  }
}

fs.mkdirSync(path.dirname(DEPENDENCY_REPORT), { recursive: true })
fs.writeFileSync(DEPENDENCY_REPORT, JSON.stringify({ generatedAt: new Date().toISOString(), packages }, null, 2))
for (const p of packages) console.log(p.error ? `${p.name}: audit failed: ${p.error}` : `${p.name}: ${JSON.stringify(p.counts)}`)
console.log(`Saved ${path.relative(root, DEPENDENCY_REPORT)}`)
