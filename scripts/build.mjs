// `npm run build` from the repository root: build the website, and make sure the API's packages are installed so
// `npm start` works right after (one-service hosting such as Render: npm install; npm run build; npm start).
// On a host (Render/CI) the API gets production packages only; on a developer machine its dev tools are kept.
import { execSync } from 'node:child_process'

const onHost = !!(process.env.RENDER || process.env.CI || process.env.NODE_ENV === 'production')
const run = (cmd) => {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { stdio: 'inherit' })
}

run('npm --prefix client ci --include=dev --no-audit --no-fund')
run('npm --prefix client run build')
run(onHost ? 'npm --prefix server ci --omit=dev --no-audit --no-fund' : 'npm --prefix server install --no-audit --no-fund')
