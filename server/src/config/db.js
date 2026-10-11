import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import mongoose from 'mongoose'
import { env } from './env.js'

// Filters only match schema fields; unknown keys are dropped instead of reaching MongoDB.
mongoose.set('strictQuery', true)

let memoryServer

const isAlive = (pid) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Remove temp folders left behind by in-memory MongoDB instances that are no longer running. */
function removeStaleMemoryDbs() {
  const tmp = os.tmpdir()
  for (const name of fs.readdirSync(tmp).filter((n) => n.startsWith('mongo-mem-'))) {
    const dir = path.join(tmp, name)
    try {
      const pid = Number(fs.readFileSync(path.join(dir, 'mongod.lock'), 'utf8').trim())
      if (pid && isAlive(pid)) continue
      fs.rmSync(dir, { recursive: true, force: true })
    } catch {
      /* in use or already gone */
    }
  }
}

export async function connectDB() {
  let uri = env.mongoUri
  let isMemory = false
  if (!uri) {
    removeStaleMemoryDbs()
    const { MongoMemoryServer } = await import('mongodb-memory-server')
    memoryServer = await MongoMemoryServer.create()
    uri = memoryServer.getUri('gavyora')
    isMemory = true
    // Each in-memory instance writes ~200 MB to the temp folder; delete it when the server
    // stops (Ctrl+C, nodemon/--watch restarts) so repeated restarts don't fill the disk.
    const shutdown = async () => {
      await disconnectDB().catch(() => {})
      process.exit(0)
    }
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGUSR2', 'SIGHUP']) process.once(sig, shutdown)
    console.log('⚠️  MONGO_URI not set — using in-memory MongoDB (data resets on restart)')
  }
  await mongoose.connect(uri)
  console.log('✅ MongoDB connected')
  return { isMemory }
}

export async function disconnectDB() {
  await mongoose.disconnect()
  if (memoryServer) await memoryServer.stop({ doCleanup: true, force: true })
}
